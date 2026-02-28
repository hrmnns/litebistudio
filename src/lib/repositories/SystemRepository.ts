import { runQuery, notifyDbChange, getDiagnostics as fetchDiagnostics, getDatabaseHealth as fetchDatabaseHealth, getStorageStatus as fetchStorageStatus, abortActiveQueries as abortQueries, genericBulkInsert } from '../db';
import type { DbRow, TableColumn } from '../../types';
import { isValidIdentifier } from '../utils';
import { createHealthRepository } from './HealthRepository';
import { createWidgetRepository } from './WidgetRepository';
import { createReportPackRepository } from './ReportPackRepository';
import { createSqlStatementRepository } from './SqlStatementRepository';
import { createWorklistRepository } from './WorklistRepository';
import { isAdminModeRuntimeActive } from '../security/runtimeFlags';
export type { SqlStatementRecord } from './SqlStatementRepository';

const schemaCache = new Map<string, TableColumn[]>();
type BindValue = string | number | null | undefined;
let dbStatsCache: { at: number; value: { tables: number; records: number } } | null = null;
let dbStatsInFlight: Promise<{ tables: number; records: number }> | null = null;
const DB_STATS_TTL_MS = 10_000;

function getSearchableColumns(schema: TableColumn[]): TableColumn[] {
    return schema.filter(
        (col) => col.type.toUpperCase().includes('TEXT')
            || col.name.toLowerCase().includes('id')
            || col.name.toLowerCase().includes('name')
    );
}

function buildSearchClause(searchColumns: TableColumn[], searchTerm?: string): { clause: string; params: BindValue[] } {
    if (!searchTerm || !searchColumns.length) return { clause: '', params: [] };
    const clause = searchColumns.map((col) => `${col.name} LIKE '%' || ? || '%'`).join(' OR ');
    const params: BindValue[] = Array(searchColumns.length).fill(searchTerm);
    return { clause, params };
}

async function getTableSchemaCached(tableName: string): Promise<TableColumn[]> {
    if (!isValidIdentifier(tableName)) return [];
    if (schemaCache.has(tableName)) return schemaCache.get(tableName)!;

    const result = await runQuery(`PRAGMA table_info("${tableName}")`) as unknown as TableColumn[];
    schemaCache.set(tableName, result);
    return result;
}

function isAdminModeActive(): boolean {
    return isAdminModeRuntimeActive();
}

function getSystemTableWriteBlockedMessage(): string {
    if (typeof window === 'undefined') {
        return 'Write access to system tables (sys_*) is only allowed in admin mode.';
    }
    const language = String(window.localStorage.getItem('i18nextLng') || 'en').toLowerCase();
    if (language.startsWith('de')) {
        return 'Schreibzugriffe auf Systemtabellen (sys_*) sind nur im Admin-Modus erlaubt.';
    }
    return 'Write access to system tables (sys_*) is only allowed in admin mode.';
}

function assertNoSystemWriteForNonAdmin(sql: string): void {
    if (isAdminModeActive()) return;

    // Guard raw SQL execution: system tables can only be modified in admin mode.
    const statements = sql
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

    const writeStatementPattern = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i;
    const systemTablePattern = /\bsys_[a-z0-9_]+\b/i;

    for (const statement of statements) {
        if (!writeStatementPattern.test(statement)) continue;
        if (!systemTablePattern.test(statement)) continue;
        throw new Error(getSystemTableWriteBlockedMessage());
    }
}

export interface DataSourceEntry {
    name: string;
    type: 'table' | 'view';
}

export interface TableIndexInfo {
    name: string;
    unique: boolean;
    columns: string[];
    origin?: string;
    partial?: boolean;
}

export const SystemRepository = {
    async getDatabaseStats(): Promise<{ tables: number; records: number }> {
        const now = Date.now();
        if (dbStatsCache && now - dbStatsCache.at < DB_STATS_TTL_MS) {
            return dbStatsCache.value;
        }
        if (dbStatsInFlight) return await dbStatsInFlight;

        dbStatsInFlight = (async () => {
            const tables = await this.getTables();
            const counts = await Promise.all(
                tables.map(async (table) => {
                    const countResult = await runQuery(`SELECT count(*) as count FROM "${table}"`);
                    return Number(countResult[0]?.count || 0);
                })
            );
            const value = {
                tables: tables.length,
                records: counts.reduce((sum, count) => sum + count, 0)
            };
            dbStatsCache = { at: Date.now(), value };
            return value;
        })();

        try {
            return await dbStatsInFlight;
        } finally {
            dbStatsInFlight = null;
        }
    },

    async getTotalRecordCount(): Promise<number> {
        const stats = await this.getDatabaseStats();
        return stats.records;
    },

    async getDiagnostics(): Promise<Record<string, unknown>> {
        return await fetchDiagnostics();
    },

    async getDatabaseHealth(): Promise<Record<string, unknown>> {
        return await fetchDatabaseHealth();
    },

    async getStorageStatus(): Promise<{ mode: 'opfs' | 'memory'; reason: string | null }> {
        return await fetchStorageStatus();
    },

    ...createHealthRepository({
        isAdminModeActive,
        getSystemTableWriteBlockedMessage
    }),

    async getTables(): Promise<string[]> {
        const result = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        return result
            .map((r: DbRow) => (typeof r.name === 'string' ? r.name : ''))
            .filter((name: string) => name.length > 0);
    },

    async getDataSources(): Promise<DataSourceEntry[]> {
        const result = await runQuery(`
            SELECT name, type
            FROM sqlite_master
            WHERE type IN ('table', 'view')
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name ASC
        `);
        return result
            .map((r: DbRow) => {
                const name = typeof r.name === 'string' ? r.name : '';
                const type = r.type === 'view' ? 'view' : 'table';
                return { name, type } as DataSourceEntry;
            })
            .filter((entry: DataSourceEntry) => entry.name.length > 0);
    },

    async getDataSourceType(name: string): Promise<'table' | 'view' | 'unknown'> {
        if (!isValidIdentifier(name)) return 'unknown';
        const result = await runQuery(
            "SELECT type FROM sqlite_master WHERE name = ? AND type IN ('table', 'view') LIMIT 1",
            [name]
        );
        const type = result[0]?.type;
        if (type === 'table' || type === 'view') return type;
        return 'unknown';
    },

    async getTableSchema(tableName: string): Promise<TableColumn[]> {
        return await getTableSchemaCached(tableName);
    },

    async getTableIndexes(tableName: string): Promise<TableIndexInfo[]> {
        if (!isValidIdentifier(tableName)) return [];
        const safeTableName = tableName.replace(/"/g, '""');
        const pragmaRows = await runQuery(`PRAGMA index_list("${safeTableName}")`);
        const masterRows = await runQuery(
            "SELECT name, sql FROM sqlite_master WHERE type='index' AND LOWER(tbl_name) = LOWER(?) AND name NOT LIKE 'sqlite_%' ORDER BY name",
            [tableName]
        );

        const sqlByIndexName = new Map<string, string>();
        for (const row of masterRows) {
            const name = typeof row.name === 'string' ? row.name : '';
            if (!name) continue;
            sqlByIndexName.set(name, typeof row.sql === 'string' ? row.sql : '');
        }

        const nameSet = new Set<string>();
        for (const row of pragmaRows) {
            if (typeof row.name === 'string' && row.name) nameSet.add(row.name);
        }
        for (const row of masterRows) {
            if (typeof row.name === 'string' && row.name) nameSet.add(row.name);
        }

        const indexNames = Array.from(nameSet);
        if (!indexNames.length) return [];

        const indexes = await Promise.all(indexNames.map(async (indexName) => {
            const safeIndexName = indexName.replace(/"/g, '""');
            const indexCols = await runQuery(`PRAGMA index_info("${safeIndexName}")`);
            const columns = indexCols
                .sort((a, b) => Number(a.seqno || 0) - Number(b.seqno || 0))
                .map((r) => (typeof r.name === 'string' ? r.name : ''))
                .filter((name) => name.length > 0);

            const pragmaInfo = pragmaRows.find((r) => r.name === indexName);
            const sql = sqlByIndexName.get(indexName) || '';

            const uniqueFromPragma = pragmaInfo ? Number(pragmaInfo.unique || 0) === 1 : false;
            const partialFromPragma = pragmaInfo ? Number(pragmaInfo.partial || 0) === 1 : false;
            const originFromPragma = pragmaInfo && typeof pragmaInfo.origin === 'string' ? pragmaInfo.origin : undefined;

            return {
                name: indexName,
                unique: uniqueFromPragma || /\bCREATE\s+UNIQUE\s+INDEX\b/i.test(sql),
                columns,
                origin: originFromPragma || 'c',
                partial: partialFromPragma || /\bWHERE\b/i.test(sql)
            } as TableIndexInfo;
        }));

        return indexes.sort((a, b) => a.name.localeCompare(b.name));
    },

    async inspectTable(tableName: string, limit: number, searchTerm?: string, offset: number = 0, sourceType?: 'table' | 'view'): Promise<DbRow[]> {
        if (!isValidIdentifier(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
        const effectiveType = sourceType || await this.getDataSourceType(tableName);
        const includeRowId = effectiveType === 'table';

        // For tables include rowid; for views rowid is typically unavailable.
        let sql = includeRowId
            ? `SELECT rowid as _rowid, * FROM "${tableName}"`
            : `SELECT * FROM "${tableName}"`;
        const params: BindValue[] = [];

        if (searchTerm) {
            const schema = await this.getTableSchema(tableName);
            const searchableColumns = getSearchableColumns(schema);
            const { clause: searchFilter, params: searchParams } = buildSearchClause(searchableColumns, searchTerm);

            if (searchFilter) {
                sql += ` WHERE ${searchFilter}`;
                params.push(...searchParams);
            }
        }

        if (includeRowId) {
            sql += ` ORDER BY rowid DESC`;
        }
        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit);
        params.push(Math.max(0, offset));

        return await runQuery(sql, params);
    },

    async countTableRows(tableName: string, searchTerm?: string): Promise<number> {
        if (!isValidIdentifier(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
        let sql = `SELECT COUNT(*) as count FROM "${tableName}"`;
        const params: BindValue[] = [];

        if (searchTerm) {
            const schema = await this.getTableSchema(tableName);
            const searchableColumns = getSearchableColumns(schema);
            const { clause: searchFilter, params: searchParams } = buildSearchClause(searchableColumns, searchTerm);

            if (searchFilter) {
                sql += ` WHERE ${searchFilter}`;
                params.push(...searchParams);
            }
        }

        const result = await runQuery(sql, params);
        return Number(result[0]?.count || 0);
    },

    async executeRaw(sql: string, bind?: BindValue[]): Promise<DbRow[]> {
        assertNoSystemWriteForNonAdmin(sql);
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

    async abortActiveQueries(): Promise<boolean> {
        return await abortQueries();
    },

    async bulkInsert(tableName: string, records: DbRow[]): Promise<number> {
        const count = await genericBulkInsert(tableName, records);
        notifyDbChange(count);
        return count;
    },

    ...createWidgetRepository(),
    ...createReportPackRepository(),
    ...createSqlStatementRepository(),
    ...createWorklistRepository({
        getTableSchema: getTableSchemaCached
    })
};
