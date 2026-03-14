# Widgets and Dashboards

_Last updated: 2026-03-14_

## Scope

How widgets are authored in the editor and consumed on dashboards.

## Current Workflow

1. Build or open a widget in `Widgets`.
2. Bind a SQL source and configure visualization.
3. Save widget and place it on a dashboard.
4. From dashboard cards, jump directly back to widget editing.

## Current Behavior

- Widget dirty marker (`*`) represents unsaved user changes only.
- Widget editor state is restored after page switching (global page-state persistence).
- Dashboard and Widgets share consistent footer/status behavior.
- Presentation and overlay patterns follow shared page layout conventions.

## Practical Notes

- Keep query names and widget names aligned (`Qxx` / `Wxx`) for maintainability.
- Revalidate widgets after schema changes in Data Management.

## Related

- [Page: Widgets](Page-Widgets)
- [Page: Dashboard](Page-Dashboard)
- [Reporting](Reporting)
- [SQL Workspace and Tables](SQL-Workspace-and-Tables)
