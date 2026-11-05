"""Run from the repo root: python3 -m unittest scripts.release_notes.test_generate_release_notes"""

import unittest

from .generate_release_notes import (
    check_notes,
    is_release_worthy,
    pr_numbers_from_subjects,
)


class PrNumbersFromSubjects(unittest.TestCase):
    def test_merge_and_squash_commits(self):
        subjects = [
            "Merge pull request #310 from nathansegers/fix/webrtc",
            "fix(ui): keep emoji tiles a sane size (#323)",
            "bump: version 0.9.36",
            "Merge pull request #310 from nathansegers/fix/webrtc",
        ]
        self.assertEqual(pr_numbers_from_subjects(subjects), [310, 323])

    def test_ignores_issue_mentions_mid_title(self):
        self.assertEqual(pr_numbers_from_subjects(["Fix #272 crash on launch"]), [])


class CheckNotes(unittest.TestCase):
    def test_missing_and_extra(self):
        notes = "- Resizable window by @a in #322\n- Older change by @b in #299\n"
        self.assertEqual(check_notes(notes, {322, 323}), ([323], [299]))

    def test_issue_references_are_not_extra(self):
        notes = "Fixes the crash from issue #272.\n- Validate URLs by @a in #316\n"
        self.assertEqual(check_notes(notes, {316}), ([], []))


class IsReleaseWorthy(unittest.TestCase):
    def pr(self, **overrides):
        return {"is_bot": False, "labels": [], "head_branch": "feat/x", **overrides}

    def test_skips_bots_dependency_and_sync_prs(self):
        self.assertTrue(is_release_worthy(self.pr()))
        self.assertFalse(is_release_worthy(self.pr(is_bot=True)))
        self.assertFalse(is_release_worthy(self.pr(labels=["dependencies"])))
        self.assertFalse(is_release_worthy(self.pr(head_branch="develop")))


if __name__ == "__main__":
    unittest.main()
