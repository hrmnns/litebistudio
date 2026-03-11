import * as XLSX from 'xlsx';

export interface ColumnDefinition {
    name: string;
    type: 'TEXT' | 'INTEGER' | 'REAL';
}

export interface SheetAnalysis {
    sheetName: string;
    suggestedTableName: string;
    columns: ColumnDefinition[];
    rowCount: number;
    data: Record<string, unknown>[];
    isValid: boolean;
    validationError?: string;
}

export async function analyzeExcelFile(file: File): Promise<SheetAnalysis[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const analyses: SheetAnalysis[] = [];
                const isCsvFile = /\.csv$/i.test(file.name);
                const csvBaseName = file.name.replace(/\.[^/.]+$/, '');
                const sanitizeIdentifier = (rawName: string): string => {
                    let normalized = rawName.toLowerCase()
                        .replace(/[^a-z0-9_]/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .replace(/_+/g, '_');

                    if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
                        if (/^[0-9]/.test(normalized)) {
                            normalized = 'tbl_' + normalized;
                        } else if (normalized === '') {
                            normalized = 'tbl_unnamed';
                        }
                    }

                    return normalized;
                };

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (!jsonData || jsonData.length < 2) {
                        continue; // Skip empty sheets or sheets without data rows
                    }

                    // Extract Headers
                    const headers = (jsonData[0] as unknown[]).map(h => String(h).trim());
                    const rows = jsonData.slice(1) as unknown[][];

                    // For CSV use file name as table name suggestion; for Excel keep sheet name.
                    const rawSuggestedName = isCsvFile ? csvBaseName : sheetName;
                    const suggestedTableName = sanitizeIdentifier(rawSuggestedName);

                    let validationError: string | undefined = undefined;
                    let isValid = true;

                    // Validate reserved prefix
                    if (suggestedTableName.startsWith('sys_')) {
                        isValid = false;
                        validationError = "Tabellennamen dürfen nicht mit 'sys_' beginnen (reserviert).";
                    }

                    // Infer Types
                    const columns: ColumnDefinition[] = headers.map((header, index) => {
                        let isInt = true;
                        let isReal = true;
                        let hasData = false;

                        // Check first 100 rows for type inference
                        const sampleLimit = Math.min(rows.length, 100);
                        for (let i = 0; i < sampleLimit; i++) {
                            const val = rows[i][index];
                            if (val === undefined || val === null || val === '') continue;

                            hasData = true;
                            const num = Number(val);

                            if (isNaN(num)) {
                                isInt = false;
                                isReal = false;
                                break;
                            }

                            if (!Number.isInteger(num)) {
                                isInt = false;
                            }
                        }

                        let type: 'TEXT' | 'INTEGER' | 'REAL' = 'TEXT';
                        if (hasData) {
                            if (isInt) type = 'INTEGER';
                            else if (isReal) type = 'REAL';
                        }

                        // Sanitize column name
                        const cleanHeader = header.toLowerCase().replace(/[^a-z0-9_]/g, '_');

                        return { name: cleanHeader, type };
                    });

                    // Prepare Data (Full Dataset with Sanitized Keys)
                    const data = rows.map(row => {
                        const obj: Record<string, unknown> = {};
                        columns.forEach((col, i) => {
                            let val: unknown = row[i];
                            if (val instanceof Date) {
                                val = val.toISOString();
                            } else if (typeof val === 'object' && val !== null) {
                                val = JSON.stringify(val);
                            }
                            obj[col.name] = val;
                        });
                        return obj;
                    });

                    analyses.push({
                        sheetName,
                        suggestedTableName,
                        columns,
                        rowCount: rows.length,
                        data, // Full data for import
                        isValid,
                        validationError
                    });
                }

                resolve(analyses);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}
