# Operations Runbook

_Last updated: 2026-03-08_

## Common Incidents

- OPFS unavailable / fallback to in-memory DB
- SQLite open/lock issues
- stale multi-tab lock state
- CI failing on required checks

## First-Response Steps

- reproduce and capture exact console error
- verify active branch protection and CI status
- run local quality gates
- reset local app storage only if recovery is not possible otherwise

## Recovery Notes

- Close all app tabs before storage-level interventions.
- Document root cause and corrective actions in PR notes and changelog when relevant.

## Incident Playbooks

### A) OPFS / `SQLITE_CANTOPEN` / `xLock()` errors

Typical symptoms:

- `SQLITE_CANTOPEN` in browser console
- OPFS syncer `xLock()` / `NotFoundError`
- system queries (`sys_user_widgets`, `sys_dashboards`) failing

Steps:

1. Close all LiteBI tabs/windows.
2. Restart browser process fully.
3. Re-open app and verify storage mode.
4. If still failing:
   - clear site data for the app origin
   - re-open app and allow DB re-initialization
5. Re-run smoke checks for SQL Workspace and Widgets.

### B) Branch protection / required checks stuck as `Expected`

Typical symptoms:

- PR shows one successful check plus one pending `Expected`
- merge blocked although workflow run succeeded

Steps:

1. Ensure only one protection source is active for `main`:
   - use either `Branch protection rules` or `Rulesets`, not both.
2. Confirm required check name exactly matches emitted PR context.
3. Re-trigger CI and verify:
   - blocked before green
   - merge allowed after green

### C) Wiki sync not updating

Steps:

1. Confirm edits are committed under `docs/wiki/**`.
2. Verify workflow `.github/workflows/wiki-sync.yml` ran on `main`.
3. Check repository action permissions:
   - `Read and write permissions` enabled for workflows.
4. Re-run `Wiki Sync` workflow manually if needed.

## Escalation Criteria

- Repeated storage corruption across clean sessions
- CI status context mismatch after rule cleanup
- Cross-view regressions on critical no-regression flows

Escalate with:

- exact error text
- reproduction steps
- affected branch/commit
- screenshots (PR checks / console)

## Related

- [Security and Privacy](Security-and-Privacy)
- [Release Process](Release-Process)
