# Single Instance Policy

LiteBI Studio is a **local-first** application that runs its own database engine (SQLite WASM) directly within your browser tab. Because of how browser storage and database locking work, we strongly recommend **opening only one instance (tab) of LiteBI Studio at a time.**

## 🛑 Why only one tab?

Opening LiteBI Studio in multiple tabs simultaneously can lead to technical issues and data risks. Here are the primary reasons:

### 1. Database Locking (SQLite & IndexedDB)
LiteBI Studio uses **SQLite WASM with VFS** to persist data in your browser's **IndexedDB**. 
- SQLite handles concurrency by "locking" the database file during write operations.
- When two tabs try to access the same local database, they may conflict over these locks.
- This can result in "Database is locked" errors, preventing you from saving your work or importing new data.

### 2. Data Integrity Risk
If multiple tabs are open and performing operations:
- **Last-Write-Wins**: Changes made in one tab might be overwritten by another tab if they both save to the same system settings or metadata records.
- **State Mismatch**: Tab A might not see the tables imported in Tab B until it is refreshed, leading to confusion and potential errors during query execution.

### 3. Resource Consumption (WASM & RAM)
Every instance of LiteBI Studio loads:
- A dedicated **WebAssembly (WASM)** binary for the SQLite engine.
- A **Web Worker** to handle database operations off the main UI thread.
- Memory caches for data processing.
Running multiple tabs increases the memory footprint and CPU usage of your browser unnecessarily.

## ✅ Recommendation

To ensure a smooth and safe experience:
1.  **Work in a single tab**: If you need to check something else, finish your current task or close the tab afterwards.
2.  **Refresh if needed**: If you suspect the state is out of sync (e.g., after a large import in a separate session), simply refresh the page.
3.  **Check for PIN**: If you use an App-PIN, each tab requires its own authentication session.

---

*Ensuring data safety is our top priority for local-first BI.*
