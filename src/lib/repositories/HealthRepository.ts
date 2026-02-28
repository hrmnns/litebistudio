import { runQuery, notifyDbChange } from '../db';

export interface HealthSnapshotInput {
    id?: string;
    scope?: 'database' | 'client' | 'combined';
    status: 'ok' | 'warning' | 'error';
    score: number;
    checksRun: number;
    findings: unknown[];
    metadata?: Record<string, unknown> | null;
}

interface HealthRepositoryDeps {
    isAdminModeActive: () => boolean;
    getSystemTableWriteBlockedMessage: () => string;
}

export function createHealthRepository(deps: HealthRepositoryDeps) {
    return {
        async saveHealthSnapshot(input: HealthSnapshotInput): Promise<void> {
            const id = input.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `health_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
            await runQuery(
                `INSERT INTO sys_health_snapshot
                    (id, scope, status, score, checks_run, findings_json, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    input.scope || 'database',
                    input.status,
                    Math.max(0, Math.round(Number(input.score) || 0)),
                    Math.max(0, Math.round(Number(input.checksRun) || 0)),
                    JSON.stringify(Array.isArray(input.findings) ? input.findings : []),
                    input.metadata ? JSON.stringify(input.metadata) : null
                ]
            );
            notifyDbChange();
        },

        async pruneHealthSnapshots(params?: { olderThanDays?: number; keepLatest?: number }): Promise<number> {
            if (!deps.isAdminModeActive()) {
                throw new Error(deps.getSystemTableWriteBlockedMessage());
            }

            const olderThanDays = Math.max(1, Math.floor(Number(params?.olderThanDays ?? 90)));
            const keepLatest = Math.max(0, Math.floor(Number(params?.keepLatest ?? 200)));
            const olderThanModifier = `-${olderThanDays} days`;

            await runQuery(
                `
                DELETE FROM sys_health_snapshot
                WHERE id NOT IN (
                    SELECT id
                    FROM sys_health_snapshot
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                )
                AND datetime(created_at) < datetime('now', ?)
                `,
                [keepLatest, olderThanModifier]
            );
            const result = await runQuery('SELECT changes() AS count');
            const count = Number(result[0]?.count || 0);
            notifyDbChange(count, 'clear');
            return count;
        }
    };
}
