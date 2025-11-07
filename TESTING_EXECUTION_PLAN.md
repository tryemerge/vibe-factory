# Railway Deployment Testing - Execution Plan

**Task**: Remote Dev 7.0 - Test complete Railway deployment workflow
**Date**: 2025-11-06
**Tester**: Claude (assisted)
**Status**: 🟡 Ready to Begin

---

## Executive Summary

This document outlines the execution plan for comprehensive end-to-end testing of the Vibe Kanban Railway deployment. The goal is to validate that the deployment automation scripts work correctly and that the application functions properly in a production Railway environment.

### Key Deliverables
1. ✅ Comprehensive test plan document (RAILWAY_TESTING.md)
2. ⏳ Executed test results with screenshots/logs
3. ⏳ Performance benchmarks and metrics
4. ⏳ Issues list with severity ratings
5. ⏳ Recommendations for production readiness
6. ⏳ Pull request with findings

---

## Testing Approach

### Strategy
We will conduct **manual exploratory testing** with **structured test cases** to validate:
- Deployment automation scripts work correctly
- Application deploys successfully to Railway
- All core features function in production environment
- Mobile access works properly
- Error scenarios are handled gracefully
- Performance meets acceptable standards

### Testing Type
- **Manual Testing**: Human-driven exploration and validation
- **Structured Test Cases**: Predefined scenarios with expected outcomes
- **Exploratory Testing**: Ad-hoc testing to discover edge cases
- **Performance Testing**: Benchmarking and monitoring

### Test Environment
- **Platform**: Railway (https://railway.app)
- **Account**: saas@emprops.ai (already logged in)
- **Project**: New test project (to be created)
- **Repository**: Current vibe-kanban repository
- **Branch**: emerge/acc5-remote-dev-7-0-t (current worktree)

---

## Current State Assessment

### Prerequisites Status ✅
- [x] Railway CLI installed (v4.10.0)
- [x] Logged in to Railway (saas@emprops.ai)
- [x] Git repository is clean (except RAILWAY_TESTING.md)
- [x] Automation scripts available
- [x] Documentation available

### Recent Deployments
Based on git log, these PRs recently merged:
- #33: Railway deployment automation scripts (1056edaf)
- #32: Database persistence and migrations (4835cff7)
- #34: Error handling and recovery (#60c692e0)

**Status**: Railway deployment infrastructure is complete and ready for testing

### Known Issues (from RAILWAY_DEPLOYMENT.md)
1. ⚠️ Pre-existing TypeScript compilation errors mentioned in docs
   - Need to verify if these are fixed
   - May block Docker build

2. ⚠️ Database persistence requires manual volume setup
   - Not auto-created by scripts
   - Must be done via Railway dashboard

---

## Phase-by-Phase Execution Plan

### Pre-Testing: Verify Build (30 minutes)

**Objective**: Ensure the application can build before attempting Railway deployment

**Steps**:
1. Check TypeScript types are current
   ```bash
   pnpm run generate-types:check
   ```

2. Run frontend build locally
   ```bash
   cd frontend && pnpm run build
   ```

3. Test Docker build locally
   ```bash
   docker build -t vibe-kanban-test .
   ```

4. If build succeeds, verify server starts
   ```bash
   docker run -p 3000:3000 -e PORT=3000 vibe-kanban-test
   ```

**Expected**: All builds succeed without errors

**If Fails**: Document errors, create issues, fix before proceeding

---

### Phase 1: Initial Deployment (60 minutes)

**Objective**: Deploy application to Railway for the first time

#### 1.1 Project Setup (15 minutes)
```bash
# Run interactive setup script
./scripts/railway-setup.sh
```

**Decisions to make**:
- New project or link existing? → **New project**
- Project name → **vibe-kanban-test-2025**
- Database strategy → **SQLite with volume** (recommended)
- GitHub OAuth → **Use default Bloop AI app** (for testing)
- PostHog analytics → **Skip** (not needed for testing)

**Expected**: Project created, environment variables configured

#### 1.2 Volume Creation (10 minutes)
Must be done via Railway dashboard:
1. Open Railway project
2. Go to service → Data/Storage tab
3. Create new volume: `/data`, 1GB
4. Verify `DATABASE_URL` set to `sqlite:///data/db.sqlite`

**Expected**: Volume visible in dashboard

#### 1.3 Deployment (30 minutes)
```bash
# Deploy to Railway
./scripts/deploy-to-railway.sh
```

**Monitor**:
- Build logs
- Deployment progress
- Health check status

**Expected**:
- Build completes successfully
- Deployment reaches "Active" status
- Health check passes
- Application accessible at Railway URL

#### 1.4 First Access (5 minutes)
```bash
# Get URL
railway domain
```

Open in browser:
- Verify frontend loads
- Check browser console for errors
- Test basic navigation

**Expected**: UI loads without errors

---

### Phase 2: Database Verification (45 minutes)

**Objective**: Validate database initialization and persistence

#### 2.1 Check Initial State (10 minutes)
```bash
# View logs for database initialization
./scripts/railway-logs.sh --database
```

**Look for**:
- Database template copied
- Migrations applied
- No errors

#### 2.2 CRUD Operations (20 minutes)
Via UI:
1. Create project: "Test Project Alpha"
2. Add git repository (use any public repo)
3. Create task: "Test Task 1"
4. Update task description
5. Change task status
6. Create second project: "Test Project Beta"
7. Create second task: "Test Task 2"

**Record**: Project IDs and task IDs

#### 2.3 Redeploy Test (10 minutes)
```bash
# Trigger redeployment
railway up --detach

# Wait for deployment
railway logs --tail
```

**After redeployment**:
- Verify projects still exist
- Verify tasks still exist
- Check IDs match

#### 2.4 Backup Test (5 minutes)
```bash
# Create backup
./scripts/railway-backup-db.sh

# Verify file downloaded
ls -lh *.sqlite
```

**Expected**: Backup file downloaded successfully

---

### Phase 3: Core Functionality (90 minutes)

**Objective**: Test main application features

#### 3.1 GitHub Authentication (20 minutes)
1. Log out if logged in
2. Click "Connect GitHub"
3. Follow device flow
4. Enter code on GitHub
5. Authorize application
6. Verify redirected back
7. Check token stored

**Test**:
- Add project with private repository
- Verify clone works

#### 3.2 Task Execution (45 minutes)
1. Create new task: "Add hello world comment to README"
2. Select executor: Claude Code
3. Start execution
4. Monitor real-time logs
5. Wait for completion
6. Review diff
7. Check worktree created

**Collect**:
- Execution time
- Log output
- Exit code
- Generated diff

#### 3.3 Git Operations (15 minutes)
1. Verify commits made by executor
2. Check commit messages
3. View diff in UI
4. Verify worktree location (`/repos`)

#### 3.4 PR Creation (10 minutes)
1. Click "Create PR" after task completion
2. Verify PR created on GitHub
3. Check PR description
4. Verify diff matches UI

**Expected**: PR created successfully

---

### Phase 4: Mobile Access (30 minutes)

**Objective**: Validate mobile responsiveness

#### 4.1 iOS Testing (15 minutes)
Using iPhone:
1. Open Railway URL in Safari
2. Test page load time
3. Navigate through UI
4. Test project creation
5. Test task management
6. Test GitHub auth flow

**Record**: Screenshots of any issues

#### 4.2 Android Testing (15 minutes)
Using Android device:
1. Open Railway URL in Chrome
2. Test page load time
3. Navigate through UI
4. Test project creation
5. Test task management

**Record**: Screenshots of any issues

---

### Phase 5: Production Operations (60 minutes)

**Objective**: Validate operational capabilities

#### 5.1 Logging (15 minutes)
```bash
# Test different log views
railway logs --tail
./scripts/railway-logs.sh
./scripts/railway-logs.sh --errors
./scripts/railway-logs.sh --database
```

**Verify**: Logs accessible and filterable

#### 5.2 Monitoring (20 minutes)
Railway dashboard:
1. Check memory usage graph
2. Check CPU usage graph
3. Check disk usage
4. Review metrics over time

**Record**: Peak resource usage

#### 5.3 Deployment Update (15 minutes)
1. Make small change (e.g., add comment to README)
2. Commit and push
3. Deploy update
4. Monitor deployment
5. Measure downtime (if any)

**Expected**: Zero or minimal downtime

#### 5.4 Backup/Restore (10 minutes)
```bash
# Create backup
./scripts/railway-backup-db.sh

# Test restore process (optional, in test env)
# ./scripts/railway-restore-db.sh backup.sqlite
```

**Verify**: Backup/restore procedures work

---

### Phase 6: Error Scenarios (60 minutes)

**Objective**: Test error handling and recovery

#### 6.1 Database Connection Failure (15 minutes)
1. Temporarily unset `DATABASE_URL`
2. Observe application behavior
3. Check error messages
4. Restore `DATABASE_URL`
5. Verify recovery

**Expected**: Graceful error, clear message

#### 6.2 Backend Crash (15 minutes)
1. Trigger crash (invalid API call or kill process)
2. Monitor Railway logs
3. Verify auto-restart
4. Check data integrity
5. Measure recovery time

**Expected**: Auto-restart within 30 seconds

#### 6.3 Invalid GitHub Token (15 minutes)
1. Revoke GitHub token via GitHub settings
2. Attempt authenticated operation
3. Check error message
4. Re-authenticate
5. Verify recovery

**Expected**: Clear error message, easy re-auth

#### 6.4 Git Clone Failure (15 minutes)
1. Add project with invalid repository URL
2. Attempt to create task
3. Check error handling
4. Verify UI shows error

**Expected**: Clear error, no crash

---

### Phase 7: Performance Benchmarks (60 minutes)

**Objective**: Measure performance metrics

#### 7.1 Page Load Performance (15 minutes)
Using browser DevTools:
1. Clear cache
2. Load Railway URL
3. Measure time to interactive
4. Check network waterfall
5. Record metrics

**Repeat 5 times for average**

#### 7.2 API Response Times (15 minutes)
```bash
# Create curl timing script
cat > curl-format.txt << 'EOF'
time_namelookup: %{time_namelookup}
time_connect: %{time_connect}
time_starttransfer: %{time_starttransfer}
time_total: %{time_total}
EOF

# Test endpoints
curl -w "@curl-format.txt" -o /dev/null -s https://[url]/api/health
curl -w "@curl-format.txt" -o /dev/null -s https://[url]/api/projects
```

**Test**:
- Health endpoint
- Projects list
- Tasks list
- Task creation

#### 7.3 Task Execution Performance (20 minutes)
1. Create simple task
2. Measure time to start
3. Measure worktree creation time
4. Measure total execution time

**Repeat**: 3 times for average

#### 7.4 Resource Usage (10 minutes)
Monitor over 1 hour:
1. Memory usage trend
2. CPU usage trend
3. Disk usage
4. Check for memory leaks

**Record**: Graphs from Railway dashboard

---

## Post-Testing Activities

### Test Results Compilation (60 minutes)
1. Fill in RAILWAY_TESTING.md with all results
2. Add screenshots/logs as evidence
3. Calculate performance averages
4. List all issues found

### Issues Categorization (30 minutes)
For each issue:
- **Severity**: Critical / Major / Minor
- **Impact**: Description of user impact
- **Reproducibility**: Always / Sometimes / Rare
- **Recommendation**: Fix now / Fix later / Document

### Recommendations Document (30 minutes)
Create sections:
1. **Production Readiness**: Go/No-Go decision
2. **Required Fixes**: Must fix before production
3. **Suggested Improvements**: Nice to have
4. **Documentation Updates**: Gaps to fill

### Pull Request (30 minutes)
```bash
# Commit testing documents
git add RAILWAY_TESTING.md TESTING_EXECUTION_PLAN.md
git commit -m "docs: Add comprehensive Railway deployment testing plan and results"

# Create PR
gh pr create --title "Remote Dev 7.0: Railway Deployment Testing Results" \
  --body "Complete test results and recommendations for Railway deployment"
```

---

## Success Metrics

### Must Pass
- [ ] Application deploys successfully to Railway
- [ ] Database initializes and persists data
- [ ] Core task execution workflow works
- [ ] Mobile access functional
- [ ] Logs accessible

### Should Pass
- [ ] All error scenarios handled gracefully
- [ ] Performance meets targets (< 3s page load, < 500ms API)
- [ ] Zero-downtime deployments
- [ ] Backup/restore works

### Nice to Have
- [ ] All performance targets exceeded
- [ ] No issues found
- [ ] Documentation comprehensive

---

## Risk Assessment

### High Risk Issues
1. **TypeScript build errors**: May block deployment entirely
   - **Mitigation**: Fix build errors first in pre-testing phase

2. **Database volume not created**: App will lose data on redeploy
   - **Mitigation**: Verify volume created before testing persistence

3. **GitHub OAuth not working**: Can't test full workflow
   - **Mitigation**: Use default Bloop AI app, or create test app

### Medium Risk Issues
1. **Resource limits**: May hit Railway plan limits
   - **Mitigation**: Monitor resource usage, upgrade if needed

2. **Long build times**: May delay testing
   - **Mitigation**: Build Docker image locally first to verify

### Low Risk Issues
1. **Mobile device availability**: May not have all devices
   - **Mitigation**: Test on available devices, note limitations

---

## Timeline Estimate

| Phase | Estimated Time | Notes |
|-------|----------------|-------|
| Pre-testing | 30 min | Verify builds work |
| Phase 1 | 60 min | Initial deployment |
| Phase 2 | 45 min | Database testing |
| Phase 3 | 90 min | Core functionality |
| Phase 4 | 30 min | Mobile access |
| Phase 5 | 60 min | Operations |
| Phase 6 | 60 min | Error scenarios |
| Phase 7 | 60 min | Performance |
| Post-testing | 150 min | Documentation and PR |
| **Total** | **9-10 hours** | Full comprehensive test |

**Minimum viable test**: Phases 1-3 only (3 hours)

---

## Contact & Support

### If Issues Arise
- **Railway Issues**: Railway Discord, Railway docs
- **Application Issues**: Document in testing results
- **Blocker Issues**: Stop testing, create GitHub issue

### Resources
- Railway Dashboard: https://railway.app
- Railway Docs: https://docs.railway.app
- Railway CLI Reference: RAILWAY_CLI_REFERENCE.md
- Railway Environment Guide: RAILWAY_ENVIRONMENT.md
- Railway Database Guide: RAILWAY_DATABASE_GUIDE.md

---

## Sign-Off

**Tester**: ___________________
**Date**: ___________________
**Production Ready**: ⏳ Testing in progress

**Approval Required From**:
- [ ] Technical Lead
- [ ] Product Owner
- [ ] DevOps/Infrastructure

---

_This document is a living document and will be updated as testing progresses._
