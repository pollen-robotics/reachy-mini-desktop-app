---
name: desktop-app-release-notes
description: Generate Reachy Mini Control (desktop app) release notes from cached PR JSON files. Use when asked to draft release notes from PR files.
---

# Reachy Mini Control Release Notes

## Overview

Generate release notes for Reachy Mini Control, the desktop app (Tauri, macOS / Windows /
Linux) that runs and controls the Reachy Mini robot. Read cached PR metadata, group the
changes, and write one markdown document for users of the app.

**Output directory:** the prompt gives it as `<output_dir>`. All paths below use this placeholder.

## Workflow

### 1. Read PR data

Read every `<output_dir>/tmp/pr_*.json`. Each file contains:

```json
{
  "number": 322,
  "title": "feat(window): make the main window resizable on all platforms",
  "author": "username",
  "is_bot": false,
  "merged_at": "2026-10-22T10:30:00Z",
  "body": "...",
  "labels": ["enhancement"],
  "url": "https://github.com/pollen-robotics/reachy-mini-desktop-app/pull/322",
  "head_branch": "feat/resizable-window-all-platforms"
}
```

Read the body: it usually says what was broken and for whom, which the title alone does not.

### 2. Identify highlights

Highlight a PR if it has the `highlight` label, or if you judge it a change users will
notice and care about (a new feature, a visible UX change, a fix for a widely hit
problem). Most releases have zero to three highlights; small releases may have none.
Several PRs on the same feature belong in one highlight.

Each highlight section has:

1. **Emoji header**, e.g. `## 🪟 Resizable window`
2. **Prose summary**: 2-4 sentences on what the user sees or can now do, written for app
   users, not developers. No bullets unless listing 4+ distinct sub-features.
3. **PR attribution lines**, one per contributing PR: `- <summary> by @author in #322`.
   The prose carries the detail, so these are short titles, e.g.
   `- Resizable main window on all platforms by @author in #322`.

### 3. Classify the other PRs

Put every non-highlight PR in one section from `references/sections.md`, using its
labels, title and body.

### 4. Write the notes

Write `<output_dir>/RELEASE_NOTES_<version>.md` following `references/release-notes-template.md`:

- First line: `# Reachy Mini Control <version>: <tagline>`, the tagline summing up the
  main changes in a few words. Use the version exactly as given in the prompt.
- Highlights first, then standard sections. Only include sections that have items.

### 5. Bullet style (every bullet, highlights included)

The text before `by @author in #322` is a summary you write. **Do not paste the PR or
branch title.**

- Keep it short: a title of at most about 12 words, not a sentence explaining the change.
  E.g. `Re-embed apps when their pop-out window closes`, not `A running app comes back
  to the embedded view when you close its pop-out window, and ...`.
- Start with a capital letter, never with a number.
- Strip conventional-commit and branch prefixes (`feat:`, `fix(webrtc):`, `feat/…`).
  E.g. `fix(webrtc): recover when the camera stream never arrives` → `Recover when the
  camera stream never arrives`.
- Don't restate the section: in `🐛 Bug fixes` don't start with "Fix".
- When a change only affects some platforms and the summary doesn't already name them,
  end it with them in parentheses, e.g. `Smaller installer (Linux)`, `Signed installer
  (macOS, Windows)`.
- Keep the same mood and tone across the whole release. No em dashes.

### 6. Quality checks

Before finishing:
- Every PR from `<output_dir>/tmp/` appears exactly once, as `by @author in #<number>`.
- No PR without a file in `<output_dir>/tmp/` (it belongs to another release).
- No other `in #<number>` text anywhere (write issue references as "issue 272" instead).
- No empty sections.

## Input

- Version string (e.g. `v0.9.37`)
- PR JSON files in `<output_dir>/tmp/`

## Output

- `<output_dir>/RELEASE_NOTES_<version>.md`

## Resources

- `references/release-notes-template.md`: document skeleton
- `references/sections.md`: section mapping
