# Security and Privacy

_Last updated: 2026-03-08_

## Principles

- Local-first data handling
- no telemetry by default
- controlled write access for privileged paths

## Technical Controls

- SQL write-path checks for protected system tables (`sys_*`)
- app lock with salted PIN storage model
- encrypted backup workflows

## Operational Guidance

- Keep branch protections and CI quality gates enabled.
- Review security-relevant changes with explicit no-regression checks.

## Related

- [Data Model and Migrations](Data-Model-and-Migrations)
- [Operations Runbook](Operations-Runbook)
