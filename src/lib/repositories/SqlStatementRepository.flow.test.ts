import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqlStatementRepository } from './SqlStatementRepository';

const runQueryMock = vi.fn(async () => []);
const runManagedQueryMock = vi.fn(async () => []);
const notifyDbChangeMock = vi.fn();

vi.mock('../db', () => ({
    runQuery: (...args: unknown[]) => runQueryMock(...args),
    runManagedQuery: (...args: unknown[]) => runManagedQueryMock(...args),
    notifyDbChange: (...args: unknown[]) => notifyDbChangeMock(...args)
}));

describe('SqlStatementRepository save/use flow', () => {
    beforeEach(() => {
        runQueryMock.mockReset();
        runManagedQueryMock.mockReset();
        notifyDbChangeMock.mockReset();
    });

    it('inserts a new sql statement when id does not exist', async () => {
        runQueryMock.mockResolvedValueOnce([]);
        const repo = createSqlStatementRepository();

        await repo.saveSqlStatement({
            id: 'stmt-1',
            name: 'My SQL',
            sql_text: 'SELECT 1',
            scope: 'global'
        });

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        expect(String(runManagedQueryMock.mock.calls[0][0])).toContain('INSERT INTO sys_sql_statement');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });

    it('updates existing sql statement when id already exists', async () => {
        runQueryMock.mockResolvedValueOnce([{ id: 'stmt-1' }]);
        const repo = createSqlStatementRepository();

        await repo.saveSqlStatement({
            id: 'stmt-1',
            name: 'My SQL',
            sql_text: 'SELECT 2',
            scope: 'global'
        });

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        expect(String(runManagedQueryMock.mock.calls[0][0])).toContain('UPDATE sys_sql_statement');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });

    it('increments usage metadata when a statement is executed/opened', async () => {
        const repo = createSqlStatementRepository();
        await repo.markSqlStatementUsed('stmt-9');

        expect(runManagedQueryMock).toHaveBeenCalledTimes(1);
        expect(String(runManagedQueryMock.mock.calls[0][0])).toContain('SET use_count = COALESCE(use_count, 0) + 1');
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });
});

