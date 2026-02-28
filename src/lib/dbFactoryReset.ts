type SqliteRow = Record<string, unknown>;

export interface ResetExecOptions {
    sql: string;
    rowMode?: 'object';
    callback?: (row: SqliteRow) => void;
}

export interface ResetDatabaseLike {
    exec(sqlOrOpts: string | ResetExecOptions): void;
}

function getRowString(row: SqliteRow, key: string): string {
    const value = row[key];
    return typeof value === 'string' ? value : '';
}

function escapeIdentifier(identifier: string): string {
    return identifier.replace(/"/g, '""');
}

export function resetDatabaseObjectsInPlace(database: ResetDatabaseLike): void {
    database.exec('PRAGMA foreign_keys = OFF');
    try {
        database.exec('BEGIN TRANSACTION');

        const views: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%'",
            rowMode: 'object',
            callback: (row) => views.push(getRowString(row, 'name'))
        });
        for (const viewName of views) {
            database.exec(`DROP VIEW IF EXISTS "${escapeIdentifier(viewName)}"`);
        }

        const tables: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            rowMode: 'object',
            callback: (row) => tables.push(getRowString(row, 'name'))
        });
        for (const tableName of tables) {
            database.exec(`DROP TABLE IF EXISTS "${escapeIdentifier(tableName)}"`);
        }

        const triggers: string[] = [];
        database.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'sqlite_%'",
            rowMode: 'object',
            callback: (row) => triggers.push(getRowString(row, 'name'))
        });
        for (const triggerName of triggers) {
            database.exec(`DROP TRIGGER IF EXISTS "${escapeIdentifier(triggerName)}"`);
        }

        database.exec('COMMIT');
    } catch (error) {
        try {
            database.exec('ROLLBACK');
        } catch {
            // Ignore rollback errors.
        }
        throw error;
    } finally {
        database.exec('PRAGMA foreign_keys = ON');
    }
}
