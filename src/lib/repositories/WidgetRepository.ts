import { runQuery, notifyDbChange } from '../db';
import type { DbRow } from '../../types';

interface UserWidgetInput {
    id: string;
    name: string;
    description?: string | null;
    sql_statement_id?: string | null;
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

export function createWidgetRepository() {
    return {
        async getUserWidgets(): Promise<DbRow[]> {
            return await runQuery('SELECT * FROM sys_user_widgets ORDER BY created_at DESC');
        },

        async saveUserWidget(widget: UserWidgetInput): Promise<void> {
            const existing = await runQuery('SELECT id FROM sys_user_widgets WHERE id = ?', [widget.id]);
            if (existing.length > 0) {
                await runQuery(
                    'UPDATE sys_user_widgets SET name = ?, description = ?, sql_statement_id = ?, sql_query = ?, visualization_config = ?, visual_builder_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [widget.name, widget.description, widget.sql_statement_id || null, widget.sql_query, JSON.stringify(widget.visualization_config), JSON.stringify(widget.visual_builder_config), widget.id]
                );
            } else {
                await runQuery(
                    'INSERT INTO sys_user_widgets (id, name, description, sql_statement_id, sql_query, visualization_config, visual_builder_config) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [widget.id, widget.name, widget.description, widget.sql_statement_id || null, widget.sql_query, JSON.stringify(widget.visualization_config), JSON.stringify(widget.visual_builder_config)]
                );
            }
            notifyDbChange();
        },

        async deleteUserWidget(id: string): Promise<void> {
            await runQuery('DELETE FROM sys_user_widgets WHERE id = ?', [id]);
            notifyDbChange();
        },

        async getDashboards(): Promise<DbRow[]> {
            const result = await runQuery('SELECT * FROM sys_dashboards ORDER BY created_at ASC');
            return result.map((r) => ({
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
        }
    };
}
