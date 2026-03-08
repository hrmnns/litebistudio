# SQL Workspace and Tables

_Last updated: 2026-03-08_

## Critical Flows

- Open SQL workspace
- Run SQL
- Save / Save as
- Unsaved-changes guard
- Split view and result visibility

## Expected Behavior

- Run actions are disabled when no executable SQL command exists.
- After successful run, result output should be directly visible.
- Export actions should be available only when valid result data exists.

## Current Interaction Contract

### SQL Workspace

1. `Run` and header `Refresh` are disabled when:
   - SQL editor is empty
   - SQL editor contains comments only
   - no executable SQL statement is detected
2. After `Run`:
   - split view is auto-enabled (if it was off)
   - focus switches to `Results`
3. Export menu:
   - PDF/Excel entries are disabled when no valid data exists
   - Excel is enabled only after result rows are loaded

### Tables View

1. Table and profiling modes must keep paging and refresh stable.
2. SQL handoff to SQL Workspace must preserve query text.
3. Export dropdown must always render above content (no clipping behind table panes).

## No-Regression Test Checklist

1. Empty SQL editor:
   - `Run` disabled
   - header `Refresh` disabled
2. Comment-only SQL editor:
   - `Run` disabled
   - header `Refresh` disabled
3. Executable SQL (`SELECT 1`):
   - `Run` enabled
   - split view auto-opens on run
   - results appear directly
4. Without results:
   - Excel export disabled
5. With results:
   - Excel export enabled

## Related Files

- `src/app/views/TablesView.tsx`
- `src/app/components/ui/PageLayout.tsx`
- `src/lib/security/sqlAnalysis.ts`

## No-Regression Focus

- SQL execution safety checks
- statement persistence and restore behavior
- table inspection and profiling continuity

## Related

- [Data Model and Migrations](Data-Model-and-Migrations)
- [Operations Runbook](Operations-Runbook)
