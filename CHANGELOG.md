# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
