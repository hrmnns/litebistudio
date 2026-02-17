import { runQuery } from '../db';
import type { SystemRecord, TableColumn } from '../../types';

export const SystemRepository = {
    async getAll(): Promise<SystemRecord[]> {
        return await runQuery('SELECT * FROM systems ORDER BY sort_order ASC, name ASC') as unknown as SystemRecord[];
    },

    async getCount(): Promise<number> {
        const result = await runQuery('SELECT COUNT(*) as count FROM systems');
        return (result[0]?.count as number) || 0;
    },

    async add(system: Omit<SystemRecord, 'id' | 'sort_order' | 'is_favorite' | 'status'>): Promise<void> {
        // Get max sort order
        const maxSort = await runQuery('SELECT MAX(sort_order) as maxCorner FROM systems');
        const nextSort = ((maxSort[0]?.maxCorner as number) || 0) + 1;

        await runQuery(
            `INSERT INTO systems (name, url, category, sort_order, is_favorite, status) VALUES (?, ?, ?, ?, ?, 'unknown')`,
            [system.name, system.url, system.category, nextSort, 0]
        );
    },

    async update(id: number, system: Partial<SystemRecord>): Promise<void> {
        const updates: string[] = [];
        const params: (string | number | null)[] = [];

        if (system.name !== undefined) { updates.push('name = ?'); params.push(system.name); }
        if (system.url !== undefined) { updates.push('url = ?'); params.push(system.url); }
        if (system.category !== undefined) { updates.push('category = ?'); params.push(system.category); }
        if (system.sort_order !== undefined) { updates.push('sort_order = ?'); params.push(system.sort_order); }
        if (system.is_favorite !== undefined) { updates.push('is_favorite = ?'); params.push(system.is_favorite); }

        if (updates.length === 0) return;

        params.push(id);
        await runQuery(`UPDATE systems SET ${updates.join(', ')} WHERE id = ?`, params);
    },

    async delete(id: number): Promise<void> {
        await runQuery('DELETE FROM systems WHERE id = ?', [id]);
    },

    async getFavorites(limit: number = 4): Promise<SystemRecord[]> {
        return await runQuery('SELECT * FROM systems WHERE is_favorite = 1 ORDER BY sort_order ASC, name ASC LIMIT ?', [limit]) as unknown as SystemRecord[];
    },

    async getDatabaseStats(): Promise<{ tables: number; records: number }> {
        const tables = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") as { name: string }[];
        let totalRecords = 0;
        for (const table of tables) {
            const countResult = await runQuery(`SELECT count(*) as count FROM ${table.name}`);
            totalRecords += (countResult[0]?.count as number) || 0;
        }
        return { tables: tables.length, records: totalRecords };
    },

    async getDiagnostics(): Promise<any> {
        // We need to bypass runQuery wrappers to hit the worker directly for this custom message type if possible,
        // OR we can add a helper in db.ts. 
        // For now, let's assume we update db.ts to expose a way, OR we cheat and use runQuery for parts of it?
        // Actually, the cleanest way is to add a specific method in db.ts.
        // Let's modify db.ts first to export `getDiagnostics`.
        const result = await import('../db').then(m => m.getDiagnostics());
        return result;
    },

    async getTables(): Promise<string[]> {
        const result = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        return result.map((r: any) => r.name as string);
    },

    async getTableSchema(tableName: string): Promise<TableColumn[]> {
        return await runQuery(`PRAGMA table_info(${tableName})`) as unknown as TableColumn[];
    },

    async inspectTable(tableName: string, limit: number, searchTerm?: string): Promise<any[]> {
        let sql = `SELECT * FROM ${tableName}`;
        const params: any[] = [];

        if (searchTerm) {
            const schema = await this.getTableSchema(tableName);
            const searchFilter = schema
                .filter(col => col.type.toUpperCase().includes('TEXT') || col.name.toLowerCase().includes('id') || col.name.toLowerCase().includes('name'))
                .map(col => `${col.name} LIKE '%' || ? || '%'`)
                .join(' OR ');

            if (searchFilter) {
                sql += ` WHERE ${searchFilter}`;
                // Bind the search term for EACH filtered column
                params.push(...Array(schema.filter(col => col.type.toUpperCase().includes('TEXT') || col.name.toLowerCase().includes('id') || col.name.toLowerCase().includes('name')).length).fill(searchTerm));
            }
        }

        sql += ` ORDER BY rowid DESC LIMIT ?`;
        params.push(limit);

        return await runQuery(sql, params);
    },

    async executeRaw(sql: string): Promise<any[]> {
        // Basic safety check could go here, but this is an admin tool
        return await runQuery(sql);
    }
};
