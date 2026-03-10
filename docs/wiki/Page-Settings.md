# Settings

_Last updated: 2026-03-08_

## Purpose

Settings controls application behavior, editor defaults, and operational preferences.

## What You Can Do Here

- Adjust UI and language behavior
- Configure SQL editor defaults
- Set app safety and maintenance options
- Access diagnostics-related controls
- Define app-specific defaults for Data Management, Tables, SQL Workspace, Widgets, Reports, and Worklist

## How to Use It

1. Open `Settings`.
2. Pick the relevant settings section.
3. Apply changes incrementally and verify in the affected page.
4. Keep shared/team defaults documented if multiple users follow one standard.

## Settings Map

### Appearance
- `Theme`: light, dark, system
- `Language`: UI language switch
- `Sidebar language switch`: show/hide quick language toggle in sidebar
- `Sidebar system status`: show/hide system status indicator in sidebar

### Security
- `PIN lock`: enable/update/remove app PIN
- `Admin mode`: controls admin-level actions
- `Log level`: `off | error | warn | info | debug`

### Apps > Data Management
- `Import default mode`: append vs overwrite
- `Import table prefix`: default prefix for imported user tables
- `Auto-save mappings`: keep import mapping choices automatically
- `Backup name pattern`: filename template for backups
- `Use saved backup location`: default restore/export location behavior
- `Health snapshot retention`: cleanup policy for diagnostics snapshots

### Apps > Tables
- `Default page size`
- `Show profiling by default`
- `Explain mode`
- `SQL assistant open by default`
- `Confirm query without LIMIT`
- `SQL max rows`
- `Profiling thresholds`: null rate and cardinality thresholds
- `Reset inspector layout`: clear saved table layout/view state

### Apps > SQL Workspace
- `Explain mode` and `assistant open` defaults
- `Confirm without LIMIT`
- `Max rows`
- `Reset workspace layout`
- `Clear workspace memory` (SQL input/history/last-open metadata)

### Apps > Widgets
- `Reset widget workspace memory` (header cache and last-open widget)
- SQL editor behavior is shared with global SQL Editor settings

### Apps > Reports
- `Default author`
- `Default theme color`
- `Show header/footer by default`
- `Include audit appendix by default`

### Apps > Worklist
- `Default view`
- `Hide completed by default`
- `Default priority`
- `Default due days`

### Controls > Data Table
- `Table density`: normal/compact
- `Wrap cells`
- `Show filters by default`

### Controls > SQL Editor
- Syntax highlighting, autocomplete, line wrap, line numbers
- Active line highlight, indent with TAB, schema hints
- Font size, tab size, theme intensity
- Uppercase keywords on completion
- Preview highlighting, remember editor height

### Controls > Notifications
- `Confirm destructive actions`

## Tips

- Change one control at a time and validate impact.
- Keep SQL editor defaults aligned with team conventions.
- Use maintenance actions carefully and only when required.
