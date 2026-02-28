import { describe, expect, it } from 'vitest';
import { resetDatabaseObjectsInPlace, type ResetExecOptions } from './dbFactoryReset';

type ObjType = 'view' | 'table' | 'trigger';
type ObjState = Record<ObjType, Set<string>>;

class MockDb {
    public readonly state: ObjState = {
        view: new Set<string>(),
        table: new Set<string>(),
        trigger: new Set<string>()
    };
    public readonly statements: string[] = [];
    public failOnDropTableName: string | null = null;

    exec(sqlOrOpts: string | ResetExecOptions): void {
        if (typeof sqlOrOpts === 'string') {
            this.handleSql(sqlOrOpts);
            return;
        }

        const sql = sqlOrOpts.sql;
        if (!sqlOrOpts.callback) return;
        if (sql.includes("type='view'")) {
            for (const name of this.state.view) sqlOrOpts.callback({ name });
        } else if (sql.includes("type='table'")) {
            for (const name of this.state.table) sqlOrOpts.callback({ name });
        } else if (sql.includes("type='trigger'")) {
            for (const name of this.state.trigger) sqlOrOpts.callback({ name });
        }
    }

    private handleSql(sql: string): void {
        const normalized = sql.trim();
        this.statements.push(normalized);
        const dropView = normalized.match(/^DROP VIEW IF EXISTS "(.+)"$/i);
        if (dropView) {
            this.state.view.delete(dropView[1].replace(/""/g, '"'));
            return;
        }
        const dropTable = normalized.match(/^DROP TABLE IF EXISTS "(.+)"$/i);
        if (dropTable) {
            const tableName = dropTable[1].replace(/""/g, '"');
            if (this.failOnDropTableName === tableName) {
                throw new Error(`failed to drop table ${tableName}`);
            }
            this.state.table.delete(tableName);
            return;
        }
        const dropTrigger = normalized.match(/^DROP TRIGGER IF EXISTS "(.+)"$/i);
        if (dropTrigger) {
            this.state.trigger.delete(dropTrigger[1].replace(/""/g, '"'));
            return;
        }
    }
}

describe('resetDatabaseObjectsInPlace', () => {
    it('drops user views, tables and triggers', () => {
        const db = new MockDb();
        db.state.view.add('usr_sales_view');
        db.state.view.add('custom"quoted_view');
        db.state.table.add('usr_sales');
        db.state.table.add('sys_worklist');
        db.state.trigger.add('usr_sales_ai');

        resetDatabaseObjectsInPlace(db);

        expect(db.state.view.size).toBe(0);
        expect(db.state.table.size).toBe(0);
        expect(db.state.trigger.size).toBe(0);
    });

    it('rolls back and rethrows when dropping objects fails', () => {
        const db = new MockDb();
        db.state.view.add('usr_sales_view');
        db.state.table.add('usr_sales');
        db.failOnDropTableName = 'usr_sales';

        expect(() => resetDatabaseObjectsInPlace(db)).toThrowError('failed to drop table usr_sales');
        expect(db.statements).toContain('ROLLBACK');
        expect(db.statements.at(-1)).toBe('PRAGMA foreign_keys = ON');
    });
});
