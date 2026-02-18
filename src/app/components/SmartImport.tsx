import React, { useState } from 'react';
import { FileText, ArrowRight, Check, AlertCircle, X } from 'lucide-react';
import { analyzeExcelFile, type SheetAnalysis } from '../../lib/utils/excelParser';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

export const SmartImport: React.FC = () => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyses, setAnalyses] = useState<SheetAnalysis[]>([]);

    // Step 2 State
    const [selection, setSelection] = useState<Record<string, boolean>>({}); // sheetName -> isSelected
    const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({}); // sheetName -> newTableName

    // Step 3 State
    const [importStatus, setImportStatus] = useState<Record<string, 'pending' | 'success' | 'error'>>({});
    const [importErrors, setImportErrors] = useState<Record<string, string>>({});
    const [progress, setProgress] = useState(0);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const results = await analyzeExcelFile(file);
            setAnalyses(results);

            // Default selection: select all valid sheets
            const initialSelection: Record<string, boolean> = {};
            const initialOverrides: Record<string, string> = {};

            results.forEach(a => {
                if (a.isValid) {
                    initialSelection[a.sheetName] = true;
                    initialOverrides[a.sheetName] = a.suggestedTableName;
                }
            });

            setSelection(initialSelection);
            setNameOverrides(initialOverrides);
            setStep(2);
        } catch (err) {
            console.error(err);
            alert('Fehler beim Analysieren der Datei.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExecuteImport = async () => {
        setStep(3);
        const sheetsToImport = analyses.filter(a => selection[a.sheetName]);
        const total = sheetsToImport.length;
        let completed = 0;

        for (const sheet of sheetsToImport) {
            const tableName = nameOverrides[sheet.sheetName];

            // Double check validity (client side safety)
            if (tableName.startsWith('sys_')) {
                setImportStatus(prev => ({ ...prev, [sheet.sheetName]: 'error' }));
                setImportErrors(prev => ({ ...prev, [sheet.sheetName]: "Reserviertes Präfix 'sys_' nicht erlaubt." }));
                continue;
            }

            setImportStatus(prev => ({ ...prev, [sheet.sheetName]: 'pending' }));

            try {
                // 1. Create Table
                const cols = sheet.columns.map(c => `${c.name} ${c.type}`).join(', ');
                await SystemRepository.executeRaw(`DROP TABLE IF EXISTS ${tableName}`);
                await SystemRepository.executeRaw(`CREATE TABLE ${tableName} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ${cols},
                    _imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`);

                // 2. Insert Data
                // sheet.data keys match column names because we updated excelParser
                if (sheet.data && sheet.data.length > 0) {
                    await SystemRepository.bulkInsert(tableName, sheet.data);
                }

                setImportStatus(prev => ({ ...prev, [sheet.sheetName]: 'success' }));
            } catch (err: any) {
                console.error(err);
                setImportStatus(prev => ({ ...prev, [sheet.sheetName]: 'error' }));
                setImportErrors(prev => ({ ...prev, [sheet.sheetName]: err.message }));
            }

            completed++;
            setProgress((completed / total) * 100);
        }
    };

    const handleTableNameChange = (sheetName: string, newName: string) => {
        // Sanitize input
        const sanitized = newName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        setNameOverrides(prev => ({ ...prev, [sheetName]: sanitized }));
    };

    const isStep2Valid = () => {
        const selectedSheets = analyses.filter(a => selection[a.sheetName]);
        if (selectedSheets.length === 0) return false;

        // Check for any invalid names in selection
        return !selectedSheets.some(a => {
            const name = nameOverrides[a.sheetName] || '';
            return !name || name.startsWith('sys_');
        });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Steps Indicator */}
            <div className="flex items-center justify-center gap-4">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step >= 1 ? 'bg-blue-100' : 'bg-slate-100'}`}>1</div>
                    Upload
                </div>
                <div className="w-8 h-px bg-slate-200" />
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step >= 2 ? 'bg-blue-100' : 'bg-slate-100'}`}>2</div>
                    Vorschau & Config
                </div>
                <div className="w-8 h-px bg-slate-200" />
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${step >= 3 ? 'bg-blue-100' : 'bg-slate-100'}`}>3</div>
                    Import
                </div>
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="relative">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        disabled={isAnalyzing}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        id="smart-upload"
                    />
                    <label htmlFor="smart-upload" className={`flex flex-col items-center justify-center gap-4 p-12 border-2 border-dashed rounded-2xl transition-all ${isAnalyzing ? 'bg-slate-50 border-slate-200' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/10'}`}>
                        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 animate-pulse">
                            {isAnalyzing ? <div className="w-8 h-8 animate-spin rounded-full border-4 border-current border-t-transparent" /> : <FileText className="w-8 h-8" />}
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Excel-Datei auswählen</h3>
                            <p className="text-sm text-slate-500 mt-2">Wir analysieren die Struktur automatisch.</p>
                        </div>
                    </label>
                </div>
            )}

            {/* Step 2: Config */}
            {step === 2 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700">
                        <h3 className="text-lg font-bold">Gefundene Tabellen</h3>
                        <p className="text-sm text-slate-500">Wählen Sie aus, welche Blätter importiert werden sollen und prüfen Sie die Namen.</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[500px] overflow-y-auto">
                        {analyses.map(sheet => (
                            <div key={sheet.sheetName} className={`p-4 flex items-start gap-4 ${!selection[sheet.sheetName] ? 'opacity-50' : ''}`}>
                                <div className="pt-2">
                                    <input
                                        type="checkbox"
                                        checked={!!selection[sheet.sheetName]}
                                        onChange={() => setSelection(prev => ({ ...prev, [sheet.sheetName]: !prev[sheet.sheetName] }))}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="text-xs font-bold uppercase text-slate-400 w-16">Blatt:</div>
                                        <div className="font-medium">{sheet.sheetName}</div>

                                        {!sheet.isValid && <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {sheet.validationError || 'Ungültig'}</span>}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-xs font-bold uppercase text-slate-400 w-16">Tabelle:</div>
                                        <div className="flex-1 max-w-sm relative">
                                            <input
                                                type="text"
                                                value={nameOverrides[sheet.sheetName] || ''}
                                                onChange={(e) => handleTableNameChange(sheet.sheetName, e.target.value)}
                                                className={`w-full p-2 text-sm border rounded hover:border-blue-400 focus:border-blue-500 outline-none ${(nameOverrides[sheet.sheetName] || '').startsWith('sys_')
                                                    ? 'border-red-300 bg-red-50 text-red-700'
                                                    : 'border-slate-200 bg-slate-50'
                                                    }`}
                                            />
                                            {(nameOverrides[sheet.sheetName] || '').startsWith('sys_') && (
                                                <div className="absolute right-2 top-2 text-red-500" title="Darf nicht mit sys_ beginnen">
                                                    <AlertCircle className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <span>{sheet.columns.length} Spalten erkannt</span>
                                        <span className="text-slate-300">|</span>
                                        <span>{sheet.rowCount} Zeilen</span>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {sheet.columns.slice(0, 5).map(c => (
                                            <span key={c.name} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono border border-slate-200">
                                                {c.name} <span className="text-slate-400">({c.type})</span>
                                            </span>
                                        ))}
                                        {sheet.columns.length > 5 && <span className="text-[10px] text-slate-400 px-1 py-0.5">+{sheet.columns.length - 5} weitere</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                        <button onClick={() => { setStep(1); setAnalyses([]); }} className="text-slate-500 hover:text-slate-700 text-sm font-medium px-4">Zurück</button>
                        <button
                            onClick={handleExecuteImport}
                            disabled={!isStep2Valid()}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            Import Starten <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Execution */}
            {step === 3 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2">Importiere Daten...</h3>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
                            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {analyses.filter(a => selection[a.sheetName]).map(sheet => {
                            const status = importStatus[sheet.sheetName];
                            return (
                                <div key={sheet.sheetName} className="py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />}
                                        {status === 'success' && <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><Check className="w-3 h-3" /></div>}
                                        {status === 'error' && <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><X className="w-3 h-3" /></div>}
                                        <span className="font-medium text-sm">{nameOverrides[sheet.sheetName]}</span>
                                    </div>
                                    {status === 'error' && <span className="text-xs text-red-500">{importErrors[sheet.sheetName]}</span>}
                                </div>
                            );
                        })}
                    </div>

                    {progress === 100 && (
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={() => {
                                    setStep(1);
                                    setAnalyses([]);
                                    // Trigger refresh
                                    window.dispatchEvent(new Event('db-updated'));
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-200 dark:shadow-none transition-transform hover:scale-105"
                            >
                                Fertig
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
