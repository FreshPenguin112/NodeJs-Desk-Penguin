#!/usr/bin/env bash
set -e

if [ -z "$TAG" ]; then
  echo "TAG is not set."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI not authenticated. Please run 'gh auth login'."
  exit 1
fi

echo "Fetching existing tags..."
git fetch --tags

# Create tag if missing
if git rev-parse "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists."
else
  echo "Creating new tag: $TAG"
  git tag "$TAG"
  git push origin "$TAG"
fi

# Create or update release
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists. Updating..."
else
  echo "Creating release for tag $TAG"
  gh release create "$TAG" --title "Release $TAG" --notes "Automated build for $TAG"
fi

# Upload zips
echo "Uploading artifacts..."
gh release upload "$TAG" penguinmod-linux.zip --clobber
gh release upload "$TAG" penguinmod-windows.zip --clobber

echo "Uploaded penguinmod-linux.zip and penguinmod-windows.zip to release $TAG"
