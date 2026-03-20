# Schema Documentation

_Last updated: 2026-03-20_

## Purpose

`Schema Documentation` adds a semantic layer to the technical database schema in LiteBI Studio.

It is designed to make tables, views, columns, and relationships easier to understand and reuse across the application.

Typical benefits:
- clearer business-friendly names
- short descriptions for important objects
- documented semantic column types
- documented logical relationships
- better guidance in SQL Workspace and Widgets

This feature is optional. If no schema documentation is maintained, LiteBI Studio continues to work with the technical schema only.

## Where to find it

Open:

`Data Management > Structure & Schema`

There are two main entry points:

- `Schema Tools`
  For validation, cleanup, filtering, export, and import
- documentation sidebar for the selected table or view
  For maintaining object-specific documentation

## What can be documented

### Tables and views
For each table or view, you can maintain:
- `Display name`
- `Description`

This helps turn technical names into more understandable labels.

Example:
- `vendors` -> `Suppliers`
- `budget_monthly` -> `Monthly Budget`

### Columns
For each column, you can maintain:
- `Display name`
- `Description`
- `Semantic type`

Available semantic types include:
- `ID`
- `Date`
- `Metric`
- `Category`
- `Text`
- `Currency`
- `Percent`
- `Boolean`

Example:
- `invoice_date` -> `Invoice Date` + `Date`
- `total_spend` -> `Total Spend` + `Currency`

### Relationships
You can also document semantic relationships between objects, even if SQLite does not define them as physical foreign keys.

A relationship contains:
- source table and column
- target table and column
- relationship type
- join type
- optional display name
- optional description

This is especially useful for analysis-oriented data models.

## Working with the documentation sidebar

Select a table or view in `Structure & Schema` and open the documentation sidebar.

The sidebar contains:
- `Table Details`
- `Columns`
- `Relationships`

This is the main place for maintaining semantic schema information.

## Schema Tools

`Schema Tools` provides global actions for the entire schema.

Available functions include:
- `Schema validate`
- `Cleanup`
- `Filter view`
- `Schema export`
- `Schema import`

These tools help keep schema documentation consistent and reusable.

## Validation

Validation checks whether documented schema metadata still matches the live schema.

The result distinguishes between:

### Technical issues
Examples:
- a documented table no longer exists
- a documented column no longer exists
- a relationship points to a missing object or column

### Review findings
Examples:
- a documented relationship should be reviewed
- a declared relationship type does not look plausible based on the current data

Validation results can be opened directly from `Schema Tools`.

## Cleanup

Cleanup removes documentation entries that are no longer technically valid.

Typical cases:
- a documented table was deleted
- documented columns were removed
- a documented relationship points to missing objects

Cleanup does not resolve review findings automatically. Those still need user review.

## Import and export

Schema documentation can be exported and imported as JSON.

### Export
The export contains:
- technical schema structure
- documented tables and views
- documented columns
- documented relationships

The export does not contain:
- data rows
- sample values
- query results

### Import
Imported schema packages are first analyzed locally before anything is merged.

The analysis highlights:
- direct matches
- missing local objects or columns
- invalid relationships
- conflicts between local and imported semantic values

## Conflict review

If imported documentation differs from local documentation, LiteBI Studio opens a conflict review flow.

For each conflict, you can choose:
- keep local value
- use imported value

This makes the merge process transparent and controlled.

## Merge behavior

Schema import never changes the physical database structure.

The merge only affects semantic metadata such as:
- display names
- descriptions
- semantic types
- documented relationships

After import, LiteBI Studio validates the resulting schema documentation again.

## Usage in SQL Workspace

When schema documentation exists, SQL Workspace can use it for:
- clearer table labels
- clearer column labels
- schema-aware hints
- more understandable field selection
- relationship guidance

If no schema documentation exists, SQL Workspace behaves as before.

## Usage in Widgets

When schema documentation exists, Widgets can use it for:
- clearer field names
- better field selection labels
- more understandable configuration flows

If no schema documentation exists, Widgets behave as before.

## System tables

System tables (`sys_*`) are treated differently:
- descriptions are provided by the application
- they are read-only
- they are mainly relevant for admin and transparency scenarios

Users can inspect this metadata, but do not edit it manually.

## Privacy and security

Schema Documentation follows the local-first design of LiteBI Studio.

Important principles:
- all processing remains local in the browser
- no row-level data is exported through this feature
- schema export contains metadata only
- no external service is required for normal usage

## Recommended workflow

1. Import data into LiteBI Studio.
2. Open `Data Management > Structure & Schema`.
3. Add semantic names and descriptions for key tables and columns.
4. Document important relationships.
5. Run schema validation.
6. Use the enriched schema in SQL Workspace and Widgets.
7. Export schema metadata if you want to review or enrich it externally.
8. Re-import and merge reviewed metadata changes.

## Notes

- Schema Documentation is an optional semantic layer.
- It improves usability and transparency, but does not replace physical schema design.
- Relationship plausibility checks are guidance, not absolute truth.
- Imported metadata should always be reviewed before merge.
