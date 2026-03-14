# SQL Workspace and Tables

_Last updated: 2026-03-14_

## Scope

This page describes the combined workflow between SQL execution and table inspection.

## Core Flows

- Write/run SQL in SQL Workspace
- Inspect table data and profiling in Tables
- Switch pages and continue with restored context
- Export valid result data

## Current Interaction Contract

### SQL Workspace

1. `Run` is only enabled for executable SQL.
2. Split/results view state is restored when returning to the page.
3. SQL editor content, selected statement, and editor scroll are restored.
4. `SELECT` without explicit `LIMIT` shows a compact `LIMIT 5000 active` status badge.

### Tables

1. Active table context is restored on return.
2. Data/profiling tab selection is restored.
3. Inspector/view state is restored through shared page-state persistence.

## No-Regression Checklist

1. SQL workspace with comment-only input keeps `Run` disabled.
2. Executed SQL restores results view after page switch.
3. Tables restores the last selected mode (`Data` / `Profiling`) after page switch.
4. Footer/status behavior is consistent (`Loading...` on first load, `Last update...` after render).

## Related

- [Page: SQL Workspace](Page-SQL-Workspace)
- [Page: Tables](Page-Tables)
- [Data Model and Migrations](Data-Model-and-Migrations)
- [Operations Runbook](Operations-Runbook)
