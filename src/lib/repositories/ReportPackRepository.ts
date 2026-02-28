import { runQuery, notifyDbChange } from '../db';
import type { DbRow } from '../../types';

interface ReportPackInput {
    id: string;
    name: string;
    category?: string | null;
    description?: string | null;
    config: unknown;
}

export function createReportPackRepository() {
    return {
        async getReportPacks(): Promise<DbRow[]> {
            const result = await runQuery('SELECT * FROM sys_report_packs ORDER BY created_at DESC');
            return result.map((r) => ({
                ...r,
                category: typeof r.category === 'string' && r.category.trim().length > 0 ? r.category : 'General',
                config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config
            }));
        },

        async saveReportPack(pack: ReportPackInput): Promise<void> {
            const existing = await runQuery('SELECT id FROM sys_report_packs WHERE id = ?', [pack.id]);
            if (existing.length > 0) {
                await runQuery(
                    'UPDATE sys_report_packs SET name = ?, category = ?, description = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [pack.name, pack.category || 'General', pack.description, JSON.stringify(pack.config), pack.id]
                );
            } else {
                await runQuery(
                    'INSERT INTO sys_report_packs (id, name, category, description, config) VALUES (?, ?, ?, ?, ?)',
                    [pack.id, pack.name, pack.category || 'General', pack.description, JSON.stringify(pack.config)]
                );
            }
            notifyDbChange();
        },

        async deleteReportPack(id: string): Promise<void> {
            await runQuery('DELETE FROM sys_report_packs WHERE id = ?', [id]);
            notifyDbChange();
        }
    };
}
