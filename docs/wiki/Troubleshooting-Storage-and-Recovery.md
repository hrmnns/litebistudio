# Troubleshooting: Storage and Recovery

Use this guide when LiteBI Studio appears unstable, data is missing, or actions stop responding.

## Typical Symptoms

- Views show no data although data existed before.
- SQL execution fails with storage-related errors.
- UI interactions become inconsistent after restore/import.
- Browser console shows messages such as `SQLITE_CANTOPEN`, `NotFoundError`, or OPFS lock/sync errors.

## Why This Happens

In most cases, the browser-local storage stack gets into an inconsistent state:

- OPFS / IndexedDB lock or file-handle issues
- Quota/storage pressure
- Interrupted restore/import
- Multi-tab concurrency conflicts
- Old persisted UI state after a version update

## Fast Recovery (Recommended Order)

1. Close all other LiteBI Studio tabs/windows.
2. Reload the page once (`Ctrl+R` / `Cmd+R`).
3. Open **Data Management → Backup & Restore** and create a backup if still possible.
4. Re-open the app and test one known query in SQL Workspace.
5. If still broken: restore from the latest valid backup.

## Deep Recovery

If the issue persists:

1. Export/backup all recoverable data first.
2. Clear local app data for this site (IndexedDB/OPFS + localStorage).
3. Reload the app and restore from backup.
4. Re-check database health in **System Diagnose & Health**.

## Prevention Best Practices

- Create backups regularly (especially before schema-heavy changes).
- Avoid running the app in multiple tabs in parallel.
- Keep enough free browser disk space.
- After updates, verify health once and run a quick smoke test.

## If You Need to Report an Issue

Include:

- Browser + version
- App version (About dialog)
- Exact steps before the failure
- Console error snippet
- Whether restore/import was used shortly before

