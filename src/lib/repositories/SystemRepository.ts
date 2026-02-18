import { runQuery, notifyDbChange } from '../db';
import type { TableColumn } from '../../types';
import { isValidIdentifier } from '../utils';

export const SystemRepository = {
    async getDatabaseStats(): Promise<{ tables: number; records: number }> {
        const tables = await this.getTables();
        let totalRecords = 0;
        for (const table of tables) {
            const countResult = await runQuery(`SELECT count(*) as count FROM "${table}"`);
            totalRecords += (countResult[0]?.count as number) || 0;
        }
        return { tables: tables.length, records: totalRecords };
    },

    async getTotalRecordCount(): Promise<number> {
        const stats = await this.getDatabaseStats();
        return stats.records;
    },

    async getDiagnostics(): Promise<any> {
        return await import('../db').then(m => m.getDiagnostics());
    },

    async getTables(): Promise<string[]> {
        const result = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        return result.map((r: any) => r.name as string);
    },

    async getTableSchema(tableName: string): Promise<TableColumn[]> {
        return await runQuery(`PRAGMA table_info(${tableName})`) as unknown as TableColumn[];
    },

    async inspectTable(tableName: string, limit: number, searchTerm?: string): Promise<any[]> {
        if (!isValidIdentifier(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
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
                params.push(...Array(schema.filter(col => col.type.toUpperCase().includes('TEXT') || col.name.toLowerCase().includes('id') || col.name.toLowerCase().includes('name')).length).fill(searchTerm));
            }
        }

        sql += ` ORDER BY rowid DESC LIMIT ?`;
        params.push(limit);

        return await runQuery(sql, params);
    },

    async executeRaw(sql: string, bind?: any[]): Promise<any[]> {
        const result = await runQuery(sql, bind);

        // Simple heuristic to detect write operations
        const upperSql = sql.trim().toUpperCase();
        if (upperSql.startsWith('INSERT') ||
            upperSql.startsWith('UPDATE') ||
            upperSql.startsWith('DELETE') ||
            upperSql.startsWith('DROP') ||
            upperSql.startsWith('CREATE') ||
            upperSql.startsWith('ALTER')) {
            notifyDbChange();
        }

        return result;
    },

    async bulkInsert(tableName: string, records: any[]): Promise<number> {
        const { genericBulkInsert } = await import('../db');
        const count = await genericBulkInsert(tableName, records);
        notifyDbChange(count);
        return count;
    },

    // User Widgets (Generic BI)
    async getUserWidgets(): Promise<any[]> {
        return await runQuery('SELECT * FROM sys_user_widgets ORDER BY created_at DESC');
    },

    async saveUserWidget(widget: any): Promise<void> {
        const existing = await runQuery('SELECT id FROM sys_user_widgets WHERE id = ?', [widget.id]);
        if (existing.length > 0) {
            await runQuery(
                'UPDATE sys_user_widgets SET name = ?, description = ?, sql_query = ?, visualization_config = ?, visual_builder_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [widget.name, widget.description, widget.sql_query, JSON.stringify(widget.visualization_config), JSON.stringify(widget.visual_builder_config), widget.id]
            );
        } else {
            await runQuery(
                'INSERT INTO sys_user_widgets (id, name, description, sql_query, visualization_config, visual_builder_config) VALUES (?, ?, ?, ?, ?, ?)',
                [widget.id, widget.name, widget.description, widget.sql_query, JSON.stringify(widget.visualization_config), JSON.stringify(widget.visual_builder_config)]
            );
        }
        notifyDbChange();
    },

    async deleteUserWidget(id: string): Promise<void> {
        await runQuery('DELETE FROM sys_user_widgets WHERE id = ?', [id]);
        notifyDbChange();
    },

    // Dashboards (Multi-Dashboard Support)
    async getDashboards(): Promise<any[]> {
        return await runQuery('SELECT * FROM sys_dashboards ORDER BY created_at ASC');
    },

    async saveDashboard(dashboard: any): Promise<void> {
        const existing = await runQuery('SELECT id FROM sys_dashboards WHERE id = ?', [dashboard.id]);
        if (existing.length > 0) {
            await runQuery(
                'UPDATE sys_dashboards SET name = ?, layout = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [dashboard.name, JSON.stringify(dashboard.layout), dashboard.is_default ? 1 : 0, dashboard.id]
            );
        } else {
            await runQuery(
                'INSERT INTO sys_dashboards (id, name, layout, is_default) VALUES (?, ?, ?, ?)',
                [dashboard.id, dashboard.name, JSON.stringify(dashboard.layout), dashboard.is_default ? 1 : 0]
            );
        }
        notifyDbChange();
    },

    async deleteDashboard(id: string): Promise<void> {
        await runQuery('DELETE FROM sys_dashboards WHERE id = ?', [id]);
        notifyDbChange();
    },

    // Worklist Management
    async getWorklist(): Promise<any[]> {
        return await runQuery('SELECT * FROM sys_worklist ORDER BY created_at DESC');
    },

    async updateWorklistItem(id: number | string, data: { status?: string; comment?: string }): Promise<void> {
        const fields: string[] = [];
        const params: any[] = [];

        if (data.status !== undefined) {
            fields.push('status = ?');
            params.push(data.status);
        }
        if (data.comment !== undefined) {
            fields.push('comment = ?');
            params.push(data.comment);
        }

        if (fields.length === 0) return;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(Number(id)); // Force number for ID consistency

        const sql = `UPDATE sys_worklist SET ${fields.join(', ')} WHERE id = ?`;
        await runQuery(sql, params);
        notifyDbChange();
    },

    async checkRecordExists(tableName: string, id: string | number): Promise<boolean> {
        if (!isValidIdentifier(tableName)) return false;
        try {
            const result = await runQuery(`SELECT 1 FROM "${tableName}" WHERE id = ?`, [id]);
            return result.length > 0;
        } catch (e) {
            return false;
        }
    }
};
