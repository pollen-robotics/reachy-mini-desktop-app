# Update Files for GitHub Pages

This directory contains the `latest.json` file used by the Tauri updater.

The file is automatically updated by the GitHub Actions workflow when a new release is published.

**URL**: `https://pollen-robotics.github.io/reachy-mini-desktop-app/latest.json`

This endpoint is used instead of GitHub Releases to avoid HTTP 302 redirect issues with the Tauri updater plugin.

## Configuration

GitHub Pages must be configured in **"GitHub Actions" mode** (not "Deploy from a branch"):

1. Go to `Settings` → `Pages`
2. Under "Source", select **"GitHub Actions"**
3. The `pages-deploy.yml` workflow will automatically deploy after each release
