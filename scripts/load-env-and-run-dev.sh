#!/bin/bash

# Detect if we're in a worktree (worktrees have .git as a file, main repo has .git as a directory)
IS_WORKTREE=false
if [ -f .git ]; then
  # .git is a file = worktree
  IS_WORKTREE=true
elif [ -d .git ]; then
  # .git is a directory = main repo
  IS_WORKTREE=false
fi

# Load .env for both main repo and worktrees
# Main repo: has fixed ports (3401/3501)
# Worktrees: have dynamic ports (4500+/4600+) set by setup-worktree.sh
if [ -f .env ]; then
  if [ "$IS_WORKTREE" = true ]; then
    echo "🔧 Detected worktree environment - loading .env configuration"
  else
    echo "🏠 Main repository - loading .env configuration"
  fi
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run the actual dev command
# If FRONTEND_PORT/BACKEND_PORT are set (from .env in worktree), use them
# Otherwise, allocate new ports via setup-dev-environment.js (main repo behavior)
exec bash -c 'export FRONTEND_PORT=${FRONTEND_PORT:-$(node scripts/setup-dev-environment.js frontend)} && export BACKEND_PORT=${BACKEND_PORT:-$(node scripts/setup-dev-environment.js backend)} && concurrently "npm run backend:dev:watch" "npm run frontend:dev"'
