# Audit No-Regression Checklist

This checklist is intended for security/performance/stability audit changes so existing product behavior does not break.

## 1) Mandatory flow checks before merge

Run these checks manually (or via E2E) for each audit PR:

1. Widgets
   - Open existing widget
   - Load SQL statement into widget
   - Execute/refresh and verify table data is shown
   - Configure chart axes/series in config panel
   - Save, then confirm `*` is removed and save button disabled
   - Switch to another app section and back, verify widget + SQL statement restore
2. SQL Workspace
   - Open statement
   - Execute statement
   - Save and Save As behavior (overwrite prompt path included)
   - Unsaved change guard (`Yes/No/Cancel`) when opening/new
3. Worklist / System tables
   - Add and remove worklist item as non-admin
   - Verify non-admin writes still work for allowed `sys_*` tables
4. Dashboards
   - Open dashboard with widgets
   - Open widget in editor from dashboard
   - Move/rename/delete actions still functional
5. Data/Tables view
   - Switch table/profiling mode
   - Refresh and paging still work

## 2) Mandatory automated checks (CI)

1. `npm run check:encoding`
2. `npx tsc --noEmit -p tsconfig.json`
3. `npm run lint`
4. `npm run test:smoke`

## 3) Change-scope safety rules for audit PRs

1. One concern per PR
   - security OR performance OR UI refactor, not all mixed
2. Feature flag for risky behavior changes
   - keep old behavior fallback until smoke checks pass
3. Preserve contract boundaries
   - repository contracts (`SystemRepository`) must keep existing allowed flows intact
4. Add/adjust tests with each behavior change
   - if user flow changed, at least one smoke/integration assertion must be updated

## 4) Release gate

Audit PR is not releasable unless:

1. All CI checks are green
2. All mandatory flows were re-verified
3. Changelog entry includes:
   - changed behavior
   - migration/compatibility note
   - rollback note (if feature-flagged)

## 5) Post-merge monitoring (dev/staging)

1. Track top regressions:
   - widget execution failures
   - SQL statement loading failures
   - missing persisted state after navigation
2. Keep temporary debug markers behind a dev flag only and remove after stabilization.

