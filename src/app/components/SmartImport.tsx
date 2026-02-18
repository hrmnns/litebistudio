import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, ChevronRight, AlertCircle, Trash2, Database, Table as TableIcon } from 'lucide-react';
import { analyzeExcelFile } from '../../lib/utils/excelParser';
import { SystemRepository } from '../../lib/repositories/SystemRepository';

interface TablePreview {
    sheetName: string;
    tableName: string;
    columns: { name: string; type: string }[];
    rows: any[];
    isValid: boolean;
    error?: string;
}

export const SmartImport: React.FC = () => {
    const { t } = useTranslation();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [previews, setPreviews] = useState<TablePreview[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const results = await analyzeExcelFile(file);
            const initialPreviews: TablePreview[] = results.map(res => ({
                sheetName: res.sheetName,
                tableName: res.suggestedTableName.startsWith('usr_') ? res.suggestedTableName : `usr_${res.suggestedTableName}`,
                columns: res.columns,
                rows: res.data,
                isValid: res.isValid,
                error: res.validationError
            }));
            setPreviews(initialPreviews);
            setStep(2);
        } catch (error) {
            console.error('Analysis failed', error);
            alert(t('datasource.smart_import.error_analyzing'));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleImport = async () => {
        setIsImporting(true);
        try {
            for (const preview of previews) {
                if (!preview.isValid) continue;

                // 1. Create Table
                const columnsSql = preview.columns
                    .map(col => `"${col.name}" ${col.type}`)
                    .join(', ');

                await SystemRepository.executeRaw(`CREATE TABLE IF NOT EXISTS "${preview.tableName}" (${columnsSql});`);

                // 2. Bulk Insert
                const CHUNK_SIZE = 500;
                for (let i = 0; i < preview.rows.length; i += CHUNK_SIZE) {
                    await SystemRepository.bulkInsert(preview.tableName, preview.rows.slice(i, i + CHUNK_SIZE));
                }
            }
            setStep(1);
            setPreviews([]);
            window.dispatchEvent(new Event('db-updated'));
        } catch (error: any) {
            alert(t('common.error') + ': ' + error.message);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Step Indicator */}
            <div className="flex items-center gap-4 px-2">
                {[
                    { s: 1, label: t('datasource.smart_import.step_upload') },
                    { s: 2, label: t('datasource.smart_import.step_config') },
                    { s: 3, label: t('datasource.smart_import.step_import') }
                ].map(({ s, label }) => (
                    <React.Fragment key={s}>
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${step >= s ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {s}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= s ? 'text-slate-700' : 'text-slate-400'}`}>
                                {label}
                            </span>
                        </div>
                        {s < 3 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                    </React.Fragment>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[200px]">
                {step === 1 && (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-2xl p-12 transition-all cursor-pointer text-center"
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                        />
                        <div className="flex flex-col items-center gap-4">
                            <div className="p-4 bg-blue-50 group-hover:bg-blue-100 rounded-2xl text-blue-600 transition-colors">
                                <Upload className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-700">{t('datasource.smart_import.upload_label')}</p>
                                <p className="text-xs text-slate-400 mt-1">{t('datasource.smart_import.upload_hint')}</p>
                            </div>
                        </div>
                        {isAnalyzing && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl z-10">
                                <div className="flex items-center gap-3 text-blue-600">
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs font-bold">{t('common.loading')}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700">{t('datasource.smart_import.found_tables')}</h4>
                                <p className="text-[10px] text-slate-400">{t('datasource.smart_import.found_tables_hint')}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {previews.map((preview, idx) => (
                                <div key={idx} className={`p-4 rounded-xl border-2 transition-all ${preview.isValid ? 'bg-white border-slate-100 shadow-sm' : 'bg-red-50 border-red-100'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase">{t('datasource.smart_import.sheet_label')} {preview.sheetName}</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <TableIcon className="w-4 h-4 text-blue-500" />
                                                        <input
                                                            value={preview.tableName}
                                                            onChange={(e) => {
                                                                const newPreviews = [...previews];
                                                                newPreviews[idx].tableName = e.target.value;
                                                                newPreviews[idx].isValid = e.target.value.length > 0 && !e.target.value.startsWith('sys_');
                                                                setPreviews(newPreviews);
                                                            }}
                                                            className={`text-sm font-bold bg-transparent border-b-2 outline-none w-full ${preview.isValid ? 'border-blue-100 focus:border-blue-500' : 'border-red-300'}`}
                                                            placeholder={t('datasource.smart_import.table_label')}
                                                        />
                                                    </div>
                                                    {!preview.isValid && (
                                                        <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                                                            <AlertCircle className="w-3 h-3" /> {t('datasource.smart_import.invalid_prefix')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                                    <Database className="w-3 h-3" />
                                                    {t('datasource.smart_import.columns_count', { count: preview.columns.length })}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                                    <FileSpreadsheet className="w-3 h-3" />
                                                    {t('datasource.smart_import.rows_count', { count: preview.rows.length })}
                                                </div>
                                            </div>

                                            {/* Preview Pill Chips */}
                                            <div className="flex flex-wrap gap-1">
                                                {preview.columns.slice(0, 5).map(col => (
                                                    <span key={col.name} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-medium">
                                                        {col.name} <span className="opacity-50 font-mono">({col.type})</span>
                                                    </span>
                                                ))}
                                                {preview.columns.length > 5 && (
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[9px] font-medium">{t('datasource.smart_import.more_columns', { count: preview.columns.length - 5 })}</span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setPreviews(previews.filter((_, i) => i !== idx))}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setStep(1)}
                                className="px-4 py-2 text-slate-500 font-bold text-xs hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                {t('datasource.smart_import.back_btn')}
                            </button>
                            <button
                                onClick={() => { setStep(3); handleImport(); }}
                                disabled={previews.length === 0 || previews.some(p => !p.isValid) || isImporting}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                            >
                                {t('datasource.smart_import.start_import')} <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Database className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-700">{t('datasource.smart_import.import_running')}</h4>
                            <p className="text-xs text-slate-400 mt-1">{t('common.loading')}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
