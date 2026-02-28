import { runQuery, notifyDbChange } from '../db';

export interface SqlStatementRecord {
    id: string;
    name: string;
    sql_text: string;
    description: string;
    scope: string;
    tags: string;
    is_favorite: number;
    use_count: number;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
}

interface SqlStatementInput {
    id: string;
    name: string;
    sql_text: string;
    description?: string | null;
    scope?: string;
    tags?: string | null;
    is_favorite?: boolean | number;
}

export function createSqlStatementRepository() {
    return {
        async listSqlStatements(scope: string = 'global'): Promise<SqlStatementRecord[]> {
            const rows = await runQuery(
                `SELECT id, name, sql_text, description, scope, tags, is_favorite, use_count, last_used_at, created_at, updated_at
                 FROM sys_sql_statement
                 WHERE scope = ?
                 ORDER BY is_favorite DESC, COALESCE(last_used_at, updated_at, created_at) DESC, name ASC`,
                [scope]
            );
            return rows as unknown as SqlStatementRecord[];
        },

        async saveSqlStatement(statement: SqlStatementInput): Promise<void> {
            const scope = (statement.scope || 'global').trim() || 'global';
            const existing = await runQuery('SELECT id FROM sys_sql_statement WHERE id = ?', [statement.id]);
            if (existing.length > 0) {
                await runQuery(
                    `UPDATE sys_sql_statement
                     SET name = ?, sql_text = ?, description = ?, scope = ?, tags = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        statement.name,
                        statement.sql_text,
                        statement.description || '',
                        scope,
                        statement.tags || '',
                        statement.is_favorite ? 1 : 0,
                        statement.id
                    ]
                );
            } else {
                await runQuery(
                    `INSERT INTO sys_sql_statement (id, name, sql_text, description, scope, tags, is_favorite)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        statement.id,
                        statement.name,
                        statement.sql_text,
                        statement.description || '',
                        scope,
                        statement.tags || '',
                        statement.is_favorite ? 1 : 0
                    ]
                );
            }
            notifyDbChange();
        },

        async deleteSqlStatement(id: string): Promise<void> {
            await runQuery('DELETE FROM sys_sql_statement WHERE id = ?', [id]);
            notifyDbChange();
        },

        async setSqlStatementFavorite(id: string, isFavorite: boolean): Promise<void> {
            await runQuery(
                'UPDATE sys_sql_statement SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [isFavorite ? 1 : 0, id]
            );
            notifyDbChange();
        },

        async markSqlStatementUsed(id: string): Promise<void> {
            await runQuery(
                `UPDATE sys_sql_statement
                 SET use_count = COALESCE(use_count, 0) + 1,
                     last_used_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [id]
            );
            notifyDbChange();
        }
    };
}
