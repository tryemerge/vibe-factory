# i18n Enforcement System

This PR introduces the infrastructure for incremental internationalization (i18n) enforcement to prevent new hardcoded strings while allowing gradual cleanup of existing code.

## Current Status: Bootstrap Phase

### 🚧 Initial Implementation
- ✅ **eslint-plugin-i18next** installed and configured
- ✅ **Environment flag system** separates i18n from main lint  
- ✅ **CI integration** with `continue-on-error: true` for bootstrap
- ✅ **Violation counting script** ready for enforcement

### 📊 Current Baseline
- **367 existing violations** detected in codebase
- **Settings pages** already fully translated (clean)
- **CI allows** initial implementation to merge

## Next Steps (After Merge)

### 1. Enable Full Enforcement
Remove the `continue-on-error: true` flag from `.github/workflows/test.yml`:

```yaml
- name: Check i18n regressions
  # continue-on-error: true  # Remove this line
  env:
    GITHUB_BASE_REF: ${{ github.base_ref || 'main' }}
  run: |
    cd frontend
    ./scripts/check-i18n.sh
```

### 2. Monitor Progress
- **Track violation count** as components get translated
- **Celebrate reductions** when PRs reduce the count
- **Block regressions** when PRs increase the count

### 3. Gradual Cleanup Strategy
- **Boy Scout Rule**: Clean up i18n when touching files
- **Translation Sprints**: Periodic focused cleanup sessions
- **Component-by-component**: Migrate high-traffic areas first

## Usage

### For Developers
```bash
npm run lint        # Quality check (excludes i18n warnings)
npm run lint:i18n   # i18n-specific check (shows all violations)
```

### For CI
- **Main lint check**: Continues with 100-warning limit
- **i18n enforcement**: Separate check prevents new violations

## Goal
Reach **0 violations** baseline, then remove soft-fail mode for permanent enforcement.
