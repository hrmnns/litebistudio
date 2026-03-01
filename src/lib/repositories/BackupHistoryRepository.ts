import { runQuery, notifyDbChange } from '../db';
import type { DbRow } from '../../types';

const BACKUP_HISTORY_KEY = 'backup_history_v1';
const MAX_BACKUP_HISTORY_ENTRIES = 200;

export interface BackupHistoryEntry {
    id: string;
    timestamp: string;
    action: 'backup' | 'restore';
    status: 'success' | 'warning' | 'error';
    fileName: string;
    locationType: 'remembered_folder' | 'browser_download' | 'file_picker' | 'unknown';
    locationLabel?: string;
    encrypted?: boolean;
    message?: string;
}

interface BackupHistoryInput {
    action: BackupHistoryEntry['action'];
    status: BackupHistoryEntry['status'];
    fileName: string;
    locationType?: BackupHistoryEntry['locationType'];
    locationLabel?: string;
    encrypted?: boolean;
    message?: string;
}

function normalizeHistoryEntry(value: unknown): BackupHistoryEntry | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Partial<BackupHistoryEntry>;
    if (!row.id || !row.timestamp || !row.action || !row.status || !row.fileName) return null;
    const action = row.action === 'backup' || row.action === 'restore' ? row.action : null;
    const status = row.status === 'success' || row.status === 'warning' || row.status === 'error' ? row.status : null;
    if (!action || !status) return null;
    const locationType = row.locationType === 'remembered_folder'
        || row.locationType === 'browser_download'
        || row.locationType === 'file_picker'
        || row.locationType === 'unknown'
        ? row.locationType
        : 'unknown';

    return {
        id: String(row.id),
        timestamp: String(row.timestamp),
        action,
        status,
        fileName: String(row.fileName),
        locationType,
        locationLabel: typeof row.locationLabel === 'string' ? row.locationLabel : '',
        encrypted: Boolean(row.encrypted),
        message: typeof row.message === 'string' ? row.message : ''
    };
}

async function readHistory(): Promise<BackupHistoryEntry[]> {
    const rows = await runQuery('SELECT value FROM sys_settings WHERE key = ?', [BACKUP_HISTORY_KEY]) as DbRow[];
    const raw = typeof rows[0]?.value === 'string' ? rows[0].value : '';
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeHistoryEntry)
            .filter((entry): entry is BackupHistoryEntry => Boolean(entry));
    } catch {
        return [];
    }
}

async function writeHistory(entries: BackupHistoryEntry[]): Promise<void> {
    await runQuery(
        'INSERT OR REPLACE INTO sys_settings (key, value) VALUES (?, ?)',
        [BACKUP_HISTORY_KEY, JSON.stringify(entries)]
    );
    notifyDbChange();
}

export function createBackupHistoryRepository() {
    return {
        async listBackupHistory(limit: number = 50): Promise<BackupHistoryEntry[]> {
            const clampedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
            const entries = await readHistory();
            return entries
                .slice()
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, clampedLimit);
        },

        async appendBackupHistory(input: BackupHistoryInput): Promise<void> {
            const current = await readHistory();
            const entry: BackupHistoryEntry = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                action: input.action,
                status: input.status,
                fileName: (input.fileName || '').trim() || '-',
                locationType: input.locationType || 'unknown',
                locationLabel: (input.locationLabel || '').trim(),
                encrypted: Boolean(input.encrypted),
                message: (input.message || '').trim()
            };
            const next = [entry, ...current].slice(0, MAX_BACKUP_HISTORY_ENTRIES);
            await writeHistory(next);
        },

        async clearBackupHistory(): Promise<void> {
            await writeHistory([]);
        }
    };
}
