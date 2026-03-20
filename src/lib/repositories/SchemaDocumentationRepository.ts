import { notifyDbChange, runManagedQuery, runQuery } from '../db';

export interface SchemaTableDocRecord {
    table_name: string;
    object_type: 'table' | 'view';
    display_name: string;
    description: string;
    tags_json: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
    last_validated_at: string | null;
}

export interface SchemaColumnDocRecord {
    table_name: string;
    object_type: 'table' | 'view';
    column_name: string;
    display_name: string;
    description: string;
    semantic_type: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
    last_validated_at: string | null;
}

export interface SaveSchemaTableDocInput {
    table_name: string;
    object_type?: 'table' | 'view';
    display_name?: string;
    description?: string;
    tags_json?: string;
    status?: string;
    last_validated_at?: string | null;
}

export interface SaveSchemaColumnDocInput {
    table_name: string;
    object_type?: 'table' | 'view';
    column_name: string;
    display_name?: string;
    description?: string;
    semantic_type?: string;
    status?: string;
    last_validated_at?: string | null;
}

export interface SchemaRelationshipDocRecord {
    id: string;
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    relationship_kind: string;
    join_type: string;
    display_name: string;
    description: string;
    origin: string;
    confidence: number | null;
    status: string;
    created_at: string | null;
    updated_at: string | null;
    last_validated_at: string | null;
}

export interface SaveSchemaRelationshipDocInput {
    id?: string;
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    relationship_kind?: string;
    join_type?: string;
    display_name?: string;
    description?: string;
    origin?: string;
    confidence?: number | null;
    status?: string;
    last_validated_at?: string | null;
}

export interface SchemaValidationSummary {
    checked_tables: number;
    checked_columns: number;
    checked_relationships: number;
    valid_tables: number;
    valid_columns: number;
    valid_relationships: number;
    relationships_needing_review: number;
    missing_tables: number;
    missing_columns: number;
    issues: number;
    validated_at: string;
}

export interface SchemaCleanupSummary {
    removed_tables: number;
    removed_columns: number;
    removed_relationships: number;
    removed_total: number;
}

export interface SchemaRelationshipCheckSummary {
    relationship_id: string;
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    declared_kind: string;
    suggested_kind: '1:1' | '1:n' | 'n:1' | 'n:m';
    source_non_null_count: number;
    source_distinct_count: number;
    target_non_null_count: number;
    target_distinct_count: number;
    missing_target_refs: number;
    source_unique: boolean;
    target_unique: boolean;
    kind_matches: boolean;
    notes: string[];
    checked_at: string;
}

export interface SchemaExportColumn {
    technical_name: string;
    data_type: string;
    nullable: boolean;
    primary_key: boolean;
    display_name: string;
    description: string;
    semantic_type: string;
    status: string;
}

export interface SchemaExportObject {
    object_type: 'table' | 'view';
    technical_name: string;
    display_name: string;
    description: string;
    status: string;
    columns: SchemaExportColumn[];
}

export interface SchemaExportRelationship {
    id: string;
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    relationship_kind: string;
    join_type: string;
    display_name: string;
    description: string;
    status: string;
}

export interface LiteBiSchemaExportPackage {
    format: 'litebi.schema-export';
    version: 1;
    exported_at: string;
    source: {
        app: 'LiteBI Studio';
    };
    objects: SchemaExportObject[];
    relationships: SchemaExportRelationship[];
}

export interface SchemaImportAnalysisSummary {
    objects_direct_match: number;
    objects_missing_local: number;
    objects_missing_import: number;
    columns_direct_match: number;
    columns_missing_local: number;
    columns_missing_import: number;
    relationships_direct_match: number;
    relationships_invalid: number;
    conflicts: number;
}

export interface SchemaImportAnalysisEntry {
    object_type?: 'table' | 'view';
    technical_name?: string;
    table_name?: string;
    column_name?: string;
    id?: string;
    conflict_key?: string;
    field?: string;
    local_value?: string;
    import_value?: string;
    status: 'direct_match' | 'missing_local' | 'missing_import' | 'invalid_target' | 'invalid_source' | 'conflict';
}

export interface SchemaImportAnalysisResult {
    summary: SchemaImportAnalysisSummary;
    object_matches: SchemaImportAnalysisEntry[];
    column_matches: SchemaImportAnalysisEntry[];
    relationship_matches: SchemaImportAnalysisEntry[];
}

export interface SchemaImportMergeSummary {
    added_tables: number;
    added_columns: number;
    added_relationships: number;
    added_total: number;
    updated_tables: number;
    updated_columns: number;
    updated_relationships: number;
    updated_total: number;
    merged_tables: number;
    merged_columns: number;
    merged_relationships: number;
    merged_total: number;
    skipped_existing: number;
}

export type SchemaImportConflictResolution = 'keep_local' | 'use_import';

interface SchemaWriteOptions {
    notify?: boolean;
}

function escapeIdentifier(identifier: string): string {
    return identifier.replace(/"/g, '""');
}

function isSystemObject(name: string): boolean {
    return name.startsWith('sys_') || name === 'sqlite_sequence';
}

export function createSchemaDocumentationRepository() {
    return {
        async listSchemaTableDocs(objectType?: 'table' | 'view'): Promise<SchemaTableDocRecord[]> {
            const rows = await runQuery(`
                SELECT
                    table_name,
                    object_type,
                    display_name,
                    description,
                    tags_json,
                    status,
                    created_at,
                    updated_at,
                    last_validated_at
                FROM sys_schema_table_docs
                ${objectType ? 'WHERE object_type = ?' : ''}
                ORDER BY table_name ASC
            `, objectType ? [objectType] : undefined);
            return rows as unknown as SchemaTableDocRecord[];
        },

        async getSchemaTableDoc(tableName: string, objectType: 'table' | 'view' = 'table'): Promise<SchemaTableDocRecord | null> {
            const rows = await runQuery(`
                SELECT
                    table_name,
                    object_type,
                    display_name,
                    description,
                    tags_json,
                    status,
                    created_at,
                    updated_at,
                    last_validated_at
                FROM sys_schema_table_docs
                WHERE table_name = ? AND object_type = ?
                LIMIT 1
            `, [tableName, objectType]);
            return (rows[0] as unknown as SchemaTableDocRecord | undefined) || null;
        },

        async saveSchemaTableDoc(input: SaveSchemaTableDocInput, options: SchemaWriteOptions = {}): Promise<void> {
            await runManagedQuery(`
                INSERT INTO sys_schema_table_docs (
                    table_name,
                    object_type,
                    display_name,
                    description,
                    tags_json,
                    status,
                    last_validated_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(table_name, object_type) DO UPDATE SET
                    display_name = excluded.display_name,
                    description = excluded.description,
                    tags_json = excluded.tags_json,
                    status = excluded.status,
                    last_validated_at = excluded.last_validated_at,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                input.table_name,
                input.object_type || 'table',
                input.display_name || '',
                input.description || '',
                input.tags_json || '[]',
                input.status || 'valid',
                input.last_validated_at ?? null
            ], { allowedSystemWriteTables: ['sys_schema_table_docs'] });
            if (options.notify !== false) notifyDbChange();
        },

        async listSchemaColumnDocs(tableName?: string, objectType?: 'table' | 'view'): Promise<SchemaColumnDocRecord[]> {
            const rows = tableName
                ? await runQuery(`
                    SELECT
                        table_name,
                        object_type,
                        column_name,
                        display_name,
                        description,
                        semantic_type,
                        status,
                        created_at,
                        updated_at,
                        last_validated_at
                    FROM sys_schema_column_docs
                    WHERE table_name = ?${objectType ? ' AND object_type = ?' : ''}
                    ORDER BY column_name ASC
                `, objectType ? [tableName, objectType] : [tableName])
                : await runQuery(`
                    SELECT
                        table_name,
                        object_type,
                        column_name,
                        display_name,
                        description,
                        semantic_type,
                        status,
                        created_at,
                        updated_at,
                        last_validated_at
                    FROM sys_schema_column_docs
                    ORDER BY table_name ASC, column_name ASC
                `);
            return rows as unknown as SchemaColumnDocRecord[];
        },

        async getSchemaColumnDoc(tableName: string, columnName: string, objectType: 'table' | 'view' = 'table'): Promise<SchemaColumnDocRecord | null> {
            const rows = await runQuery(`
                SELECT
                    table_name,
                    object_type,
                    column_name,
                    display_name,
                    description,
                    semantic_type,
                    status,
                    created_at,
                    updated_at,
                    last_validated_at
                FROM sys_schema_column_docs
                WHERE table_name = ? AND object_type = ? AND column_name = ?
                LIMIT 1
            `, [tableName, objectType, columnName]);
            return (rows[0] as unknown as SchemaColumnDocRecord | undefined) || null;
        },

        async saveSchemaColumnDoc(input: SaveSchemaColumnDocInput, options: SchemaWriteOptions = {}): Promise<void> {
            await runManagedQuery(`
                INSERT INTO sys_schema_column_docs (
                    table_name,
                    object_type,
                    column_name,
                    display_name,
                    description,
                    semantic_type,
                    status,
                    last_validated_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(table_name, object_type, column_name) DO UPDATE SET
                    display_name = excluded.display_name,
                    description = excluded.description,
                    semantic_type = excluded.semantic_type,
                    status = excluded.status,
                    last_validated_at = excluded.last_validated_at,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                input.table_name,
                input.object_type || 'table',
                input.column_name,
                input.display_name || '',
                input.description || '',
                input.semantic_type || '',
                input.status || 'valid',
                input.last_validated_at ?? null
            ], { allowedSystemWriteTables: ['sys_schema_column_docs'] });
            if (options.notify !== false) notifyDbChange();
        },

        async listSchemaRelationshipDocs(tableName?: string): Promise<SchemaRelationshipDocRecord[]> {
            const rows = tableName
                ? await runQuery(`
                    SELECT
                        id,
                        source_table,
                        source_column,
                        target_table,
                        target_column,
                        relationship_kind,
                        join_type,
                        display_name,
                        description,
                        origin,
                        confidence,
                        status,
                        created_at,
                        updated_at,
                        last_validated_at
                    FROM sys_schema_relationship_docs
                    WHERE source_table = ? OR target_table = ?
                    ORDER BY
                        CASE WHEN source_table = ? THEN 0 ELSE 1 END,
                        source_table ASC,
                        source_column ASC,
                        target_table ASC,
                        target_column ASC
                `, [tableName, tableName, tableName])
                : await runQuery(`
                    SELECT
                        id,
                        source_table,
                        source_column,
                        target_table,
                        target_column,
                        relationship_kind,
                        join_type,
                        display_name,
                        description,
                        origin,
                        confidence,
                        status,
                        created_at,
                        updated_at,
                        last_validated_at
                    FROM sys_schema_relationship_docs
                    ORDER BY source_table ASC, source_column ASC, target_table ASC, target_column ASC
                `);
            return rows as unknown as SchemaRelationshipDocRecord[];
        },

        async saveSchemaRelationshipDoc(input: SaveSchemaRelationshipDocInput, options: SchemaWriteOptions = {}): Promise<string> {
            const id = input.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${input.source_table}:${input.source_column}:${input.target_table}:${input.target_column}`);
            await runManagedQuery(`
                INSERT INTO sys_schema_relationship_docs (
                    id,
                    source_table,
                    source_column,
                    target_table,
                    target_column,
                    relationship_kind,
                    join_type,
                    display_name,
                    description,
                    origin,
                    confidence,
                    status,
                    last_validated_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    source_table = excluded.source_table,
                    source_column = excluded.source_column,
                    target_table = excluded.target_table,
                    target_column = excluded.target_column,
                    relationship_kind = excluded.relationship_kind,
                    join_type = excluded.join_type,
                    display_name = excluded.display_name,
                    description = excluded.description,
                    origin = excluded.origin,
                    confidence = excluded.confidence,
                    status = excluded.status,
                    last_validated_at = excluded.last_validated_at,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                id,
                input.source_table,
                input.source_column,
                input.target_table,
                input.target_column,
                input.relationship_kind || 'n:1',
                input.join_type || 'LEFT JOIN',
                input.display_name || '',
                input.description || '',
                input.origin || 'manual',
                input.confidence ?? null,
                input.status || 'valid',
                input.last_validated_at ?? null
            ], { allowedSystemWriteTables: ['sys_schema_relationship_docs'] });
            if (options.notify !== false) notifyDbChange();
            return id;
        },

        async deleteSchemaRelationshipDoc(id: string): Promise<void> {
            await runManagedQuery(
                'DELETE FROM sys_schema_relationship_docs WHERE id = ?',
                [id],
                { allowedSystemWriteTables: ['sys_schema_relationship_docs'] }
            );
            notifyDbChange();
        },

        async checkSchemaRelationship(id: string): Promise<SchemaRelationshipCheckSummary> {
            const relationshipRows = await runQuery(`
                SELECT
                    id,
                    source_table,
                    source_column,
                    target_table,
                    target_column,
                    relationship_kind
                FROM sys_schema_relationship_docs
                WHERE id = ?
                LIMIT 1
            `, [id]);
            const relationship = relationshipRows[0] as Partial<SchemaRelationshipDocRecord> | undefined;
            if (!relationship?.id || !relationship.source_table || !relationship.source_column || !relationship.target_table || !relationship.target_column) {
                throw new Error(`Schema relationship "${id}" not found.`);
            }

            const sourceTable = escapeIdentifier(relationship.source_table);
            const sourceColumn = escapeIdentifier(relationship.source_column);
            const targetTable = escapeIdentifier(relationship.target_table);
            const targetColumn = escapeIdentifier(relationship.target_column);

            const sourceStatsRows = await runQuery(`
                SELECT
                    COUNT("${sourceColumn}") AS non_null_count,
                    COUNT(DISTINCT "${sourceColumn}") AS distinct_count
                FROM "${sourceTable}"
            `);
            const targetStatsRows = await runQuery(`
                SELECT
                    COUNT("${targetColumn}") AS non_null_count,
                    COUNT(DISTINCT "${targetColumn}") AS distinct_count
                FROM "${targetTable}"
            `);
            const missingTargetRows = await runQuery(`
                SELECT COUNT(*) AS missing_count
                FROM "${sourceTable}" s
                LEFT JOIN "${targetTable}" t
                  ON s."${sourceColumn}" = t."${targetColumn}"
                WHERE s."${sourceColumn}" IS NOT NULL
                  AND t."${targetColumn}" IS NULL
            `);

            const sourceNonNullCount = Number(sourceStatsRows[0]?.non_null_count || 0);
            const sourceDistinctCount = Number(sourceStatsRows[0]?.distinct_count || 0);
            const targetNonNullCount = Number(targetStatsRows[0]?.non_null_count || 0);
            const targetDistinctCount = Number(targetStatsRows[0]?.distinct_count || 0);
            const missingTargetRefs = Number(missingTargetRows[0]?.missing_count || 0);

            const sourceUnique = sourceNonNullCount === sourceDistinctCount;
            const targetUnique = targetNonNullCount === targetDistinctCount;
            const suggested_kind: '1:1' | '1:n' | 'n:1' | 'n:m' = sourceUnique && targetUnique
                ? '1:1'
                : sourceUnique && !targetUnique
                    ? '1:n'
                    : !sourceUnique && targetUnique
                        ? 'n:1'
                        : 'n:m';

            const notes: string[] = [];
            if (missingTargetRefs > 0) {
                notes.push(`missing_target_refs:${missingTargetRefs}`);
            }
            if (!sourceUnique) {
                notes.push('source_not_unique');
            }
            if (!targetUnique) {
                notes.push('target_not_unique');
            }

            return {
                relationship_id: relationship.id,
                source_table: relationship.source_table,
                source_column: relationship.source_column,
                target_table: relationship.target_table,
                target_column: relationship.target_column,
                declared_kind: relationship.relationship_kind || 'n:1',
                suggested_kind,
                source_non_null_count: sourceNonNullCount,
                source_distinct_count: sourceDistinctCount,
                target_non_null_count: targetNonNullCount,
                target_distinct_count: targetDistinctCount,
                missing_target_refs: missingTargetRefs,
                source_unique: sourceUnique,
                target_unique: targetUnique,
                kind_matches: (relationship.relationship_kind || 'n:1') === suggested_kind,
                notes,
                checked_at: new Date().toISOString()
            };
        },

        async validateSchemaDocumentation(): Promise<SchemaValidationSummary> {
            const validatedAt = new Date().toISOString();
            const dataSources = await runQuery(`
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
            `);

            const sourceKeys = new Set(
                dataSources
                    .map((row) => {
                        const name = typeof row.name === 'string' ? row.name : '';
                        const type = row.type === 'view' ? 'view' : 'table';
                        return name ? `${type}:${name}` : '';
                    })
                    .filter(Boolean)
            );

            const availableObjects = new Set(
                dataSources
                    .map((row) => (typeof row.name === 'string' ? row.name : ''))
                    .filter(Boolean)
            );

            const requiredSchemas = new Set<string>();
            const tableDocs = await this.listSchemaTableDocs();
            const columnDocs = await this.listSchemaColumnDocs();
            const relationshipDocs = await this.listSchemaRelationshipDocs();

            tableDocs.forEach((entry) => requiredSchemas.add(entry.table_name));
            columnDocs.forEach((entry) => requiredSchemas.add(entry.table_name));
            relationshipDocs.forEach((entry) => {
                requiredSchemas.add(entry.source_table);
                requiredSchemas.add(entry.target_table);
            });

            const columnsByObject = new Map<string, Set<string>>();
            for (const objectName of requiredSchemas) {
                if (!availableObjects.has(objectName)) continue;
                const escapedName = objectName.replace(/"/g, '""');
                const rows = await runQuery(`PRAGMA table_info("${escapedName}")`);
                columnsByObject.set(
                    objectName,
                    new Set(
                        rows
                            .map((row) => (typeof row.name === 'string' ? row.name : ''))
                            .filter(Boolean)
                    )
                );
            }

            let validTables = 0;
            let validColumns = 0;
            let validRelationships = 0;
            let relationshipsNeedingReview = 0;
            let missingTables = 0;
            let missingColumns = 0;
            let issues = 0;

            for (const entry of tableDocs) {
                const nextStatus = sourceKeys.has(`${entry.object_type}:${entry.table_name}`) ? 'valid' : 'missing_table';
                if (nextStatus === 'valid') validTables += 1;
                else {
                    missingTables += 1;
                    issues += 1;
                }
                await runManagedQuery(
                    `UPDATE sys_schema_table_docs
                     SET status = ?, last_validated_at = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE table_name = ? AND object_type = ?`,
                    [nextStatus, validatedAt, entry.table_name, entry.object_type],
                    { allowedSystemWriteTables: ['sys_schema_table_docs'] }
                );
            }

            for (const entry of columnDocs) {
                let nextStatus = 'valid';
                if (!sourceKeys.has(`${entry.object_type}:${entry.table_name}`)) {
                    nextStatus = 'missing_table';
                    issues += 1;
                } else if (!columnsByObject.get(entry.table_name)?.has(entry.column_name)) {
                    nextStatus = 'missing_column';
                    missingColumns += 1;
                    issues += 1;
                } else {
                    validColumns += 1;
                }
                await runManagedQuery(
                    `UPDATE sys_schema_column_docs
                     SET status = ?, last_validated_at = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE table_name = ? AND object_type = ? AND column_name = ?`,
                    [nextStatus, validatedAt, entry.table_name, entry.object_type, entry.column_name],
                    { allowedSystemWriteTables: ['sys_schema_column_docs'] }
                );
            }

            for (const entry of relationshipDocs) {
                let nextStatus = 'valid';
                const sourceExists = availableObjects.has(entry.source_table);
                const targetExists = availableObjects.has(entry.target_table);
                if (!sourceExists || !targetExists) {
                    nextStatus = 'missing_table';
                    issues += 1;
                } else if (
                    !columnsByObject.get(entry.source_table)?.has(entry.source_column)
                    || !columnsByObject.get(entry.target_table)?.has(entry.target_column)
                ) {
                    nextStatus = 'missing_column';
                    missingColumns += 1;
                    issues += 1;
                } else {
                    const relationshipCheck = await this.checkSchemaRelationship(entry.id);
                    if (relationshipCheck.kind_matches && relationshipCheck.missing_target_refs === 0) {
                        validRelationships += 1;
                        nextStatus = 'valid';
                    } else {
                        relationshipsNeedingReview += 1;
                        issues += 1;
                        nextStatus = 'needs_review';
                    }
                }
                await runManagedQuery(
                    `UPDATE sys_schema_relationship_docs
                     SET status = ?, last_validated_at = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [nextStatus, validatedAt, entry.id],
                    { allowedSystemWriteTables: ['sys_schema_relationship_docs'] }
                );
            }

            notifyDbChange();

            return {
                checked_tables: tableDocs.length,
                checked_columns: columnDocs.length,
                checked_relationships: relationshipDocs.length,
                valid_tables: validTables,
                valid_columns: validColumns,
                valid_relationships: validRelationships,
                relationships_needing_review: relationshipsNeedingReview,
                missing_tables: missingTables,
                missing_columns: missingColumns,
                issues,
                validated_at: validatedAt
            };
        },

        async cleanupInvalidSchemaDocumentation(): Promise<SchemaCleanupSummary> {
            const removedTables = Number(
                (
                    await runManagedQuery(
                        `DELETE FROM sys_schema_table_docs
                         WHERE status IN ('missing_table', 'missing_column')`,
                        undefined,
                        { allowedSystemWriteTables: ['sys_schema_table_docs'] }
                    )
                ) || 0
            );
            const removedColumns = Number(
                (
                    await runManagedQuery(
                        `DELETE FROM sys_schema_column_docs
                         WHERE status IN ('missing_table', 'missing_column')`,
                        undefined,
                        { allowedSystemWriteTables: ['sys_schema_column_docs'] }
                    )
                ) || 0
            );
            const removedRelationships = Number(
                (
                    await runManagedQuery(
                        `DELETE FROM sys_schema_relationship_docs
                         WHERE status IN ('missing_table', 'missing_column')`,
                        undefined,
                        { allowedSystemWriteTables: ['sys_schema_relationship_docs'] }
                    )
                ) || 0
            );

            notifyDbChange();

            return {
                removed_tables: removedTables,
                removed_columns: removedColumns,
                removed_relationships: removedRelationships,
                removed_total: removedTables + removedColumns + removedRelationships
            };
        },

        async exportSchemaPackage(): Promise<LiteBiSchemaExportPackage> {
            const exportedAt = new Date().toISOString();
            const dataSources = await runQuery(`
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY type ASC, name ASC
            `);
            const exportObjects = dataSources
                .map((row) => ({
                    name: typeof row.name === 'string' ? row.name : '',
                    type: row.type === 'view' ? 'view' as const : 'table' as const
                }))
                .filter((entry) => entry.name && !isSystemObject(entry.name));

            const tableDocs = await this.listSchemaTableDocs();
            const columnDocs = await this.listSchemaColumnDocs();
            const relationshipDocs = await this.listSchemaRelationshipDocs();

            const tableDocByKey = new Map<string, SchemaTableDocRecord>();
            tableDocs.forEach((entry) => {
                tableDocByKey.set(`${entry.object_type}:${entry.table_name}`, entry);
            });

            const columnDocsByKey = new Map<string, SchemaColumnDocRecord[]>();
            columnDocs.forEach((entry) => {
                const key = `${entry.object_type}:${entry.table_name}`;
                const current = columnDocsByKey.get(key) || [];
                current.push(entry);
                columnDocsByKey.set(key, current);
            });

            const exportedObjectNames = new Set(exportObjects.map((entry) => entry.name));
            const objects: SchemaExportObject[] = [];
            for (const entry of exportObjects) {
                const objectKey = `${entry.type}:${entry.name}`;
                const tableDoc = tableDocByKey.get(objectKey);
                const docColumns = new Map(
                    (columnDocsByKey.get(objectKey) || []).map((column) => [column.column_name, column] as const)
                );
                const schemaRows = await runQuery(`PRAGMA table_info("${escapeIdentifier(entry.name)}")`);
                const columns: SchemaExportColumn[] = schemaRows.map((row) => {
                    const technicalName = typeof row.name === 'string' ? row.name : '';
                    const doc = docColumns.get(technicalName);
                    return {
                        technical_name: technicalName,
                        data_type: typeof row.type === 'string' ? row.type : '',
                        nullable: Number(row.notnull || 0) === 0,
                        primary_key: Number(row.pk || 0) > 0,
                        display_name: doc?.display_name || '',
                        description: doc?.description || '',
                        semantic_type: doc?.semantic_type || '',
                        status: doc?.status || 'valid'
                    };
                });
                objects.push({
                    object_type: entry.type,
                    technical_name: entry.name,
                    display_name: tableDoc?.display_name || '',
                    description: tableDoc?.description || '',
                    status: tableDoc?.status || 'valid',
                    columns
                });
            }

            const relationships: SchemaExportRelationship[] = relationshipDocs
                .filter((entry) => exportedObjectNames.has(entry.source_table) && exportedObjectNames.has(entry.target_table))
                .map((entry) => ({
                    id: entry.id,
                    source_table: entry.source_table,
                    source_column: entry.source_column,
                    target_table: entry.target_table,
                    target_column: entry.target_column,
                    relationship_kind: entry.relationship_kind,
                    join_type: entry.join_type,
                    display_name: entry.display_name,
                    description: entry.description,
                    status: entry.status
                }));

            return {
                format: 'litebi.schema-export',
                version: 1,
                exported_at: exportedAt,
                source: {
                    app: 'LiteBI Studio'
                },
                objects,
                relationships
            };
        },

        async analyzeSchemaImportPackage(schemaPackage: LiteBiSchemaExportPackage): Promise<SchemaImportAnalysisResult> {
            if (schemaPackage.format !== 'litebi.schema-export' || schemaPackage.version !== 1) {
                throw new Error('Unsupported schema export format.');
            }

            const dataSources = await runQuery(`
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY type ASC, name ASC
            `);
            const localObjects = dataSources
                .map((row) => ({
                    technical_name: typeof row.name === 'string' ? row.name : '',
                    object_type: row.type === 'view' ? 'view' as const : 'table' as const
                }))
                .filter((entry) => entry.technical_name && !isSystemObject(entry.technical_name));

            const localObjectKeySet = new Set(localObjects.map((entry) => `${entry.object_type}:${entry.technical_name}`));
            const importObjectKeySet = new Set(schemaPackage.objects.map((entry) => `${entry.object_type}:${entry.technical_name}`));
            const existingTableDocs = await this.listSchemaTableDocs();
            const existingColumnDocs = await this.listSchemaColumnDocs();
            const existingRelationships = await this.listSchemaRelationshipDocs();
            const existingTableDocByKey = new Map(existingTableDocs.map((entry) => [`${entry.object_type}:${entry.table_name}`, entry] as const));
            const existingColumnDocByKey = new Map(existingColumnDocs.map((entry) => [`${entry.object_type}:${entry.table_name}:${entry.column_name}`, entry] as const));
            const existingRelationshipBySignature = new Map(
                existingRelationships.map((entry) => [
                    `${entry.source_table}:${entry.source_column}:${entry.target_table}:${entry.target_column}`,
                    entry
                ] as const)
            );

            const objectMatches: SchemaImportAnalysisEntry[] = [];
            const columnMatches: SchemaImportAnalysisEntry[] = [];
            const relationshipMatches: SchemaImportAnalysisEntry[] = [];
            let conflicts = 0;

            let objectsDirectMatch = 0;
            let objectsMissingLocal = 0;
            let objectsMissingImport = 0;
            let columnsDirectMatch = 0;
            let columnsMissingLocal = 0;
            let columnsMissingImport = 0;
            let relationshipsDirectMatch = 0;
            let relationshipsInvalid = 0;

            for (const importObject of schemaPackage.objects) {
                const objectKey = `${importObject.object_type}:${importObject.technical_name}`;
                if (localObjectKeySet.has(objectKey)) {
                    objectsDirectMatch += 1;
                    objectMatches.push({
                        object_type: importObject.object_type,
                        technical_name: importObject.technical_name,
                        status: 'direct_match'
                    });
                    const localDoc = existingTableDocByKey.get(objectKey);
                    const tableConflictCandidates = [
                        ['display_name', localDoc?.display_name || '', importObject.display_name || ''],
                        ['description', localDoc?.description || '', importObject.description || '']
                    ] as const;
                    tableConflictCandidates.forEach(([field, localValue, importValue]) => {
                        if (localValue.trim() && importValue.trim() && localValue.trim() !== importValue.trim()) {
                            conflicts += 1;
                            objectMatches.push({
                                object_type: importObject.object_type,
                                technical_name: importObject.technical_name,
                                conflict_key: `object:${importObject.object_type}:${importObject.technical_name}:${field}`,
                                field,
                                local_value: localValue,
                                import_value: importValue,
                                status: 'conflict'
                            });
                        }
                    });
                } else {
                    objectsMissingLocal += 1;
                    objectMatches.push({
                        object_type: importObject.object_type,
                        technical_name: importObject.technical_name,
                        status: 'missing_local'
                    });
                }
            }

            for (const localObject of localObjects) {
                const objectKey = `${localObject.object_type}:${localObject.technical_name}`;
                if (!importObjectKeySet.has(objectKey)) {
                    objectsMissingImport += 1;
                    objectMatches.push({
                        object_type: localObject.object_type,
                        technical_name: localObject.technical_name,
                        status: 'missing_import'
                    });
                }
            }

            for (const importObject of schemaPackage.objects) {
                const objectKey = `${importObject.object_type}:${importObject.technical_name}`;
                const localColumnRows = localObjectKeySet.has(objectKey)
                    ? await runQuery(`PRAGMA table_info("${escapeIdentifier(importObject.technical_name)}")`)
                    : [];
                const localColumnSet = new Set(
                    localColumnRows
                        .map((row) => (typeof row.name === 'string' ? row.name : ''))
                        .filter(Boolean)
                );
                const importColumnSet = new Set(importObject.columns.map((column) => column.technical_name));

                for (const importColumn of importObject.columns) {
                    if (localColumnSet.has(importColumn.technical_name)) {
                        columnsDirectMatch += 1;
                        columnMatches.push({
                            object_type: importObject.object_type,
                            table_name: importObject.technical_name,
                            column_name: importColumn.technical_name,
                            status: 'direct_match'
                        });
                        const localColumnDoc = existingColumnDocByKey.get(`${importObject.object_type}:${importObject.technical_name}:${importColumn.technical_name}`);
                        const columnConflictCandidates = [
                            ['display_name', localColumnDoc?.display_name || '', importColumn.display_name || ''],
                            ['description', localColumnDoc?.description || '', importColumn.description || ''],
                            ['semantic_type', localColumnDoc?.semantic_type || '', importColumn.semantic_type || '']
                        ] as const;
                        columnConflictCandidates.forEach(([field, localValue, importValue]) => {
                            if (localValue.trim() && importValue.trim() && localValue.trim() !== importValue.trim()) {
                                conflicts += 1;
                                columnMatches.push({
                                    object_type: importObject.object_type,
                                    table_name: importObject.technical_name,
                                    column_name: importColumn.technical_name,
                                    conflict_key: `column:${importObject.object_type}:${importObject.technical_name}:${importColumn.technical_name}:${field}`,
                                    field,
                                    local_value: localValue,
                                    import_value: importValue,
                                    status: 'conflict'
                                });
                            }
                        });
                    } else {
                        columnsMissingLocal += 1;
                        columnMatches.push({
                            object_type: importObject.object_type,
                            table_name: importObject.technical_name,
                            column_name: importColumn.technical_name,
                            status: 'missing_local'
                        });
                    }
                }

                for (const localColumn of localColumnSet) {
                    if (!importColumnSet.has(localColumn)) {
                        columnsMissingImport += 1;
                        columnMatches.push({
                            object_type: importObject.object_type,
                            table_name: importObject.technical_name,
                            column_name: localColumn,
                            status: 'missing_import'
                        });
                    }
                }
            }

            for (const relationship of schemaPackage.relationships) {
                const sourceObjectExists = localObjects.some((entry) => entry.technical_name === relationship.source_table);
                const targetObjectExists = localObjects.some((entry) => entry.technical_name === relationship.target_table);
                if (!sourceObjectExists) {
                    relationshipsInvalid += 1;
                    relationshipMatches.push({
                        id: relationship.id,
                        status: 'invalid_source'
                    });
                    continue;
                }
                if (!targetObjectExists) {
                    relationshipsInvalid += 1;
                    relationshipMatches.push({
                        id: relationship.id,
                        status: 'invalid_target'
                    });
                    continue;
                }
                const [sourceColumns, targetColumns] = await Promise.all([
                    runQuery(`PRAGMA table_info("${escapeIdentifier(relationship.source_table)}")`),
                    runQuery(`PRAGMA table_info("${escapeIdentifier(relationship.target_table)}")`)
                ]);
                const sourceColumnSet = new Set(sourceColumns.map((row) => (typeof row.name === 'string' ? row.name : '')).filter(Boolean));
                const targetColumnSet = new Set(targetColumns.map((row) => (typeof row.name === 'string' ? row.name : '')).filter(Boolean));
                if (!sourceColumnSet.has(relationship.source_column)) {
                    relationshipsInvalid += 1;
                    relationshipMatches.push({
                        id: relationship.id,
                        status: 'invalid_source'
                    });
                    continue;
                }
                if (!targetColumnSet.has(relationship.target_column)) {
                    relationshipsInvalid += 1;
                    relationshipMatches.push({
                        id: relationship.id,
                        status: 'invalid_target'
                    });
                    continue;
                }
                relationshipsDirectMatch += 1;
                relationshipMatches.push({
                    id: relationship.id,
                    status: 'direct_match'
                });
                const localRelationship = existingRelationshipBySignature.get(`${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}`);
                if (localRelationship) {
                    const relationshipConflictCandidates = [
                        ['relationship_kind', localRelationship.relationship_kind || '', relationship.relationship_kind || ''],
                        ['join_type', localRelationship.join_type || '', relationship.join_type || ''],
                        ['display_name', localRelationship.display_name || '', relationship.display_name || ''],
                        ['description', localRelationship.description || '', relationship.description || '']
                    ] as const;
                    relationshipConflictCandidates.forEach(([field, localValue, importValue]) => {
                        if (localValue.trim() && importValue.trim() && localValue.trim() !== importValue.trim()) {
                            conflicts += 1;
                            relationshipMatches.push({
                                id: relationship.id,
                                conflict_key: `relationship:${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}:${field}`,
                                field,
                                local_value: localValue,
                                import_value: importValue,
                                status: 'conflict'
                            });
                        }
                    });
                }
            }

            return {
                summary: {
                    objects_direct_match: objectsDirectMatch,
                    objects_missing_local: objectsMissingLocal,
                    objects_missing_import: objectsMissingImport,
                    columns_direct_match: columnsDirectMatch,
                    columns_missing_local: columnsMissingLocal,
                    columns_missing_import: columnsMissingImport,
                    relationships_direct_match: relationshipsDirectMatch,
                    relationships_invalid: relationshipsInvalid,
                    conflicts
                },
                object_matches: objectMatches,
                column_matches: columnMatches,
                relationship_matches: relationshipMatches
            };
        },

        async mergeSchemaImportPackage(
            schemaPackage: LiteBiSchemaExportPackage,
            conflictResolutions: Record<string, SchemaImportConflictResolution> = {}
        ): Promise<SchemaImportMergeSummary> {
            if (schemaPackage.format !== 'litebi.schema-export' || schemaPackage.version !== 1) {
                throw new Error('Unsupported schema export format.');
            }

            let addedTables = 0;
            let addedColumns = 0;
            let addedRelationships = 0;
            let updatedTables = 0;
            let updatedColumns = 0;
            let updatedRelationships = 0;
            let skippedExisting = 0;

            const dataSources = await runQuery(`
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
            `);
            const localObjectKeySet = new Set(
                dataSources
                    .map((row) => {
                        const name = typeof row.name === 'string' ? row.name : '';
                        const type = row.type === 'view' ? 'view' : 'table';
                        return name && !isSystemObject(name) ? `${type}:${name}` : '';
                    })
                    .filter(Boolean)
            );

            const existingTableDocs = await this.listSchemaTableDocs();
            const existingColumnDocs = await this.listSchemaColumnDocs();
            const existingRelationships = await this.listSchemaRelationshipDocs();

            const tableDocByKey = new Map(existingTableDocs.map((entry) => [`${entry.object_type}:${entry.table_name}`, entry] as const));
            const columnDocByKey = new Map(existingColumnDocs.map((entry) => [`${entry.object_type}:${entry.table_name}:${entry.column_name}`, entry] as const));
            const relationshipBySignature = new Map(
                existingRelationships.map((entry) => [
                    `${entry.source_table}:${entry.source_column}:${entry.target_table}:${entry.target_column}`,
                    entry
                ] as const)
            );

            for (const object of schemaPackage.objects) {
                const objectKey = `${object.object_type}:${object.technical_name}`;
                if (!localObjectKeySet.has(objectKey)) continue;

                const existingTableDoc = tableDocByKey.get(objectKey);
                const hasIncomingTableDoc = Boolean(object.display_name?.trim() || object.description?.trim());
                if (hasIncomingTableDoc) {
                    const hasExistingTableDoc = Boolean(existingTableDoc?.display_name?.trim() || existingTableDoc?.description?.trim());
                    if (!hasExistingTableDoc) {
                        await this.saveSchemaTableDoc({
                            table_name: object.technical_name,
                            object_type: object.object_type,
                            display_name: object.display_name || '',
                            description: object.description || '',
                            status: existingTableDoc?.status || 'valid',
                            last_validated_at: existingTableDoc?.last_validated_at ?? null
                        }, { notify: false });
                        addedTables += 1;
                    } else {
                        const nextDisplayName = conflictResolutions[`object:${object.object_type}:${object.technical_name}:display_name`] === 'use_import'
                            ? (object.display_name || '')
                            : (existingTableDoc?.display_name || '');
                        const nextDescription = conflictResolutions[`object:${object.object_type}:${object.technical_name}:description`] === 'use_import'
                            ? (object.description || '')
                            : (existingTableDoc?.description || '');
                        if (
                            nextDisplayName !== (existingTableDoc?.display_name || '')
                            || nextDescription !== (existingTableDoc?.description || '')
                        ) {
                            await this.saveSchemaTableDoc({
                                table_name: object.technical_name,
                                object_type: object.object_type,
                                display_name: nextDisplayName,
                                description: nextDescription,
                                status: existingTableDoc?.status || 'valid',
                                last_validated_at: existingTableDoc?.last_validated_at ?? null
                            }, { notify: false });
                            updatedTables += 1;
                        } else {
                            skippedExisting += 1;
                        }
                    }
                }

                for (const column of object.columns) {
                    const columnKey = `${object.object_type}:${object.technical_name}:${column.technical_name}`;
                    const existingColumnDoc = columnDocByKey.get(columnKey);
                    const hasIncomingColumnDoc = Boolean(column.display_name?.trim() || column.description?.trim() || column.semantic_type?.trim());
                    if (!hasIncomingColumnDoc) continue;
                    const hasExistingColumnDoc = Boolean(
                        existingColumnDoc?.display_name?.trim()
                        || existingColumnDoc?.description?.trim()
                        || existingColumnDoc?.semantic_type?.trim()
                    );
                    if (!hasExistingColumnDoc) {
                        await this.saveSchemaColumnDoc({
                            table_name: object.technical_name,
                            object_type: object.object_type,
                            column_name: column.technical_name,
                            display_name: column.display_name || '',
                            description: column.description || '',
                            semantic_type: column.semantic_type || '',
                            status: existingColumnDoc?.status || 'valid',
                            last_validated_at: existingColumnDoc?.last_validated_at ?? null
                        }, { notify: false });
                        addedColumns += 1;
                    } else {
                        const nextDisplayName = conflictResolutions[`column:${object.object_type}:${object.technical_name}:${column.technical_name}:display_name`] === 'use_import'
                            ? (column.display_name || '')
                            : (existingColumnDoc?.display_name || '');
                        const nextDescription = conflictResolutions[`column:${object.object_type}:${object.technical_name}:${column.technical_name}:description`] === 'use_import'
                            ? (column.description || '')
                            : (existingColumnDoc?.description || '');
                        const nextSemanticType = conflictResolutions[`column:${object.object_type}:${object.technical_name}:${column.technical_name}:semantic_type`] === 'use_import'
                            ? (column.semantic_type || '')
                            : (existingColumnDoc?.semantic_type || '');
                        if (
                            nextDisplayName !== (existingColumnDoc?.display_name || '')
                            || nextDescription !== (existingColumnDoc?.description || '')
                            || nextSemanticType !== (existingColumnDoc?.semantic_type || '')
                        ) {
                            await this.saveSchemaColumnDoc({
                                table_name: object.technical_name,
                                object_type: object.object_type,
                                column_name: column.technical_name,
                                display_name: nextDisplayName,
                                description: nextDescription,
                                semantic_type: nextSemanticType,
                                status: existingColumnDoc?.status || 'valid',
                                last_validated_at: existingColumnDoc?.last_validated_at ?? null
                            }, { notify: false });
                            updatedColumns += 1;
                        } else {
                            skippedExisting += 1;
                        }
                    }
                }
            }

            for (const relationship of schemaPackage.relationships) {
                const sourceKey = Array.from(localObjectKeySet).find((entry) => entry.endsWith(`:${relationship.source_table}`));
                const targetKey = Array.from(localObjectKeySet).find((entry) => entry.endsWith(`:${relationship.target_table}`));
                if (!sourceKey || !targetKey) continue;
                const signature = `${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}`;
                const existingRelationship = relationshipBySignature.get(signature);
                if (existingRelationship) {
                    const nextRelationshipKind = conflictResolutions[`relationship:${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}:relationship_kind`] === 'use_import'
                        ? relationship.relationship_kind
                        : existingRelationship.relationship_kind;
                    const nextJoinType = conflictResolutions[`relationship:${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}:join_type`] === 'use_import'
                        ? relationship.join_type
                        : existingRelationship.join_type;
                    const nextDisplayName = conflictResolutions[`relationship:${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}:display_name`] === 'use_import'
                        ? (relationship.display_name || '')
                        : (existingRelationship.display_name || '');
                    const nextDescription = conflictResolutions[`relationship:${relationship.source_table}:${relationship.source_column}:${relationship.target_table}:${relationship.target_column}:description`] === 'use_import'
                        ? (relationship.description || '')
                        : (existingRelationship.description || '');
                    if (
                        nextRelationshipKind !== existingRelationship.relationship_kind
                        || nextJoinType !== existingRelationship.join_type
                        || nextDisplayName !== (existingRelationship.display_name || '')
                        || nextDescription !== (existingRelationship.description || '')
                    ) {
                        await this.saveSchemaRelationshipDoc({
                            id: existingRelationship.id,
                            source_table: existingRelationship.source_table,
                            source_column: existingRelationship.source_column,
                            target_table: existingRelationship.target_table,
                            target_column: existingRelationship.target_column,
                            relationship_kind: nextRelationshipKind,
                            join_type: nextJoinType,
                            display_name: nextDisplayName,
                            description: nextDescription,
                            status: 'needs_review'
                        }, { notify: false });
                        updatedRelationships += 1;
                    } else {
                        skippedExisting += 1;
                    }
                    continue;
                }
                await this.saveSchemaRelationshipDoc({
                    source_table: relationship.source_table,
                    source_column: relationship.source_column,
                    target_table: relationship.target_table,
                    target_column: relationship.target_column,
                    relationship_kind: relationship.relationship_kind,
                    join_type: relationship.join_type,
                    display_name: relationship.display_name || '',
                    description: relationship.description || '',
                    status: 'needs_review'
                }, { notify: false });
                addedRelationships += 1;
            }

            const mergedTables = addedTables + updatedTables;
            const mergedColumns = addedColumns + updatedColumns;
            const mergedRelationships = addedRelationships + updatedRelationships;

            notifyDbChange();

            return {
                added_tables: addedTables,
                added_columns: addedColumns,
                added_relationships: addedRelationships,
                added_total: addedTables + addedColumns + addedRelationships,
                updated_tables: updatedTables,
                updated_columns: updatedColumns,
                updated_relationships: updatedRelationships,
                updated_total: updatedTables + updatedColumns + updatedRelationships,
                merged_tables: mergedTables,
                merged_columns: mergedColumns,
                merged_relationships: mergedRelationships,
                merged_total: mergedTables + mergedColumns + mergedRelationships,
                skipped_existing: skippedExisting
            };
        }
    };
}
