# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- No changes yet.

## [1.1.0] - 2026-02-23

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

### Changed
- Data Inspector SQL suggestion UI was moved to a floating overlay and positioned near the current cursor line to reduce editor obstruction.
- Data Inspector SQL assist section was optimized for space usage (collapsible behavior and denser layout).
- Data Inspector toolbar/layout in table mode was refined for clearer responsive behavior.
- Query Builder SQL direct editor height was increased by ~50% for better readability.
- Locale coverage was extended for newly added Inspector/Datasource/Query-Builder controls in both German and English.

### Fixed
- Excel append import now ignores non-schema helper fields (e.g., `_rowid`) to prevent SQLite insert errors.
- Excel export/import roundtrip stability improved by removing `_rowid` from exported table data.
- Re-enabled import mapping flow before append import, including persisted column mappings and transformer application.
- Fixed table/view inspection behavior by handling view sources without `rowid` assumptions.

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
