# Getting Started

_Last updated: 2026-03-11_

## Try Instantly (No Installation)

You can use LiteBI Studio directly in your browser without installing anything:

- https://hrmnns.github.io/litebistudio/

Fastest path to first value:

1. Open the URL.
2. Go to **Data Management**.
3. Start with **Excel import** and load your first dataset.

This is the recommended entry point for new users who want to evaluate the tool quickly.

Privacy note:

- Your data stays local in your browser.
- No dataset is uploaded to an external server during normal app usage.

## Prerequisites

- Node.js 20.x or later
- npm

## Local Development

```bash
npm install
npm run dev
```

Optional (recommended once per clone):

```bash
npm run hooks:install
```

This enables the repository git hooks (`.githooks/`) so `build` and `test` run automatically on push.

## Local Quality Gates

```bash
npm run lint
npm run check:i18n
npm run check:encoding
npm run build
npm run test
```

## Quick Verification Paths

### UI smoke path

1. Open `Tables`
2. Open `SQL Workspace`
3. Run a simple query (`SELECT 1`)
4. Confirm results are visible and export behaves correctly

### Widget smoke path

1. Open `Widgets`
2. Load an existing widget
3. Run query
4. Open configuration panel and verify graphic preview updates
5. Save and confirm dirty marker clears

## Troubleshooting

- If build fails locally, run `npm ci` and retry quality gates in the same order.
- If tests fail only in CI, compare local node version and ensure you use Node 20.x.
- For OPFS/SQLite runtime issues, see [Operations Runbook](Operations-Runbook).

## Related

- [Architecture](Architecture)
- [SQL Workspace and Tables](SQL-Workspace-and-Tables)
- [Operations Runbook](Operations-Runbook)
- [Release Process](Release-Process)
