#!/usr/bin/env bash
# deploy.sh — trigger a Vercel production deployment.
#
# On the Hobby plan Vercel only builds commits authored by the project owner.
# This script reads whoever is running it from git config, switches this
# repository's identity to the owner, pushes an empty commit to main so the
# build runs, then puts the previous identity back. Nothing has to be edited
# per teammate: the owner is the only constant, the rest is read by command.
set -euo pipefail

OWNER_NAME="darivnu"
OWNER_EMAIL="daniel.rivas-nunez@epitech.eu"

cd "$(git rev-parse --show-toplevel)"

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
    echo "Switch to main first (you are on $branch)." >&2
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree is not clean. Commit or stash first." >&2
    exit 1
fi

# Remember the identity in effect for this repository before touching it.
# Only the repository-local scope is changed; the global config is never edited.
previous_local_name=$(git config --local user.name || true)
previous_local_email=$(git config --local user.email || true)
current_name=$(git config user.name || true)
current_email=$(git config user.email || true)

restore_identity() {
    if [ -n "$previous_local_name" ]; then
        git config --local user.name "$previous_local_name"
    else
        git config --local --unset user.name || true
    fi
    if [ -n "$previous_local_email" ]; then
        git config --local user.email "$previous_local_email"
    else
        git config --local --unset user.email || true
    fi
    echo "Identity restored to: $(git config user.name || echo '<none>') <$(git config user.email || echo '<none>')>"
}
# Runs on success, on error and on Ctrl+C, so the identity never stays switched.
trap restore_identity EXIT

echo "Running as: ${current_name:-<none>} <${current_email:-<none>}>"

git pull --ff-only origin main

git config --local user.name "$OWNER_NAME"
git config --local user.email "$OWNER_EMAIL"
echo "Committing as: $OWNER_NAME <$OWNER_EMAIL>"

git commit --allow-empty -m "chore: trigger deployment"

git push origin main

echo "Pushed. Vercel should start building main now."
