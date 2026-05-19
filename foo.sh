#!/bin/bash

# Paths and branch
SRC_REPO="$(pwd)"  # current repo
TARGET_DIR="$HOME/Documents/Projects/penguinmod-desktop"
BRANCH="pm-desktop-public-non-nodejs"
NEW_BRANCH="main"

# Step 1: Make sure target directory exists
mkdir -p "$TARGET_DIR"

# Step 2: Clone only the specific branch to the new folder, preserving history
git clone --single-branch --branch "$BRANCH" "$SRC_REPO" "$TARGET_DIR"

# Step 3: Delete the branch from the original repository
cd "$SRC_REPO" || { echo "Failed to cd to $SRC_REPO"; exit 1; }
git branch -D "$BRANCH"

# Step 4: Rename the branch in the new repo to 'main'
cd "$TARGET_DIR" || { echo "Failed to cd to $TARGET_DIR"; exit 1; }
git branch -m "$BRANCH" "$NEW_BRANCH"

echo "Branch '$BRANCH' moved to '$TARGET_DIR' and renamed to '$NEW_BRANCH'."
echo "The new folder is ready to be pushed to a new GitHub repository."
