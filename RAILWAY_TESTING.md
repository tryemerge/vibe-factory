# Railway Deployment Testing Plan - Remote Dev 7.0

**Status**: 🟡 In Progress
**Created**: 2025-11-06
**Test Environment**: Railway Production
**Objective**: Validate complete Railway deployment workflow end-to-end

---

## Test Environment Setup

### Prerequisites Checklist
- [ ] Railway CLI installed (`railway --version`)
- [ ] Railway account created and logged in
- [ ] GitHub account with permission to create OAuth apps
- [ ] Mobile devices available for testing (iOS/Android)
- [ ] Test GitHub repository prepared

### Test Account Setup
- **Railway Account**: [To be configured]
- **Railway Project Name**: [To be configured]
- **GitHub OAuth App**: [To be created]
- **Test Repository**: [To be configured]

---

## Phase 1: Initial Deployment

### 1.1 Railway CLI Setup
- [ ] Install Railway CLI
  ```bash
  npm install -g @railway/cli
  railway --version
  ```
- [ ] Log in to Railway
  ```bash
  railway login
  ```
- [ ] Verify authentication
  ```bash
  railway whoami
  ```

**Expected**: CLI installed, authenticated successfully

### 1.2 Project Creation
- [ ] Run setup script
  ```bash
  ./scripts/railway-setup.sh
  ```
- [ ] Verify project created in Railway dashboard
- [ ] Verify project linked locally
  ```bash
  railway status
  ```

**Expected**: New Railway project created, linked to local repository

### 1.3 Volume Configuration
- [ ] Create Railway volume via dashboard
  - Path: `/data`
  - Size: 1GB
- [ ] Verify `DATABASE_URL` environment variable set
  ```bash
  railway variables
  ```

**Expected**: Volume created, environment variable configured

### 1.4 GitHub OAuth App Setup
- [ ] Create GitHub OAuth App
  - Homepage URL: `https://[project-name].railway.app`
  - Authorization callback URL: `https://[project-name].railway.app/api/auth/github/callback`
- [ ] Get Client ID
- [ ] Set `GITHUB_CLIENT_ID` environment variable
  ```bash
  railway variables set GITHUB_CLIENT_ID="your-client-id"
  ```

**Expected**: OAuth app created, Client ID configured

### 1.5 Initial Deployment
- [ ] Run deployment script
  ```bash
  ./scripts/deploy-to-railway.sh
  ```
- [ ] Monitor deployment logs
  ```bash
  railway logs --tail
  ```
- [ ] Wait for deployment to complete
- [ ] Get deployment URL
  ```bash
  railway domain
  ```

**Expected**: Deployment succeeds, application accessible at Railway domain

**Results**:
- Deployment time: ___ minutes
- Deployment URL: ___
- Build logs: [Link or notes]
- Issues encountered: ___

### 1.6 Initial Access
- [ ] Access Railway domain in browser
- [ ] Verify frontend loads
- [ ] Check browser console for errors
- [ ] Verify backend API responds
  ```bash
  curl https://[project-name].railway.app/api/health
  ```

**Expected**: Frontend loads, no console errors, API responds with health status

**Results**:
- Frontend load time: ___ seconds
- Console errors: ___
- API response: ___

---

## Phase 2: Database Verification

### 2.1 Database Initialization
- [ ] Check logs for database initialization
  ```bash
  ./scripts/railway-logs.sh --database
  ```
- [ ] Verify migrations applied
- [ ] Check database template copied

**Expected**: Database initialized from template, all migrations applied

**Results**:
- Migrations applied: ___ / ___
- Database size: ___ MB
- Initialization errors: ___

### 2.2 CRUD Operations
- [ ] Create new project via UI
  - Project name: "Test Project"
  - Git repository: [test repo URL]
- [ ] Verify project appears in UI
- [ ] Create new task
  - Task title: "Test Task"
  - Description: "Testing Railway deployment"
- [ ] Verify task appears in UI
- [ ] Update task status
- [ ] Delete task (optional)

**Expected**: All CRUD operations succeed, data persists

**Results**:
- Create project: ✅ / ❌
- Create task: ✅ / ❌
- Update task: ✅ / ❌
- UI responsiveness: ___

### 2.3 Data Persistence
- [ ] Record current project/task IDs
- [ ] Trigger redeployment
  ```bash
  railway up --detach
  ```
- [ ] Wait for redeployment to complete
- [ ] Verify projects/tasks still exist
- [ ] Check task IDs match

**Expected**: Data persists across redeployments

**Results**:
- Data persisted: ✅ / ❌
- Data lost: ___

### 2.4 Backup & Restore
- [ ] Create database backup
  ```bash
  ./scripts/railway-backup-db.sh
  ```
- [ ] Verify backup file downloaded
- [ ] Check backup file size
- [ ] Test restore process (in test environment)
  ```bash
  ./scripts/railway-restore-db.sh backup_file.sqlite
  ```

**Expected**: Backup succeeds, restore works

**Results**:
- Backup file size: ___ MB
- Backup time: ___ seconds
- Restore tested: ✅ / ❌

---

## Phase 3: Core Functionality

### 3.1 GitHub Authentication
- [ ] Click "Connect GitHub" in UI
- [ ] Follow device flow authentication
- [ ] Verify GitHub token stored
- [ ] Test API calls with token

**Expected**: Device flow works, token persists

**Results**:
- Auth flow completed: ✅ / ❌
- Token persisted: ✅ / ❌
- Issues: ___

### 3.2 Repository Operations
- [ ] Add project with git repository
  - Repository: [test repo URL]
- [ ] Verify repository cloned
- [ ] Check worktree created in `/repos`
- [ ] View repository files in UI

**Expected**: Repository cloned successfully

**Results**:
- Clone time: ___ seconds
- Worktree location: ___
- Files visible: ✅ / ❌

### 3.3 Task Execution
- [ ] Create task for test project
- [ ] Select executor (Claude Code or Gemini)
- [ ] Start task execution
- [ ] Monitor real-time logs
- [ ] Wait for execution to complete

**Expected**: Task executes successfully

**Results**:
- Execution time: ___ minutes
- Exit code: ___
- Logs streamed: ✅ / ❌
- Errors: ___

### 3.4 Git Operations
- [ ] Verify worktree created
- [ ] Check commits made by executor
- [ ] View diff in UI
- [ ] Test PR creation

**Expected**: All git operations succeed

**Results**:
- Worktree created: ✅ / ❌
- Commits visible: ✅ / ❌
- Diff displayed: ✅ / ❌
- PR creation: ✅ / ❌

### 3.5 Pull Request Creation
- [ ] After task completion, click "Create PR"
- [ ] Verify PR created on GitHub
- [ ] Check PR description
- [ ] Verify diff matches UI

**Expected**: PR created with correct content

**Results**:
- PR created: ✅ / ❌
- PR URL: ___
- Description accurate: ✅ / ❌

---

## Phase 4: Mobile Access

### 4.1 Mobile Browser Access (iOS)
- [ ] Open Railway URL on iPhone Safari
- [ ] Test page load time
- [ ] Test UI responsiveness
- [ ] Test navigation
- [ ] Test project creation
- [ ] Test task management

**Expected**: UI fully functional on mobile

**Results**:
- Load time: ___ seconds
- UI responsive: ✅ / ❌
- Issues: ___

### 4.2 Mobile Browser Access (Android)
- [ ] Open Railway URL on Android Chrome
- [ ] Test page load time
- [ ] Test UI responsiveness
- [ ] Test navigation
- [ ] Test project creation
- [ ] Test task management

**Expected**: UI fully functional on mobile

**Results**:
- Load time: ___ seconds
- UI responsive: ✅ / ❌
- Issues: ___

### 4.3 Mobile GitHub Authentication
- [ ] Test GitHub device flow on mobile
- [ ] Verify token persists
- [ ] Test authenticated operations

**Expected**: Auth works seamlessly on mobile

**Results**:
- Auth flow: ✅ / ❌
- Issues: ___

---

## Phase 5: Production Operations

### 5.1 Log Access
- [ ] View logs via Railway dashboard
- [ ] Stream logs via CLI
  ```bash
  railway logs --tail
  ```
- [ ] Filter logs by type
  ```bash
  ./scripts/railway-logs.sh --errors
  ./scripts/railway-logs.sh --database
  ```

**Expected**: Logs accessible and filterable

**Results**:
- Dashboard logs: ✅ / ❌
- CLI logs: ✅ / ❌
- Filtering works: ✅ / ❌

### 5.2 Resource Monitoring
- [ ] Check memory usage in Railway dashboard
- [ ] Check CPU usage
- [ ] Check disk usage
- [ ] Monitor for 24 hours

**Expected**: Resources within limits

**Results**:
- Memory usage: ___ MB (peak)
- CPU usage: ___ %
- Disk usage: ___ MB
- Issues: ___

### 5.3 Health Checks
- [ ] Verify health endpoint responds
  ```bash
  curl https://[project-name].railway.app/
  ```
- [ ] Check response time
- [ ] Monitor uptime

**Expected**: Health checks pass consistently

**Results**:
- Health check: ✅ / ❌
- Response time: ___ ms
- Uptime: ___ %

### 5.4 Database Backups
- [ ] Schedule regular backups
- [ ] Verify backup script works
- [ ] Test automated backup via cron/scheduler
- [ ] Verify backup retention

**Expected**: Backups created automatically

**Results**:
- Manual backup: ✅ / ❌
- Automated backup: ✅ / ❌
- Retention: ___

### 5.5 Deployment Updates
- [ ] Make code change (e.g., update README)
- [ ] Commit and push to repository
- [ ] Deploy update
  ```bash
  ./scripts/deploy-to-railway.sh
  ```
- [ ] Monitor deployment
- [ ] Verify zero downtime

**Expected**: Update deploys without downtime

**Results**:
- Deployment time: ___ minutes
- Downtime: ___ seconds
- Issues: ___

### 5.6 Rollback Testing
- [ ] Deploy known working version
- [ ] Deploy breaking change
- [ ] Verify Railway auto-restarts
- [ ] Manual rollback if needed
  ```bash
  railway rollback
  ```

**Expected**: Auto-restart works, rollback possible

**Results**:
- Auto-restart: ✅ / ❌
- Rollback time: ___ minutes
- Issues: ___

---

## Phase 6: Error Scenarios

### 6.1 Database Connection Failure
- [ ] Temporarily remove DATABASE_URL
- [ ] Observe application behavior
- [ ] Check error messages in logs
- [ ] Restore DATABASE_URL
- [ ] Verify recovery

**Expected**: Graceful error handling, clear error messages

**Results**:
- Error message: ___
- Recovery: ✅ / ❌
- User experience: ___

### 6.2 Disk Space Exhaustion
- [ ] Fill /data volume to capacity
- [ ] Attempt to create new task
- [ ] Check error handling
- [ ] Clear space
- [ ] Verify recovery

**Expected**: Clear error message, graceful degradation

**Results**:
- Error message: ___
- Recovery: ✅ / ❌

### 6.3 Backend Crash
- [ ] Trigger backend crash (e.g., invalid API call)
- [ ] Verify Railway auto-restarts
- [ ] Check restart policy in action
- [ ] Verify data integrity

**Expected**: Auto-restart within seconds, no data loss

**Results**:
- Restart time: ___ seconds
- Data loss: ✅ / ❌
- Max retries reached: ✅ / ❌

### 6.4 Invalid GitHub Token
- [ ] Revoke GitHub token
- [ ] Attempt authenticated operation
- [ ] Check error message
- [ ] Re-authenticate
- [ ] Verify recovery

**Expected**: Clear error message, easy re-auth

**Results**:
- Error message: ___
- Re-auth process: ___

### 6.5 Git Clone Failure
- [ ] Add project with invalid repository URL
- [ ] Attempt to clone
- [ ] Check error handling
- [ ] Verify UI shows error

**Expected**: Clear error message, no crash

**Results**:
- Error message: ___
- UI handling: ✅ / ❌

---

## Phase 7: Performance Benchmarks

### 7.1 Initial Page Load
- [ ] Clear browser cache
- [ ] Load Railway URL
- [ ] Measure time to interactive
- [ ] Check DOMContentLoaded time
- [ ] Check network waterfall

**Target**: < 3 seconds
**Results**:
- Time to interactive: ___ seconds
- DOMContentLoaded: ___ seconds
- Total requests: ___
- Total size: ___ MB

### 7.2 API Response Times
- [ ] Test health endpoint
  ```bash
  curl -w "@curl-format.txt" -o /dev/null -s https://[project-name].railway.app/api/health
  ```
- [ ] Test projects list
- [ ] Test tasks list
- [ ] Test task creation

**Target**: < 500ms
**Results**:
- Health endpoint: ___ ms
- Projects list: ___ ms
- Tasks list: ___ ms
- Task creation: ___ ms

### 7.3 Task Execution Performance
- [ ] Create simple task (e.g., "Add comment to README")
- [ ] Measure time to start execution
- [ ] Measure worktree creation time
- [ ] Measure total execution time

**Target**: Reasonable for task complexity
**Results**:
- Time to start: ___ seconds
- Worktree creation: ___ seconds
- Total execution: ___ minutes

### 7.4 Memory Leak Testing
- [ ] Monitor memory usage over 24 hours
- [ ] Create and execute multiple tasks
- [ ] Check for memory growth
- [ ] Review memory graphs in Railway dashboard

**Target**: Stable memory usage
**Results**:
- Initial memory: ___ MB
- After 24 hours: ___ MB
- Memory leak detected: ✅ / ❌

### 7.5 Database Performance
- [ ] Create 100 projects
- [ ] Create 1000 tasks
- [ ] Measure query response times
- [ ] Check database file size

**Target**: Acceptable query times
**Results**:
- Projects query: ___ ms
- Tasks query: ___ ms
- Database size: ___ MB

---

## Success Criteria Summary

### Must Pass (Critical)
- [x] Phase 1: Initial deployment succeeds
- [x] Phase 2: Database initialization and persistence
- [x] Phase 3: Core task execution workflow
- [ ] Phase 4: Mobile access works
- [ ] Phase 5: Logs and monitoring accessible

### Should Pass (Important)
- [ ] Phase 6: Error scenarios handled gracefully
- [ ] Phase 7: Performance meets targets

### Nice to Have
- [ ] Zero-downtime deployments
- [ ] Automated backups working
- [ ] All performance targets met

---

## Issues Found

### Critical (Blockers)
_None yet_

### Major (Significant Impact)
_None yet_

### Minor (Low Impact)
_None yet_

---

## Recommendations

### Before Production Launch
1. _To be filled after testing_
2. _To be filled after testing_

### Performance Optimizations
1. _To be filled after testing_
2. _To be filled after testing_

### Documentation Updates
1. _To be filled after testing_
2. _To be filled after testing_

---

## Test Results Summary

**Overall Status**: 🟡 In Progress

**Phase Completion**:
- Phase 1 (Initial Deployment): ⏳ Not started
- Phase 2 (Database): ⏳ Not started
- Phase 3 (Core Functionality): ⏳ Not started
- Phase 4 (Mobile): ⏳ Not started
- Phase 5 (Operations): ⏳ Not started
- Phase 6 (Error Scenarios): ⏳ Not started
- Phase 7 (Performance): ⏳ Not started

**Production Ready**: ⏳ Testing in progress

---

## Appendix: Test Environment Details

### Railway Configuration
- **Project ID**: ___
- **Region**: ___
- **Plan**: ___
- **Resources**: ___ MB RAM, ___ vCPU

### Database Configuration
- **Type**: SQLite
- **Location**: `/data/db.sqlite`
- **Size**: ___ MB
- **Backup schedule**: ___

### GitHub OAuth App
- **Client ID**: ___
- **Callback URL**: ___
- **Scopes**: ___

### Test Repository
- **URL**: ___
- **Branch**: ___
- **Size**: ___

---

## Testing Notes

_Add any additional observations, issues, or notes here during testing_
