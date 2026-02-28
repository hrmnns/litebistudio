# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Reporting now supports extended package export/import workflows:
  - PDF export refinements (including optional audit appendix / context metadata support)
  - HTML export for offline package sharing
  - PPT export (`.ppt`) for presentation handoff
  - JSON export/import for package definitions.
- Added reporting package quality and structure helpers:
  - page template presets
  - page status/threshold metadata
  - global and per-page quality checks with quick-fix actions.
- Added a global Reporting sidepanel with overview metrics, quick actions, and package quality overview.
- Worklist enhancements:
  - added `priority` and `due_at` fields to `sys_worklist` (with migration support)
  - added quick capture prompts for priority and optional due date when adding records to worklist
  - added a new Worklist sidepanel (`Focus`, `Batch`, `Preview`) with quick filters, multi-select batch actions, and item preview.
- Health diagnostics persistence for reporting:
  - added new system table `sys_health_snapshot` (with migration to schema version `11`)
  - DB health runs now automatically store snapshots for later SQL/report usage.
- Added cleanup workflow for stored health diagnostics:
  - new quick action in Health Check overview to delete old diagnostic snapshots (admin-only)
  - configurable retention settings in `Settings > Apps > Data Management`:
    - `health_snapshot_retention_days`
    - `health_snapshot_keep_latest`.

### Changed
- Stability and resilience of DB communication were improved:
  - request timeouts are now action-aware (instead of a fixed short RPC timeout)
  - timeout protection now also applies to master-worker requests
  - pending request cleanup now clears timeout handles reliably
  - worker runtime/message errors now trigger controlled pending-request rejection and worker recovery.
  - added BroadcastChannel fallback mode to keep database operations functional in environments without inter-tab channel support.
- App routing now uses lazy-loaded major views to reduce initial bundle pressure and speed up first render.
- Build chunking strategy was refined for heavy export dependencies:
  - separated PDF and canvas export dependencies into dedicated vendor chunks
  - removed obsolete empty `vendor-db` manual chunk.
- Data Inspector index-suggestion generation was optimized for large tables:
  - sampling-based distinct analysis (instead of full scans)
  - stale-run cancellation guard during async suggestion generation
  - in-session suggestion caching by table/filter/sort/schema state.
- Database stats aggregation now runs in parallel with short-lived caching to reduce repeated load.
- `useAsync` now listens to both `db-updated` and `db-changed` events for more consistent UI refresh behavior.
- Internal repository architecture was modularized:
  - `SystemRepository` now composes dedicated sub-repositories for Health, Widgets/Dashboards, Report Packs, SQL Statements, and Worklist/Record Metadata.
  - Public repository API remains backward-compatible for existing app calls.
- Navigation handling was further standardized on React Router navigation flows (`useNavigate`) in router and inspector-related paths.
- Table search logic in repository methods was deduplicated via shared helper functions to reduce maintenance overhead and drift.
- Report Packages area was renamed to `Reporting` / `Berichtswesen` in navigation and main view titles.
- Reporting package settings were moved from modal dialog to a right-side panel with fixed/sticky footer actions.
- Reporting export actions were visually grouped and icon semantics were clarified for better usability.
- Worklist UI was refined with consistent control heights, improved dark-mode readability, and larger note input area in record details.
- System Health checks were expanded with additional architecture consistency checks:
  - schema version target validation (`PRAGMA user_version`)
  - required system-column/index/constraint coverage validation
  - orphan widget-to-SQL reference detection
  - worklist enum consistency validation (`status`, `priority`).
- Health Check quick-fix capabilities were extended to include:
  - cleanup of orphan `sql_statement_id` references in widgets
  - normalization of invalid worklist status/priority values.
- Raw SQL safety was hardened for system tables:
  - write access to `sys_*` via `executeRaw` is now blocked for non-admin users
  - admin mode remains explicitly allowed.
- Health Check overview now includes an explicit snapshot-storage hint for users.
- Snapshot cleanup confirmation now uses configurable retention values instead of fixed thresholds.
- Backup encryption UX was adjusted for self-service usage:
  - empty backup passwords are still blocked
  - weak passwords now show a warning/confirmation instead of hard blocking, allowing explicit user override.
- Admin mode is now session-scoped for runtime authorization checks (no persisted `localStorage` trust for `sys_*` write protection decisions).

### Fixed
- Added a global UI error boundary to prevent full-app blank states on component render failures and provide a safe reload fallback.
- Removed mixed dynamic/static DB import usage in key paths to avoid ineffective chunking and bundler split warnings.
- Removed obsolete/unused legacy code paths:
  - deprecated `Sidebar` props cleanup (`currentView`, `onNavigate`)
  - removed unused hook file `src/hooks/useQuery.ts`
  - removed unused `keepPreviousData` option from `useAsync`.
- Fixed dark-mode styling in the `Manage Categories` dialog within Reporting.
- Fixed unstable text input behavior in report package settings sidepanel fields (characters could be dropped while typing).
- Fixed localized system-table write-block messaging to show user-friendly DE/EN guidance instead of only technical error text.
- Fixed mojibake in report package subtitle metadata (`Ã¢â‚¬Â¢`) by replacing it with a clean separator (`|`).

- Fixed a Health Check refresh loop where persisted health snapshots triggered repeated automatic DB health runs.
- Hardened Datasource SQL object handling by validating/quoting dynamic table/view/column identifiers in destructive/DDL actions.
- Fixed Markdown link rendering hardening by escaping sanitized `href` values before HTML insertion.

## [1.2.0] - 2026-02-27

### Added
- Added startup splash screen shown on app launch with:
  - minimum display duration (3 seconds)
  - automatic close only after app readiness
  - animated progress indicator while LiteBI initializes in the background.
- Added new no-query widget types in `Widgets`:
  - `Markdown`
  - `Status`
  - `Section`
  - `KPI Manual` (manual KPI with value/target/trend)
  - `Image` (URL-based image widget with fit/alignment/caption).
- Added KPI manual target-evaluation indicators (green/yellow/red + neutral fallback) based on value vs. target.
- Added explicit image load error messaging in widget preview and renderer (instead of only broken-image visuals), including URL context.
- Added a reusable shared app brand icon component and integrated it into startup screen, sidebar/app header, and about view.
- Added updated favicon based on the same shared brand symbol for consistent app identity.
- Shared right-side overlay panel infrastructure in `PageLayout` (`rightPanel`) for view-specific tools/content with modal behavior and configurable width.
- Data Inspector SQL Assistant was moved into the new right-side overlay panel.
- Added SQL Manager foundation with reusable SQL statement storage in new system table `sys_sql_statement` (including migration of legacy saved templates/favorites from local storage).
- Data Inspector sidepanel now includes a dedicated `Assistant` tab with visual SELECT builder support (table/column selection, WHERE, GROUP BY, aggregation, ORDER BY, LIMIT, generated SQL preview, and one-click apply/run actions).
- Data Inspector table mode now has a dedicated `Table Tools` sidepanel with tabs for `Columns`, `Filters`, and `Actions`.
- Added a column `Field Picker` in `Table Tools` with multi-select and direct actions to:
  - apply selected columns to table view
  - open generated SELECT in SQL Workspace
  - execute generated SELECT immediately
- Added quick table-toolbar icon buttons (Columns/Filters/Actions) to open the sidepanel directly on the corresponding tab.
- Added heuristic index suggestion generation in `Table Tools > Actions` (based on active filters, sort configuration, cardinality, and existing indexes) with one-click index creation.
- Dashboard view now includes a dedicated right-side tools panel (`Dashboard Tools`) with tabs for:
  - `Layout` (reorder/remove widgets from a compact list)
  - `Filters` (central global filter management)
- Dashboard widget order can now be changed directly in the dashboard grid via drag & drop (persisted per dashboard).
- Widget preview now supports dedicated tabs:
  - `Graphic` (always visible)
  - `Table` (available with query data source; disabled for text widgets)
  - `SQL` (available with query data source; disabled for text widgets)
- Added explicit source selection model in Widgets start step:
  - `None` (continue without data source)
  - `Select query`
  - `Select widget`
- Added duplicate-name overwrite confirmation when saving widgets (`A widget with this name already exists. Overwrite?`).
- Added a dedicated `SQL Workspace` app/route (`#/sql-workspace`) as a separate entry in the main navigation.

### Changed
- Unified branding icon usage across key app entry points and browser tab icon.
- Renamed and normalized manual KPI widget semantics from `KPU` to `KPI` in UI and configuration, with compatibility handling for legacy saved `kpu_*` widgets.
- Improved startup splash readiness flow with fallback probe to avoid stuck progress when route-specific ready events are not emitted.
- Data Inspector SQL toolbar now uses a single `Save` action (disk icon) for saving into SQL Manager; the temporary `Save Report` action and modal were removed.
- Header now includes a global icon-only sidepanel button; it is enabled only when the active view exposes a sidepanel and shown disabled otherwise.
- Data Inspector sidepanel naming was refined to reduce terminology overlap:
  - panel title: `SQL Workspace`
  - second SQL tab: `SQL Builder`
- SQL Manager sidepanel actions were compacted to icon-only buttons and templates were redesigned to the same list/action pattern as saved SQL statements.
- SQL Manager sections (`Templates`, `SQL Manager`, `Recent Queries`) are now collapsible and persist their open/closed state.
- Table Tools `Columns` tab now highlights the currently active sort column and direction.
- Field Picker action labels were compacted using icon-first controls for better space usage.
- Dashboard sidepanel follows the shared global sidepanel pattern in `PageLayout` and is opened via the same header trigger.
- Query Builder was simplified and reoriented as `Widgets` in navigation and settings labels.
- Widgets guided source flow was streamlined:
  - selecting no source and pressing `Next` now opens visualization type selection for text-widget creation
  - selecting a query updates preview immediately
  - selecting a widget updates preview immediately
  - selecting query/widget and pressing `Next` jumps directly to visualization step (no redundant intermediate step)
- Widgets finalize mode labeling now distinguishes:
  - `Create new widget (Text - No data)`
  - `Create new widget (Query)`
  - `Edit widget`
- Widgets preview header and tab controls were visually aligned with the guided panel style; focus button placement and tab sizing were refined for consistency.
- Save dialog actions were simplified to a single primary save path; redundant `Save New` button was removed.
- After successful widget save, guided flow now returns to source step with `Select widget` active and the saved widget preselected.
- `Data Inspector` and SQL work are now separated at app level:
  - `Data Inspector` is focused on table inspection/analysis.
  - `SQL Workspace` is focused on SQL editing/execution and SQL assistant workflows.
- SQL handoff actions that originated in table tooling now open the new `SQL Workspace` instead of switching mode inside `Data Inspector`.
- Widget jump action `Open in Inspector` now opens the dedicated `SQL Workspace`.

### Fixed
- Fixed startup splash screen hanging at ~93% by adding a robust app-ready fallback path.
- Fixed dark-mode styling gaps in newly introduced widget-builder controls, including:
  - guided panel footer controls
  - status widget `Signal Animation` row
  - text widget style buttons
  - dashboard empty-state panel
  - query-builder export button styling in dark mode.
- Fixed external image widget rendering issues by updating CSP image sources and setting image loading policies (`referrerPolicy`, `crossOrigin`) where needed.
- Data Inspector SQL split-resize now keeps the newly dragged pane height reliably instead of snapping back to the previous size after releasing the gripper.
- Fixed z-index stacking so rename prompts in SQL Manager are no longer hidden behind the sidepanel.
- Opening or running a saved SQL statement from the sidepanel now closes the sidepanel immediately.
- SQL Manager/Recent layout in sidepanel now uses internal scroll regions to prevent unwanted outer sidepanel scrolling.
- In `Columns` tab, selected fields are now initialized from currently displayed table columns when the panel is opened.
- Fixed widget save semantics:
  - `Save` updates current widget
  - name conflicts can now intentionally overwrite the existing widget after confirmation
- Fixed preview behavior for text widgets:
  - graphic tab now renders text content reliably
  - table/sql tabs show clear no-data-source messaging when no query is available

## [1.1.0] - 2026-02-24

### Added
- Data Inspector autocomplete enhancements:
  - Context-aware SQL suggestions for keywords, tables, and columns.
  - Keyboard navigation (`ArrowUp/Down`, `Enter/Tab`, `Ctrl+Space`).
  - Optional autocomplete toggle (persisted).
- Data Inspector usability improvements:
  - Resizable SQL editor area with persisted height.
  - Resizable table columns (drag on header separators) with persisted widths per data source.
  - Save SELECT queries directly to Query Builder with pre-save validation.
  - Views are now listed as selectable data sources in table mode.
- Data source management improvements:
  - User-created views are visible in structure management.
  - User-created views can be deleted in the danger zone.
- Query Builder saved widget management enhancements:
  - Search field for saved widgets.
  - Scrollable, compact widget list for large collections.
  - Filtered/total count display and empty-state feedback.
- Storage resilience visibility:
  - Global warning banner when OPFS is unavailable and the app runs on in-memory SQLite fallback.
  - Optional fallback reason is shown to make root-cause diagnosis easier.
- Data Inspector SQL output toggle:
  - Compact switch between `Results` and `Explain` inside the result panel.
  - Explain plan refreshes while editing (debounced) in design-oriented flow.
- Data Inspector table-view action bar:
  - Integrated index creation action directly in table mode (reusing the structured index dialog).
  - Compact, dedicated in-panel menu row for table-view actions (index + saved views).
- Datasource schema coverage enhancements:
  - Indexes are now displayed in `Schema & Structure` (including details like columns/flags).
  - Added guided index creation directly from table structure management.
  - Added table/view meta badges in lists (row count, index count where applicable).
  - Added invalid-view detection and dedicated invalid-state hints.
- Version/build transparency:
  - About screen now shows app version and build number dynamically from build/runtime defines.
- Diagnostics/logging controls:
  - Introduced configurable application log levels (`off`, `error`, `warn`, `info`, `debug`) via Settings.
  - Added centralized logging utilities and wired key app/worker logs to the configured level.
- Dashboard-to-Inspector handoff:
  - Added direct "Open" action on custom dashboard widgets to open the widget SQL in Data Inspector.
  - Added context-aware "Back to Dashboard" action in Data Inspector after opening from a widget.
  - Return navigation now restores the exact originating dashboard (not only the default/first dashboard).
- SQL execution safety and cancellation:
  - Added SQL `Stop` action in Data Inspector while queries are running.
  - Added global SQL `Stop` action in the shared footer near the loading indicator.
  - Added configurable SQL safety defaults in Settings (confirm `SELECT` without `LIMIT`, max rows per SQL run).
  - SQL mode now applies a configurable safety cap for returned row count to keep UI responsive on very large datasets.
- System Health diagnostics expansion:
  - Added comprehensive database health checks (integrity check, FK check, system table presence, invalid view detection, index coverage on large tables).
  - Added deeper data-quality/performance checks (NOT NULL violations, high NULL ratios, duplicate key candidates, EXPLAIN full-scan risk detection).
  - Added per-finding severity/status scoring and actionable recommendations.
  - Added Quick-Fix support for index-related findings directly from diagnostics.
- Storage and environment diagnostics:
  - Added `Environment & Settings Health` checks in the storage diagnostics tab (quota, local/session storage footprint, destructive-confirm setting, log level, backup timestamp).
  - Added per-check detail expansion for storage/environment findings.
- Settings enhancements:
  - Added direct language selection in `General` settings.
  - Added toggle to show/hide language switch in sidebar footer.
  - Added toggle to show/hide `System Status` entry in sidebar footer.
  - Added direct `Open Health Check` entry in `General` settings.
- Factory reset hardening:
  - Factory reset now also clears local environment settings (relevant local/session storage keys) in addition to recreating the database.

### Changed
- Data Inspector SQL suggestion UI was moved to a floating overlay and positioned near the current cursor line to reduce editor obstruction.
- Data Inspector SQL assist section was optimized for space usage (collapsible behavior and denser layout).
- Data Inspector toolbar/layout in table mode was refined for clearer responsive behavior.
- Data Inspector SQL workflow defaults were refined:
  - Editing SQL emphasizes `Explain` view.
  - Executing SQL (`Run`) switches back to `Results` view.
- Query Builder SQL direct editor height was increased by ~50% for better readability.
- Locale coverage was extended for newly added Inspector/Datasource/Query-Builder controls in both German and English.
- Header navigation was simplified:
  - Removed page-level back buttons from shared view headers to reduce visual clutter and free horizontal space.
- Data Inspector table-mode toolbar was streamlined:
  - Moved page-size control to table footer.
  - Removed redundant top `Auto-Limit`/page-size controls.
  - Aligned control heights and combobox affordances for a more consistent header row.
- Data Inspector split-panel behavior was refined:
  - Added draggable splitter between SQL editor and lower results/explain area.
  - Improved drag stability to reduce resize flicker.
- Datasource view cards were decluttered:
  - Removed redundant `VIEW` label and hidden irrelevant index count for views.
  - Disabled info action for invalid views.
- Runtime logging now defaults to minimal console output outside debug-oriented log levels to reduce noise and overhead.
- Dashboard tile header controls were simplified:
  - Removed obsolete drag-handle and duplicate maximize actions from tile headers.
  - Unified system-tile and custom-tile remove affordance with consistent floating remove button behavior.
- Fixed dashboard tile hover visuals by aligning hover-overlay border radius with tile radius.
- System Health modal UX/layout:
  - Added sub-tabs in database diagnostics (`Database Health Check` / `Table Statistics`) for better space usage.
  - Stabilized modal height across tab switches and improved internal scroll behavior.
  - Optimized storage tab layout to better use available space (responsive two-column layout on larger screens, reduced unnecessary outer scrollbar).
  - Kept check summary values always visible while moving additional context into expandable details.
- Settings information architecture:
  - Renamed first settings tab from `Appearance` to `General`.
  - Split `General` into separate panels (`Appearance`, `Language`, `Diagnostics`) with consistent card styling.
  - Split `Security` into two separate panels (`Access Restriction`, `Admin Mode`) for cleaner structure.
- Report Packages responsive actions:
  - On small screens, package-level action buttons (e.g. `Add Page`, `Export`) now render icon-only and show labels from `sm` breakpoint upward.

### Fixed
- Excel append import now ignores non-schema helper fields (e.g., `_rowid`) to prevent SQLite insert errors.
- Excel export/import roundtrip stability improved by removing `_rowid` from exported table data.
- Re-enabled import mapping flow before append import, including persisted column mappings and transformer application.
- Fixed table/view inspection behavior by handling view sources without `rowid` assumptions.
- Fixed index discovery/rendering reliability in schema inspection (including case-insensitive lookup and refresh behavior when opening schema dialogs).
- Disabled detail-toggle actions in diagnostics when no additional details are available.

## [1.0.0] - 2026-02-23

### Added
- Initial public release of LiteBI Studio as a browser-only BI platform.
- Multi-dashboard support with drag-and-drop layout.
- Visual Query Builder and SQL mode editor.
- SQL snippet assistant (schema-aware templates).
- Advanced visualizations: Bar, Line, Area, Pie, Radar, Scatter, KPI, and Pivot.
- Report Packages with multi-page PDF export (cover page and table of contents).
- Smart Import and Generic Import flows for Excel data.
- Worklist module with status tracking and comments.
- English and German language support.
- App lock (salted PIN) and encrypted backups (AES-GCM).
- Data Inspector SQL productivity enhancements:
  - Query templates for top rows, row count, null scan, duplicate scan, and outlier scan.
  - Explain mode with `EXPLAIN QUERY PLAN` preview.
  - Query history and favorites (pinned queries), persisted locally.
  - Custom SQL template management (save, select, rename, delete, clear).
- Data Inspector table productivity enhancements:
  - Saved table views (persisted): table, search, sort, column filters, and filter visibility.
  - Pagination with server-backed `LIMIT/OFFSET`, page size selector, total row count, and direct page jump.
- Data profiling upgrades in Data Inspector:
  - Column type detection (`number`, `text`, `date`, `mixed`, `unknown`).
  - Quality issue badges (high null rate, mixed types, high cardinality, suspicious values).
  - Pattern detection (`email`, `uuid`, `iban`, `url`, `date`) and suspicious value counts.
  - Configurable profiling thresholds (null rate / cardinality), persisted locally.
  - Resizable profiling panel with drag handle and persisted height.
- Query Builder guided workflow and safety enhancements:
  - Guided vs. Advanced workflow mode with persistent selection.
  - Step flow (`Source`, `Run`, `Visualize`, `Finalize`) with step gating and contextual primary actions.
  - Inline guided checklist for current step readiness.
  - Persistent unsaved-changes detection with visible header badge.
  - Reload/tab-close guard (`beforeunload`) when unsaved changes exist.
  - Save/export hints and keyboard shortcuts (`Ctrl/Cmd+Enter`, `Ctrl/Cmd+S`).
- Query Builder test coverage:
  - Guided graph-tab gate behavior.
  - Unsaved-changes confirmation on report switch.
  - `beforeunload` unsaved-changes protection.

### Changed
- Rebranded and generalized from a domain-specific dashboard to LiteBI Studio.
- Shifted to a domain-neutral data model with dynamic schema handling.
- Standardized around React 19 + TypeScript + SQLite WASM/OPFS architecture.
- Data Inspector footer and metadata display now align better with active locale and paging context.
- Data table integration was extended to support controlled sort/filter state for reusable advanced views.
- Query Builder navigation was streamlined to a single guided flow (`Start`, `Source & Run`, `Visualize`, `Finalize`) without redundant top-level tabs/actions.
- Finalize panel now acts as a real summary step (mode, source, visualization, axis/text meta, preview readiness) and includes direct save/update action.
- Query Builder left header panel was visually aligned with the preview header style (title row, divider, spacing adjustments).

### Fixed
- Broad TypeScript hardening across views/components and repositories.
- Hook dependency cleanup in async/query/data-inspector flows.
- Safer DB worker and DB bridge typing/nullability handling.
- Stable formatter/rendering paths for tables, charts, and detail views.
- Stabilized Data Inspector state transitions across table changes, SQL mode, explain mode, and persisted presets.
- Fixed locale resource loading issues caused by malformed newline literals and BOM encoding in `src/locales/en.json` and `src/locales/de.json`.
- Query Builder preview stability for chart rendering:
  - Added robust minimum sizing for preview/chart containers to avoid `ResponsiveContainer` width/height `-1` issues.
  - Scatter preview now uses stricter numeric-axis handling and filtered numeric data.
  - Visualize apply flow now consistently triggers preview refresh and shows a clear fallback message (with visualization icon) when rendering is not possible.
- Guided step behavior in `Visualize` no longer blocks `Next` behind `Apply`; `Next` now depends on valid visualization config only.
- Release gates validated successfully:
  - `npm run lint`
  - `npx tsc -b`
  - `npm run build`
