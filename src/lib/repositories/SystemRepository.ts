import { runQuery, notifyDbChange } from '../db';
import type { DbRow, TableColumn } from '../../types';
import { isValidIdentifier } from '../utils';

const schemaCache = new Map<string, TableColumn[]>();
type BindValue = string | number | null | undefined;

interface UserWidgetInput {
    id: string;
    name: string;
    description?: string | null;
    sql_query: string;
    visualization_config?: unknown;
    visual_builder_config?: unknown;
}

interface DashboardInput {
    id: string;
    name: string;
    layout: unknown;
    is_default?: boolean | number;
}

interface ReportPackInput {
    id: string;
    name: string;
    category?: string | null;
    description?: string | null;
    config: unknown;
}

interface RecordMetadata {
    exists: boolean;
    isInWorklist: boolean;
    worklistItem: DbRow | null;
}

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

    async getDiagnostics(): Promise<Record<string, unknown>> {
        return await import('../db').then(m => m.getDiagnostics());
    },

    async getTables(): Promise<string[]> {
        const result = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        return result
            .map((r: DbRow) => (typeof r.name === 'string' ? r.name : ''))
            .filter((name: string) => name.length > 0);
    },

    async getTableSchema(tableName: string): Promise<TableColumn[]> {
        if (!isValidIdentifier(tableName)) return [];
        if (schemaCache.has(tableName)) return schemaCache.get(tableName)!;

        const result = await runQuery(`PRAGMA table_info("${tableName}")`) as unknown as TableColumn[];
        schemaCache.set(tableName, result);
        return result;
    },

    async inspectTable(tableName: string, limit: number, searchTerm?: string): Promise<DbRow[]> {
        if (!isValidIdentifier(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
        // Fetch rowid aliased as _rowid to ensure every record has a unique identifier
        let sql = `SELECT rowid as _rowid, * FROM "${tableName}"`;
        const params: BindValue[] = [];

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

    async executeRaw(sql: string, bind?: BindValue[]): Promise<DbRow[]> {
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

    async bulkInsert(tableName: string, records: DbRow[]): Promise<number> {
        const { genericBulkInsert } = await import('../db');
        const count = await genericBulkInsert(tableName, records);
        notifyDbChange(count);
        return count;
    },

    // User Widgets (Generic BI)
    async getUserWidgets(): Promise<DbRow[]> {
        return await runQuery('SELECT * FROM sys_user_widgets ORDER BY created_at DESC');
    },

    async saveUserWidget(widget: UserWidgetInput): Promise<void> {
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
    async getDashboards(): Promise<DbRow[]> {
        const result = await runQuery('SELECT * FROM sys_dashboards ORDER BY created_at ASC');
        return result.map(r => ({
            ...r,
            layout: typeof r.layout === 'string' ? JSON.parse(r.layout) : r.layout
        }));
    },

    async saveDashboard(dashboard: DashboardInput, silent: boolean = false): Promise<void> {
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
        if (!silent) notifyDbChange();
    },

    async deleteDashboard(id: string): Promise<void> {
        await runQuery('DELETE FROM sys_dashboards WHERE id = ?', [id]);
        notifyDbChange();
    },

    // Report Packages
    async getReportPacks(): Promise<DbRow[]> {
        const result = await runQuery('SELECT * FROM sys_report_packs ORDER BY created_at DESC');
        return result.map(r => ({
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
    },

    // Worklist Management
    async getWorklist(): Promise<DbRow[]> {
        return await runQuery('SELECT * FROM sys_worklist ORDER BY created_at DESC');
    },

    async updateWorklistItem(id: number | string, data: { status?: string; comment?: string }): Promise<void> {
        const fields: string[] = [];
        const params: BindValue[] = [];

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
            // First try standard "id" column
            const result = await runQuery(`SELECT 1 FROM "${tableName}" WHERE id = ? LIMIT 1`, [id]);
            return result.length > 0;
        } catch {
            // Fallback: try to find the actual primary key name or use rowid
            try {
                const columns = await this.getTableSchema(tableName);
                const pk = columns.find((c: TableColumn) => c.pk === 1 || c.name.toLowerCase() === 'id')?.name;
                if (pk && pk.toLowerCase() !== 'id') {
                    const pkResult = await runQuery(`SELECT 1 FROM "${tableName}" WHERE "${pk}" = ? LIMIT 1`, [id]);
                    return pkResult.length > 0;
                }

                // Try rowid if no PK found
                const rowidResult = await runQuery(`SELECT 1 FROM "${tableName}" WHERE rowid = ? LIMIT 1`, [id]);
                return rowidResult.length > 0;
            } catch {
                return false;
            }
        }
    },

    async getRecordMetadata(tableName: string, id: string | number): Promise<RecordMetadata> {
        if (!isValidIdentifier(tableName)) return { exists: false, isInWorklist: false, worklistItem: null };
        if (id === undefined || id === null) return { exists: false, isInWorklist: false, worklistItem: null };

        // Execute queries with individual catch blocks to prevent a failure in one (e.g., missing ID column)
        // from crashing the entire metadata fetch array.
        // Note: SQLite column names are generally case-insensitive in queries, but we use "id" as standard.
        const [existsResult, worklistResult] = await Promise.all([
            runQuery(`SELECT 1 FROM "${tableName}" WHERE id = ? LIMIT 1`, [id]).catch(async () => {
                // Fallback 1: try to find the actual primary key name if standard "id" fails
                try {
                    const columns = await this.getTableSchema(tableName);
                    const pk = columns.find(c => c.pk === 1 || c.name.toLowerCase() === 'id')?.name;
                    if (pk && pk.toLowerCase() !== 'id') {
                        return await runQuery(`SELECT 1 FROM "${tableName}" WHERE "${pk}" = ? LIMIT 1`, [id]);
                    }

                    // Fallback 2: try rowid if no PK found or if the id looks like a rowid
                    return await runQuery(`SELECT 1 FROM "${tableName}" WHERE rowid = ? LIMIT 1`, [id]);
                } catch { /* ignore */ }
                return [];
            }),
            runQuery('SELECT * FROM sys_worklist WHERE source_table = ? AND source_id = ?', [tableName, id]).catch(() => [])
        ]);

        return {
            exists: existsResult.length > 0,
            isInWorklist: worklistResult.length > 0,
            worklistItem: worklistResult[0] || null
        };
    }
};
