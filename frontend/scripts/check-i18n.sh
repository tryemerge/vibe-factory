#!/usr/bin/env bash
set -eo pipefail

WORKTREE_BASE="$(mktemp -d)"
RULE="i18next/no-literal-string"
PATTERN="src/**/*.{ts,tsx}"

# Function that outputs violation count to stdout
lint_count() {
  local dir=$1
  ( cd "$dir/frontend"
    # Use the dedicated i18n lint script
    npm run lint:i18n -- -f json 2>/dev/null \
      | jq --arg RULE "$RULE" '[.[] | .messages[] | select(.ruleId == $RULE)] | length' \
      || echo "0"
  )
}

echo "▶️  Counting literal strings in PR branch..."
PR_COUNT=$(lint_count "$PWD/..")

echo "▶️  Checking out $GITHUB_BASE_REF for baseline..."
git fetch --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null || git fetch --depth=1 origin main
BASE_REF="${GITHUB_BASE_REF:-main}"
git worktree add "$WORKTREE_BASE" "origin/$BASE_REF" 2>/dev/null || {
  echo "Could not create worktree, falling back to direct checkout"
  TEMP_BRANCH="temp-i18n-check-$$"
  git checkout -b "$TEMP_BRANCH" "origin/$BASE_REF" 2>/dev/null || git checkout "origin/$BASE_REF"
  BASE_COUNT=$(lint_count "$PWD/..")
  git checkout - 2>/dev/null || true
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
}

if [ -d "$WORKTREE_BASE" ]; then
  BASE_COUNT=$(lint_count "$WORKTREE_BASE")
  git worktree remove "$WORKTREE_BASE" 2>/dev/null || rm -rf "$WORKTREE_BASE"
fi

echo ""
echo "📊 I18n Violation Summary:"
echo "   Base branch ($BASE_REF): $BASE_COUNT violations"
echo "   PR branch: $PR_COUNT violations"
echo ""

if (( PR_COUNT > BASE_COUNT )); then
  echo "❌ PR introduces $((PR_COUNT - BASE_COUNT)) new hard-coded strings."
  echo ""
  echo "💡 To fix, replace hardcoded strings with translation calls:"
  echo "   Before: <Button>Save</Button>"
  echo "   After:  <Button>{t('buttons.save')}</Button>"
  echo ""
  echo "Files with new violations:"
  npx eslint "$PATTERN" --rule "$RULE:error" -f codeframe 2>/dev/null || true
  exit 1
elif (( PR_COUNT < BASE_COUNT )); then
  echo "🎉 Great job! PR removes $((BASE_COUNT - PR_COUNT)) hard-coded strings."
  echo "   This helps improve i18n coverage!"
else
  echo "✅ No new literal strings introduced."
fi
