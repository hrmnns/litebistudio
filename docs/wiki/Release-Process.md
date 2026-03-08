# Release Process

_Last updated: 2026-03-08_

## Versioning

- Update changes in `CHANGELOG.md` under `Unreleased`.
- At release time, move entries into a versioned section.

## Quality Gates

Run locally before release:

- `npm run lint`
- `npm run check:i18n`
- `npm run check:encoding`
- `npm run build`
- `npm run test`

## CI

- Workflow: `.github/workflows/ci.yml`
- Required check: `CI / quality-gates (pull_request)`

## Branch Protection

- Protect `main` with required status checks.
- Require pull request before merge.
- Block force-pushes on protected branches.

## Release Checklist

- Move relevant entries from `Unreleased` to the target version in `CHANGELOG.md`.
- Verify CI quality gates on the release PR.
- Tag and publish release notes based on changelog entries.
