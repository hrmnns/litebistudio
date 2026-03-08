import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqlStatementRepository } from './SqlStatementRepository';

const {
    runQueryMock,
    runManagedQueryMock,
    notifyDbChangeMock
} = vi.hoisted(() => ({
    runQueryMock: vi.fn(async () => []),
    runManagedQueryMock: vi.fn(async () => []),
    notifyDbChangeMock: vi.fn()
}));

vi.mock('../db', () => ({
    runQuery: (...args: unknown[]) => (runQueryMock as unknown as (...inner: unknown[]) => unknown)(...args),
    runManagedQuery: (...args: unknown[]) => (runManagedQueryMock as unknown as (...inner: unknown[]) => unknown)(...args),
    notifyDbChange: (...args: unknown[]) => (notifyDbChangeMock as unknown as (...inner: unknown[]) => unknown)(...args)
}));

describe('SqlStatementRepository save/use flow', () => {
    beforeEach(() => {
        runQueryMock.mockReset();
        runManagedQueryMock.mockReset();
        notifyDbChangeMock.mockReset();
    });

    it('inserts a new sql statement when id does not exist', async () => {
        (runQueryMock as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce([]);
        const repo = createSqlStatementRepository();

        await repo.saveSqlStatement({
            id: 'stmt-1',
            name: 'My SQL',
            sql_text: 'SELECT 1',
            scope: 'global'
        });

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        const firstSql = (runManagedQueryMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
        expect(String(firstSql)).toContain('INSERT INTO sys_sql_statement');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });

    it('updates existing sql statement when id already exists', async () => {
        (runQueryMock as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce([{ id: 'stmt-1' }]);
        const repo = createSqlStatementRepository();

        await repo.saveSqlStatement({
            id: 'stmt-1',
            name: 'My SQL',
            sql_text: 'SELECT 2',
            scope: 'global'
        });

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        const firstSql = (runManagedQueryMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
        expect(String(firstSql)).toContain('UPDATE sys_sql_statement');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });

    it('increments usage metadata when a statement is executed/opened', async () => {
        const repo = createSqlStatementRepository();
        await repo.markSqlStatementUsed('stmt-9');

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        const firstSql = (runManagedQueryMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
        expect(String(firstSql)).toContain('SET use_count = COALESCE(use_count, 0) + 1');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });
});
