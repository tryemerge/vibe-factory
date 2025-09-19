#!/usr/bin/env bash
# i18n regression check script
# Compares i18next/no-literal-string violations between PR and main branch
# Initial implementation: This script will show high violation counts until enforcement is enabled
set -eo pipefail

WORKTREE_BASE="$(mktemp -d)"
RULE="i18next/no-literal-string"

# Function that outputs violation count to stdout
lint_count() {
  local dir=$1
  local tmp
  tmp=$(mktemp)
  
  echo "🔍 DEBUG: lint_count called with dir=$dir" >&2
  echo "🔍 DEBUG: Checking if $dir/frontend exists..." >&2
  ls -la "$dir/" >&2 || echo "🔍 DEBUG: Failed to list $dir/" >&2
  
  trap 'rm -f "$tmp"' RETURN
  
  (
    set -eo pipefail
    cd "$dir/frontend"
    echo "🔍 DEBUG: Changed to $(pwd)" >&2
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
      echo "🔍 DEBUG: Installing dependencies in worktree..." >&2
      cd "$dir" && pnpm install --frozen-lockfile --silent > /dev/null 2>&1 || {
        echo "🔍 DEBUG: pnpm install failed, trying npm..." >&2
        npm install --silent > /dev/null 2>&1 || echo "🔍 DEBUG: npm install also failed" >&2
      }
      cd "$dir/frontend"
    fi
    
    echo "🔍 DEBUG: Running ESLint..." >&2
    # Use npx directly and output to file to avoid npm banners
    LINT_I18N=true npx eslint . \
      --ext ts,tsx \
      --format json \
      --output-file "$tmp" \
      --no-error-on-unmatched-pattern \
      > /dev/null 2>&1 || echo "🔍 DEBUG: ESLint command failed with exit code $?" >&2
  )
  
  echo "🔍 DEBUG: ESLint output file size: $(wc -c < "$tmp")" >&2
  echo "🔍 DEBUG: ESLint output preview:" >&2
  head -200 "$tmp" >&2 || echo "🔍 DEBUG: Failed to read tmp file" >&2
  
  # Parse the clean JSON file
  local result
  result=$(jq --arg RULE "$RULE" \
     '[.[].messages[] | select(.ruleId == $RULE)] | length' "$tmp" \
     2>/dev/null || echo "0")
  echo "🔍 DEBUG: jq result: $result" >&2
  echo "$result"
}

echo "▶️  Counting literal strings in PR branch..."
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "🔍 DEBUG: REPO_ROOT=$REPO_ROOT" >&2
echo "🔍 DEBUG: Current working directory: $(pwd)" >&2
PR_COUNT=$(lint_count "$REPO_ROOT")
echo "🔍 DEBUG: PR_COUNT=$PR_COUNT" >&2

BASE_REF="${GITHUB_BASE_REF:-main}"
echo "▶️  Checking out $BASE_REF for baseline..."
echo "🔍 DEBUG: BASE_REF=$BASE_REF" >&2
git fetch --depth=1 origin "$BASE_REF" 2>/dev/null || git fetch --depth=1 origin "$BASE_REF"
git worktree add "$WORKTREE_BASE" "origin/$BASE_REF" 2>/dev/null || {
  echo "Could not create worktree, falling back to direct checkout"
  TEMP_BRANCH="temp-i18n-check-$$"
  git checkout -b "$TEMP_BRANCH" "origin/$BASE_REF" 2>/dev/null || git checkout "origin/$BASE_REF"
  BASE_COUNT=$(lint_count "$REPO_ROOT")
  git checkout - 2>/dev/null || true
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
}

# Get base count from worktree if it was created successfully
if [ -d "$WORKTREE_BASE" ]; then
  echo "🔍 DEBUG: Using worktree at $WORKTREE_BASE" >&2
  BASE_COUNT=$(lint_count "$WORKTREE_BASE")
  echo "🔍 DEBUG: BASE_COUNT from worktree: $BASE_COUNT" >&2
  git worktree remove "$WORKTREE_BASE" 2>/dev/null || rm -rf "$WORKTREE_BASE"
else
  echo "🔍 DEBUG: No worktree created, BASE_COUNT may be from fallback" >&2
fi

# Ensure BASE_COUNT has a value
BASE_COUNT="${BASE_COUNT:-0}"
echo "🔍 DEBUG: Final BASE_COUNT=$BASE_COUNT" >&2

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
  (cd "$REPO_ROOT/frontend" && LINT_I18N=true npx eslint . --ext ts,tsx --rule "$RULE:error" -f codeframe 2>/dev/null || true)
  exit 1
elif (( PR_COUNT < BASE_COUNT )); then
  echo "🎉 Great job! PR removes $((BASE_COUNT - PR_COUNT)) hard-coded strings."
  echo "   This helps improve i18n coverage!"
else
  echo "✅ No new literal strings introduced."
fi
