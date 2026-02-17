import type { ImportConfig } from '../ExcelImport';
import systemsSchema from '../../../schemas/systems-schema.json';
import { bulkInsertSystems, clearSystemsTable } from '../../../lib/db';

export const systemsImportConfig: ImportConfig = {
    key: 'systems',
    entityLabel: 'Systems',
    schema: {
        properties: systemsSchema.items.properties,
        required: systemsSchema.items.required
    },
    validate: (data: any[]) => {
        // Basic validation: ensure required fields like 'name' exist
        const invalidRow = data.find(row => !row.name);
        return !invalidRow;
    },
    getValidationErrors: () => {
        return ['Each row must have a "name".'];
    },
    importFn: async (data: any[]) => {
        await bulkInsertSystems(data);
    },
    clearFn: async () => {
        await clearSystemsTable();
    },
    processRow: (row: any) => {
        // Ensure status has a default if missing
        if (!row.status) row.status = 'unknown';
        // Ensure is_favorite is 0 or 1
        if (row.is_favorite === 'true' || row.is_favorite === true || row.is_favorite === '1' || row.is_favorite === 1) {
            row.is_favorite = 1;
        } else {
            row.is_favorite = 0;
        }
        return row;
    },
    sheetNameKeyword: 'system'
};
