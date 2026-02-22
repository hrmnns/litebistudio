# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Placeholder for upcoming features.

### Changed
- Placeholder for upcoming behavior changes.

### Fixed
- Placeholder for upcoming bug fixes.

## [1.0.0] - 2026-02-22

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

### Changed
- Rebranded and generalized from a domain-specific dashboard to LiteBI Studio.
- Shifted to a domain-neutral data model with dynamic schema handling.
- Standardized around React 19 + TypeScript + SQLite WASM/OPFS architecture.

### Fixed
- Broad TypeScript hardening across views/components and repositories.
- Hook dependency cleanup in async/query/data-inspector flows.
- Safer DB worker and DB bridge typing/nullability handling.
- Stable formatter/rendering paths for tables, charts, and detail views.
- Release gates validated successfully:
  - `npm run lint`
  - `npx tsc -b`
  - `npm run build`
