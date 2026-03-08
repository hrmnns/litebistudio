import { describe, expect, it } from 'vitest';
import { analyzeSqlStatements, hasSystemWriteWithoutAdmin, isReadOnlySql } from './sqlAnalysis';

describe('sqlAnalysis system write detection', () => {
    it('detects unquoted sys_* writes for non-admin', () => {
        expect(hasSystemWriteWithoutAdmin('UPDATE sys_worklist SET status = "done"', false)).toBe(true);
    });

    it('detects double-quoted sys_* writes for non-admin', () => {
        expect(hasSystemWriteWithoutAdmin('UPDATE "sys_worklist" SET status = "done"', false)).toBe(true);
    });

    it('detects backtick-quoted sys_* writes for non-admin', () => {
        expect(hasSystemWriteWithoutAdmin('UPDATE `sys_worklist` SET status = "done"', false)).toBe(true);
    });

    it('detects bracket-quoted sys_* writes for non-admin', () => {
        expect(hasSystemWriteWithoutAdmin('UPDATE [sys_worklist] SET status = "done"', false)).toBe(true);
    });

    it('does not detect sys_* write when only string literal contains sys_*', () => {
        expect(hasSystemWriteWithoutAdmin("SELECT 'sys_worklist' AS table_name", false)).toBe(false);
    });

    it('allows sys_* write in admin mode', () => {
        expect(hasSystemWriteWithoutAdmin('DELETE FROM "sys_worklist"', true)).toBe(false);
    });
});

describe('sqlAnalysis read/write classification', () => {
    it('marks plain select as read-only', () => {
        expect(isReadOnlySql('SELECT * FROM demo')).toBe(true);
    });

    it('marks mixed statement batches as not read-only', () => {
        expect(isReadOnlySql('SELECT * FROM demo; UPDATE "sys_worklist" SET status = "done"')).toBe(false);
    });

    it('marks quoted system table usage on write statements', () => {
        const analysis = analyzeSqlStatements('UPDATE "sys_sql_statement" SET name = name');
        expect(analysis).toHaveLength(1);
        expect(analysis[0].kind).toBe('write');
        expect(analysis[0].touchesSystemTables).toBe(true);
    });
});

