# Data Model and Migrations

_Last updated: 2026-03-08_

## Scope

This page documents:

- system table conventions (`sys_*`)
- migration behavior and safeguards
- compatibility expectations for persisted data

## Guidelines

- Treat schema migrations as backward-compatible whenever possible.
- Do not advance migration version if migration execution fails.
- Add no-regression checks for data flows touched by schema changes.

## Verification

- Migration tests and startup migration path should pass in CI.
- Validate critical read/write flows after migration changes.

## Related

- [SQL Workspace and Tables](SQL-Workspace-and-Tables)
- [Security and Privacy](Security-and-Privacy)
