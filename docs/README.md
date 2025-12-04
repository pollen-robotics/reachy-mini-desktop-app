# Update Files for GitHub Pages

This directory contains the `latest.json` file used by the Tauri updater.

The file is automatically generated and deployed by GitHub Actions when a new release is published, **without committing to the main branch**.

**URL**: `https://pollen-robotics.github.io/reachy-mini-desktop-app/latest.json`

This endpoint is used instead of GitHub Releases to avoid HTTP 302 redirect issues with the Tauri updater plugin.

## How it works

1. The `Release Cross-Platform` workflow generates `latest.json` and uploads it as an artifact
2. The `Deploy to GitHub Pages` workflow downloads the artifact and deploys it directly to GitHub Pages
3. **No commits are made to the main branch** - keeping the repository history clean

## Configuration

GitHub Pages must be configured in **"GitHub Actions" mode** (not "Deploy from a branch"):

1. Go to `Settings` → `Pages`
2. Under "Source", select **"GitHub Actions"**
3. The `pages-deploy.yml` workflow will automatically deploy after each release
