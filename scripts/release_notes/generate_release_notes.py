"""Generate curated release notes for one desktop app release.

Adapted from reachy_mini's utils/release_notes:
1. List the PRs merged on the first-parent history between two tags (local git)
2. Cache their metadata as JSON with `gh pr view`
3. Run the OpenCode skill in .opencode/skills/desktop-app-release-notes
4. Check every PR appears exactly once, and ask the skill to fix it if not
5. Write .release-notes/RELEASE_NOTES_<version>.md

Needs `git`, `gh` (authenticated) and `opencode` on PATH. Run from the repo root:
    python3 -m scripts.release_notes.generate_release_notes --since v0.9.35 --version v0.9.36
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUTPUT_DIR = Path(os.environ.get("RELEASE_NOTES_OUTPUT_DIR", ".release-notes"))
TMP_DIR = OUTPUT_DIR / "tmp"
SKILL = "desktop-app-release-notes"

# "Merge pull request #123 from ..." (merge commit) or "Title (#123)" (squash merge).
PR_SUBJECT_PATTERN = re.compile(r"^Merge pull request #(\d+) |\(#(\d+)\)$")
# Attribution form required by the skill: "... by @author in #123".
PR_REFERENCE_PATTERN = re.compile(r"\bin #(\d+)\b")
# Same exclusions as .github/release.yml, plus develop/main sync PRs.
SKIP_LABELS = {"skip-changelog", "dependencies"}
SKIP_HEAD_BRANCHES = {"develop", "main"}


def pr_numbers_from_subjects(subjects: list[str]) -> list[int]:
    """Extract PR numbers from first-parent commit subjects, in order, without duplicates."""
    numbers = []
    for subject in subjects:
        match = PR_SUBJECT_PATTERN.search(subject.strip())
        if match:
            number = int(match.group(1) or match.group(2))
            if number not in numbers:
                numbers.append(number)
    return numbers


def list_pr_numbers(since: str, head: str) -> list[int]:
    """List PRs merged into the release branch between two refs."""
    log = subprocess.run(
        ["git", "log", "--first-parent", "--format=%s", f"{since}..{head}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return pr_numbers_from_subjects(log.stdout.splitlines())


def fetch_pr(number: int) -> dict:
    """Fetch the PR fields the skill needs."""
    view = subprocess.run(
        ["gh", "pr", "view", str(number), "--json", "number,title,author,body,labels,url,mergedAt,headRefName"],
        check=True,
        capture_output=True,
        text=True,
    )
    pr = json.loads(view.stdout)
    return {
        "number": pr["number"],
        "title": pr["title"],
        "author": pr["author"]["login"],
        "is_bot": pr["author"].get("is_bot", False),
        "merged_at": pr["mergedAt"],
        "body": pr["body"] or "",
        "labels": [label["name"] for label in pr["labels"]],
        "url": pr["url"],
        "head_branch": pr["headRefName"],
    }


def is_release_worthy(pr: dict) -> bool:
    """Drop bot, dependency and branch-sync PRs, like the GitHub-generated notes did."""
    return not (pr["is_bot"] or SKIP_LABELS & set(pr["labels"]) or pr["head_branch"] in SKIP_HEAD_BRANCHES)


def check_notes(notes: str, expected: set[int]) -> tuple[list[int], list[int]]:
    """Return (missing, extra) PR numbers compared to the expected set."""
    found = {int(n) for n in PR_REFERENCE_PATTERN.findall(notes)}
    return sorted(expected - found), sorted(found - expected)


def check_opencode_model(model: str) -> None:
    """Fail early on an unknown model: `opencode run` exits 0 and writes nothing otherwise."""
    models = subprocess.run(["opencode", "models"], check=True, capture_output=True, text=True).stdout.split()
    if model not in models:
        raise RuntimeError(f"RELEASE_NOTES_MODEL={model!r} is not listed by `opencode models`")


def run_opencode(prompt: str) -> bool:
    """Run OpenCode non-interactively (--auto approves tool use; CI has no TTY)."""
    cmd = ["opencode", "run", "--auto"]
    if model := os.environ.get("RELEASE_NOTES_MODEL"):
        cmd += ["--model", model]
    print(f"Running OpenCode: {prompt}")
    return subprocess.run([*cmd, prompt], check=False).returncode == 0


def main(since: str, version: str, head: str, max_iterations: int) -> int:
    """Generate and validate the notes. Returns a process exit code."""
    if model := os.environ.get("RELEASE_NOTES_MODEL"):
        check_opencode_model(model)

    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    TMP_DIR.mkdir(parents=True)
    notes_file = OUTPUT_DIR / f"RELEASE_NOTES_{version}.md"

    numbers = list_pr_numbers(since, head)
    print(f"{len(numbers)} PRs merged between {since} and {head}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        prs = [pr for pr in pool.map(fetch_pr, numbers) if is_release_worthy(pr)]
    if not prs:
        print("No release-worthy PRs, keeping the GitHub-generated notes", file=sys.stderr)
        return 1
    for pr in prs:
        (TMP_DIR / f"pr_{pr['number']}.json").write_text(json.dumps(pr, indent=2))
    expected = {pr["number"] for pr in prs}
    print(f"Writing notes for {len(expected)} PRs: {', '.join(f'#{n}' for n in sorted(expected))}")

    run_opencode(
        f"Run the {SKILL} skill. The output directory is {OUTPUT_DIR}. "
        f"Generate release notes for {version} from the PR files in {TMP_DIR}/. "
        f"Output to {notes_file}"
    )
    if not notes_file.exists() or notes_file.stat().st_size == 0:
        print(f"OpenCode did not write {notes_file}, check its output above", file=sys.stderr)
        return 1

    for _ in range(max_iterations):
        missing, extra = check_notes(notes_file.read_text(), expected)
        if not missing and not extra:
            print(f"Notes cover all {len(expected)} PRs: {notes_file}")
            return 0
        print(f"Missing {missing}, extra {extra}: asking the skill to fix them")
        run_opencode(
            f"Run the {SKILL}:validate skill. The output directory is {OUTPUT_DIR}. "
            f"Fix the release notes at {notes_file}. "
            f"Add the missing PRs {', '.join(f'#{n}' for n in missing) or '(none)'} "
            f"from their {TMP_DIR}/pr_<number>.json files. "
            f"Remove the extra PRs {', '.join(f'#{n}' for n in extra) or '(none)'}."
        )

    missing, extra = check_notes(notes_file.read_text(), expected)
    if missing or extra:
        print(f"Still missing {missing}, extra {extra} after {max_iterations} fixes", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", required=True, help="Previous release tag, e.g. v0.9.35")
    parser.add_argument("--version", required=True, help="Tag being released, e.g. v0.9.36")
    parser.add_argument("--head", help="Ref to list PRs up to (default: --version)")
    parser.add_argument("--max-iterations", type=int, default=3, help="Validation fix rounds (default: 3)")
    args = parser.parse_args()
    sys.exit(main(args.since, args.version, args.head or args.version, args.max_iterations))
