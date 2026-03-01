import { runQuery, notifyDbChange } from '../db';
import type { DbRow, TableColumn } from '../../types';
import { isValidIdentifier } from '../utils';

interface RecordMetadata {
    exists: boolean;
    isInWorklist: boolean;
    worklistItem: DbRow | null;
}

interface WorklistRepositoryDeps {
    getTableSchema: (tableName: string) => Promise<TableColumn[]>;
}

export function createWorklistRepository(deps: WorklistRepositoryDeps) {
    return {
        async getWorklist(): Promise<DbRow[]> {
            return await runQuery('SELECT * FROM sys_worklist ORDER BY created_at DESC');
        },

        async addWorklistItem(data: {
            source_table: string;
            source_id: string | number;
            display_label: string;
            display_context: string;
            priority?: string;
            due_at?: string | null;
        }): Promise<void> {
            await runQuery(
                'INSERT INTO sys_worklist (source_table, source_id, display_label, display_context, priority, due_at) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    data.source_table,
                    data.source_id,
                    data.display_label,
                    data.display_context,
                    data.priority ?? 'normal',
                    data.due_at ?? null
                ]
            );
            notifyDbChange();
        },

        async removeWorklistItem(sourceTable: string, sourceId: string | number): Promise<void> {
            await runQuery(
                'DELETE FROM sys_worklist WHERE source_table = ? AND source_id = ?',
                [sourceTable, sourceId]
            );
            notifyDbChange();
        },

        async updateWorklistItem(id: number | string, data: { status?: string; comment?: string; priority?: string; due_at?: string | null }): Promise<void> {
            const fields: string[] = [];
            const params: Array<string | number | null | undefined> = [];

            if (data.status !== undefined) {
                fields.push('status = ?');
                params.push(data.status);
            }
            if (data.comment !== undefined) {
                fields.push('comment = ?');
                params.push(data.comment);
            }
            if (data.priority !== undefined) {
                fields.push('priority = ?');
                params.push(data.priority);
            }
            if (data.due_at !== undefined) {
                fields.push('due_at = ?');
                params.push(data.due_at);
            }

            if (fields.length === 0) return;

            fields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(Number(id));

            const sql = `UPDATE sys_worklist SET ${fields.join(', ')} WHERE id = ?`;
            await runQuery(sql, params);
            notifyDbChange();
        },

        async checkRecordExists(tableName: string, id: string | number): Promise<boolean> {
            if (!isValidIdentifier(tableName)) return false;
            try {
                const result = await runQuery(`SELECT 1 FROM "${tableName}" WHERE id = ? LIMIT 1`, [id]);
                return result.length > 0;
            } catch {
                try {
                    const columns = await deps.getTableSchema(tableName);
                    const pk = columns.find((c: TableColumn) => c.pk === 1 || c.name.toLowerCase() === 'id')?.name;
                    if (pk && pk.toLowerCase() !== 'id') {
                        const pkResult = await runQuery(`SELECT 1 FROM "${tableName}" WHERE "${pk}" = ? LIMIT 1`, [id]);
                        return pkResult.length > 0;
                    }

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

            const [existsResult, worklistResult] = await Promise.all([
                runQuery(`SELECT 1 FROM "${tableName}" WHERE id = ? LIMIT 1`, [id]).catch(async () => {
                    try {
                        const columns = await deps.getTableSchema(tableName);
                        const pk = columns.find((c) => c.pk === 1 || c.name.toLowerCase() === 'id')?.name;
                        if (pk && pk.toLowerCase() !== 'id') {
                            return await runQuery(`SELECT 1 FROM "${tableName}" WHERE "${pk}" = ? LIMIT 1`, [id]);
                        }

                        return await runQuery(`SELECT 1 FROM "${tableName}" WHERE rowid = ? LIMIT 1`, [id]);
                    } catch {
                        return [];
                    }
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
}
