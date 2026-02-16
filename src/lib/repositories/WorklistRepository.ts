import { runQuery } from '../db';
import type { WorklistEntry } from '../../types';

export const WorklistRepository = {
    async getAll(): Promise<WorklistEntry[]> {
        return await runQuery(`
            SELECT * FROM worklist 
            ORDER BY added_at DESC
        `) as unknown as WorklistEntry[];
    },

    async getCount(): Promise<number> {
        const result = await runQuery("SELECT COUNT(*) as count FROM worklist WHERE status = 'open'");
        return (result[0]?.count as number) || 0;
    },

    /**
     * Toggles an item in the worklist (Add if not exists, remove if exists)
     */
    async toggle(sourceTable: string, sourceId: number, label?: string, context?: string): Promise<void> {
        const existing = await runQuery(
            'SELECT id FROM worklist WHERE source_table = ? AND source_id = ?',
            [sourceTable, sourceId]
        );

        if (existing.length > 0) {
            await runQuery(
                'DELETE FROM worklist WHERE source_table = ? AND source_id = ?',
                [sourceTable, sourceId]
            );
        } else {
            await runQuery(
                'INSERT INTO worklist (source_table, source_id, display_label, display_context) VALUES (?, ?, ?, ?)',
                [sourceTable, sourceId, label, context]
            );
        }
    },

    async isInWorklist(sourceTable: string, sourceId: number): Promise<boolean> {
        const result = await runQuery(
            'SELECT id FROM worklist WHERE source_table = ? AND source_id = ?',
            [sourceTable, sourceId]
        );
        return result.length > 0;
    }
};
