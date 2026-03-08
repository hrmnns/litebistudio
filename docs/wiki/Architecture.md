# Architecture

_Last updated: 2026-03-08_

LiteBI Studio runs fully in the browser:

- React + TypeScript + Vite UI
- SQLite WASM database
- OPFS persistent storage (with in-memory fallback)
- No backend service

Core repository areas:

- `src/app/` UI views and shared components
- `src/lib/` database, repositories, security, utilities
- `src/locales/` i18n resources (DE/EN)
- `docs/` project and operational documentation

## Runtime Model

- UI shell and views run in the main thread.
- Database work runs in a dedicated worker.
- Persistence uses OPFS where available, with memory fallback.

## Key Principles

- No backend dependencies for core app functionality.
- Sensitive data stays local unless user exports.
- Backward compatibility for critical user flows is prioritized.
