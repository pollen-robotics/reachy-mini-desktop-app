# Update Files for GitHub Pages

This directory contains the `latest.json` file used by the Tauri updater.

The file is automatically generated and deployed by GitHub Actions when a new release is published, **without committing to the main branch**.

**URL**: `https://pollen-robotics.github.io/reachy-mini-desktop-app/latest.json`

This endpoint is used instead of GitHub Releases to avoid HTTP 302 redirect issues with the Tauri updater plugin.

## How it works

1. The `Release Cross-Platform` workflow generates `latest.json` and deploys it directly to GitHub Pages
2. **No commits are made to the main branch** - keeping the repository history clean
3. The file is automatically verified after deployment

## Configuration

**⚠️ IMPORTANT**: GitHub Pages must be configured in **"GitHub Actions" mode** (not "Deploy from a branch"):

1. Go to repository `Settings` → `Pages`
2. Under "Source", select **"GitHub Actions"** (not "Deploy from a branch")
3. The workflow will automatically deploy after each release

If GitHub Pages is not configured correctly, the deployment step will fail with a permissions error.
