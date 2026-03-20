# Widgets

_Last updated: 2026-03-14_

## Purpose

Widgets transform SQL result data into reusable visual components for dashboards and reports.

![Widgets overview](assets/widgets-overview.png)

## What You Can Do Here

- Create new widgets
- Open and edit existing widgets
- Change data source (SQL statement)
- Configure chart/table visualization
- Save widgets for reuse

## Schema Documentation Integration

Widgets can reuse semantic schema metadata when it is available.

Typical effects:
- clearer field labels in configuration pickers
- better readability for documented result fields
- more understandable setup for chart axes, labels, and pivot-related selections

If no schema documentation exists, Widgets continue to work with technical field names only.

See also:
- [Schema Documentation](Schema-Documentation)

## Current Behavior

1. A widget is marked dirty (`*`) only when it differs from the last saved state.
2. Dirty state is set by user changes (for example SQL source or visualization settings), not by simple remount/navigation.
3. Leaving and returning restores the last visible editor context (selected widget, preview mode, SQL context).
4. Dashboard widget cards now navigate directly to the Widgets editor and open the selected widget.

## Notes on Persistence

- Widgets uses the same global page-state mechanism as other pages.
- `Clear widget workspace memory` resets the restored widget-editor context.

## Related Settings

Open `Settings > Apps > Widgets`:

- `Clear widget workspace memory`

Open `Settings > Controls > SQL Editor`:

- SQL editing and preview behavior used in widget query areas

Also relevant:

- `Settings > Apps > Reports` for defaults when widgets are reused in report exports
