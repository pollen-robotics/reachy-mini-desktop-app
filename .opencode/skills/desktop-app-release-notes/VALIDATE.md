---
name: desktop-app-release-notes:validate
description: Fix Reachy Mini Control release notes by adding missing PRs and removing extra PRs. Use when the release notes don't match the PR files exactly.
---

# Fix Release Notes

## Overview

The release notes must mention every PR of the release exactly once, and no other PR.
The prompt gives the output directory as `<output_dir>`, the notes file, and the PR
numbers that are missing and extra.

## Workflow

1. Read the notes at `<output_dir>/RELEASE_NOTES_<version>.md`.
2. For each **missing** PR, read `<output_dir>/tmp/pr_<number>.json` and add it:
   - with the `highlight` label, as a new highlight section (emoji header, 2-4 sentence
     summary, attribution line);
   - otherwise as a bullet in the matching section from `references/sections.md`,
     creating the section if needed.
   Follow the main skill's **Bullet style** rules.
3. For each **extra** PR, remove every line that references it. Remove a highlight or
   section left empty. Never remove a PR that has a file in `<output_dir>/tmp/`.
4. Make sure no text other than an attribution reads `in #<number>`.
5. Write the file back to the same path.

## Resources

- `references/sections.md`: section mapping
