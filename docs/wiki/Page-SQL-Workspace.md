# SQL Workspace

_Last updated: 2026-03-14_

## Purpose

SQL Workspace is the main place to create, run, and save SQL statements.

## What You Can Do Here

- Write SQL manually or generate SQL via SQL Builder
- Execute SQL and inspect results in split or full view
- Save and reopen statements
- Export result sets

## Current Behavior

1. `Run` and `Refresh` are disabled when no executable SQL exists (empty/comment-only input).
2. After execution, result output is shown directly and the active output view is restored on return.
3. If a `SELECT` runs without explicit `LIMIT`, the workspace shows a compact footer badge (`LIMIT 5000 active`) instead of a large warning block.
4. Page state is restored when you leave and return (SQL text, selected statement, split mode, output tab, editor scroll position).

## Notes on Persistence

- The workspace now uses global page-state persistence.
- Unsaved editor content is restored on return.
- `Clear SQL Workspace memory` resets this page state in Settings.

## Related Settings

Open `Settings > Apps > SQL Workspace`:

- `Explain mode`
- `SQL assistant open by default`
- `Confirm query without LIMIT`
- `SQL max rows`
- `Reset SQL Workspace layout`
- `Clear SQL Workspace memory`

Open `Settings > Controls > SQL Editor`:

- Syntax/Autocomplete behavior
- Line wrap / line numbers / active line highlight
- Font and tab size
- Theme intensity and keyword formatting
- Preview highlighting and remembered editor height
