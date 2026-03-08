import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    runQueryMock,
    runUserQueryMock,
    notifyDbChangeMock
} = vi.hoisted(() => ({
    runQueryMock: vi.fn(async () => []),
    runUserQueryMock: vi.fn(async () => []),
    notifyDbChangeMock: vi.fn()
}));

let adminMode = false;

vi.mock('../db', () => ({
    runQuery: (...args: unknown[]) => (runQueryMock as unknown as (...inner: unknown[]) => unknown)(...args),
    runUserQuery: (...args: unknown[]) => (runUserQueryMock as unknown as (...inner: unknown[]) => unknown)(...args),
    notifyDbChange: (...args: unknown[]) => (notifyDbChangeMock as unknown as (...inner: unknown[]) => unknown)(...args),
    getDiagnostics: vi.fn(async () => ({})),
    getDatabaseHealth: vi.fn(async () => ({})),
    getStorageStatus: vi.fn(async () => ({ mode: 'opfs', reason: null })),
    abortActiveQueries: vi.fn(async () => false),
    genericBulkInsert: vi.fn(async () => 0)
}));

vi.mock('../security/runtimeFlags', () => ({
    isAdminModeRuntimeActive: () => adminMode
}));

vi.mock('./HealthRepository', () => ({ createHealthRepository: () => ({}) }));
vi.mock('./WidgetRepository', () => ({ createWidgetRepository: () => ({}) }));
vi.mock('./ReportPackRepository', () => ({ createReportPackRepository: () => ({}) }));
vi.mock('./SqlStatementRepository', () => ({ createSqlStatementRepository: () => ({}) }));
vi.mock('./WorklistRepository', () => ({ createWorklistRepository: () => ({}) }));
vi.mock('./BackupHistoryRepository', () => ({ createBackupHistoryRepository: () => ({}) }));

import { SystemRepository } from './SystemRepository';

describe('SystemRepository.executeRaw security guard', () => {
    beforeEach(() => {
        adminMode = false;
        runQueryMock.mockClear();
        runUserQueryMock.mockClear();
        notifyDbChangeMock.mockClear();
    });

    it('blocks quoted sys_* writes for non-admin', async () => {
        await expect(
            SystemRepository.executeRaw('UPDATE "sys_settings" SET value = ? WHERE key = ?', ['x', 'k'])
        ).rejects.toThrow(/system tables/i);
        expect(runUserQueryMock).not.toHaveBeenCalled();
    });

    it('allows sys_* writes for admin mode', async () => {
        adminMode = true;
        await expect(
            SystemRepository.executeRaw('UPDATE "sys_settings" SET value = ? WHERE key = ?', ['x', 'k'])
        ).resolves.toEqual([]);
        expect(runUserQueryMock).toHaveBeenCalledTimes(1);
    });

    it('keeps non-system write path working and emits db change', async () => {
        await expect(
            SystemRepository.executeRaw('UPDATE demo_table SET value = 1 WHERE id = 5')
        ).resolves.toEqual([]);
        expect(runUserQueryMock).toHaveBeenCalledTimes(1);
        expect(notifyDbChangeMock).toHaveBeenCalledTimes(1);
    });
});
