import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Database, Upload, Table as TableIcon, Plus, Trash2, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { ExcelImport, type ImportConfig } from '../components/ExcelImport';
import { SmartImport } from '../components/SmartImport';
import { SchemaTable } from '../components/SchemaDocumentation';
import type { SchemaDefinition } from '../components/SchemaDocumentation';
import { InlineAlert } from '../components/ui/InlineAlert';
import type { AlertType } from '../components/ui/InlineAlert';
import { Modal } from '../components/Modal';
import { PageLayout } from '../components/ui/PageLayout';
import { MappingManager } from '../components/MappingManager';
import { useBackupStatus } from '../../hooks/useBackupStatus';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { encryptBuffer, decryptBuffer } from '../../lib/utils/crypto';
import { Lock, Unlock } from 'lucide-react';
import { useDashboard } from '../../lib/context/DashboardContext';

interface DatasourceViewProps {
    onImportComplete: () => void;
}

interface RestoreReport {
    headerMatch: boolean;
    isValid: boolean;
    error?: string;
    isDowngrade?: boolean;
    missingTables: string[];
    missingColumns: Record<string, string[]>;
    versionInfo?: {
        backup: string | number;
        current: string | number;
    };
}

export const DatasourceView: React.FC<DatasourceViewProps> = ({ onImportComplete }) => {
    const { t, i18n } = useTranslation();
    const now = new Date();
    const footerText = t('settings.last_update', {
        date: now.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US'),
        time: now.toLocaleTimeString(i18n.language === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    });
    const { isReadOnly, isAdminMode } = useDashboard();
    const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

    // Tab State
    const [activeTab, setActiveTab] = useState<'import' | 'structure' | 'system'>(() => {
        const stored = sessionStorage.getItem('litebistudio_datasource_tab');
        if (stored === 'import' || stored === 'structure' || stored === 'system') {
            return stored;
        }
        return 'import';
    });

    useEffect(() => {
        sessionStorage.setItem('litebistudio_datasource_tab', activeTab);
    }, [activeTab]);

    // Import State
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [tableSchema, setTableSchema] = useState<SchemaDefinition | null>(null);
    const [isSchemaOpen, setIsSchemaOpen] = useState(false);

    // Schema Manager State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const [sqlMode, setSqlMode] = useState(false);
    const [customSql, setCustomSql] = useState('CREATE TABLE usr_my_table (\n    id INTEGER PRIMARY KEY,\n    name TEXT,\n    amount REAL\n);');
    const [createColumns, setCreateColumns] = useState<{ name: string, type: string }[]>([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);

    const { isBackupRecommended, changeCount, markBackupComplete } = useBackupStatus();

    // Backup State
    const [useEncryption, setUseEncryption] = useState(false);
    const [backupPassword, setBackupPassword] = useState('');
    const [restoreAlert, setRestoreAlert] = useState<{ type: AlertType; message: string; title?: string; details?: string } | null>(null);
    const [isResetting, setIsResetting] = useState(false);

    // Fetch Tables
    const { data: tables, refresh: refreshTables } = useAsync<string[]>(
        () => SystemRepository.getTables(),
        []
    );

    // Filter Tables
    const isSystemTable = (name: string) => name.startsWith('sys_') || name === 'sqlite_sequence';
    const userTables = tables?.filter((t: string) => !isSystemTable(t)) || [];
    const systemTables = tables?.filter((t: string) => isSystemTable(t)) || [];

    // Load Schema for selected table (Generic Import)
    useEffect(() => {
        const loadSchema = async () => {
            if (!selectedTable) {
                setTableSchema(null);
                return;
            }

            // Dynamic Schema
            try {
                const columns = await SystemRepository.getTableSchema(selectedTable);
                const properties: NonNullable<SchemaDefinition['properties']> = {};
                columns.forEach(col => {
                    properties[col.name] = {
                        type: col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') ? 'number' : 'string',
                        description: col.type
                    };
                });
                setTableSchema({
                    title: selectedTable,
                    description: t('datasource.records_label', { name: selectedTable }),
                    properties,
                    required: columns.filter(c => c.notnull).map(c => c.name)
                });
            } catch (e) {
                console.error("Failed to load schema", e);
                setTableSchema(null);
            }
        };
        loadSchema();
    }, [selectedTable, tables, t]); // Reload schema when table selection OR table list changes (e.g. after migration/drop)

    // Build Import Config
    const getImportConfig = (): ImportConfig | undefined => {
        if (!selectedTable || !tableSchema) return undefined;

        return {
            key: `import_${selectedTable}`,
            entityLabel: t('datasource.records_label', { name: selectedTable }),
            schema: tableSchema,
            validate: () => true,
            getValidationErrors: () => [],
            importFn: async (data) => {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                    await SystemRepository.bulkInsert(selectedTable, data.slice(i, i + CHUNK_SIZE));
                }
            },
            clearFn: async () => {
                await SystemRepository.executeRaw(`DELETE FROM ${selectedTable}`);
            }
        };
    };

    const activeConfig = getImportConfig();

    // Table Actions
    const handleCreateTable = async () => {
        try {
            if (sqlMode) {
                await SystemRepository.executeRaw(customSql);
            } else {
                const cols = createColumns.map(c => `${c.name} ${c.type}`).join(', ');
                const sql = `CREATE TABLE ${newTableName} (${cols})`;
                await SystemRepository.executeRaw(sql);
            }
            setIsCreateModalOpen(false);
            refreshTables();
            setNewTableName('');
            setCreateColumns([{ name: 'id', type: 'INTEGER PRIMARY KEY' }]);
            alert(t('datasource.table_created'));
        } catch (error: unknown) {
            alert(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleDropTable = async (tableName: string) => {
        if (!confirm(t('datasource.drop_confirm', { name: tableName }))) return;
        try {
            await SystemRepository.executeRaw(`DROP TABLE ${tableName}`);
            refreshTables();
            if (selectedTable === tableName) setSelectedTable('');
        } catch (error: unknown) {
            alert(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    const handleClearTable = async (tableName: string) => {
        if (!confirm(t('datasource.clear_confirm', { name: tableName }))) return;
        try {
            await SystemRepository.executeRaw(`DELETE FROM ${tableName}`);
            refreshTables();
            alert(t('datasource.cleared_success'));
        } catch (error: unknown) {
            alert(t('common.error') + ': ' + getErrorMessage(error));
        }
    };

    return (
        <PageLayout
            header={{
                title: t('sidebar.datasource'),
                subtitle: t('datasource.subtitle'),
                onBack: () => window.history.back(),
                actions: (
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'import' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><Upload className="w-3 h-3" /> {t('datasource.tab_import')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('structure')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'structure' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><TableIcon className="w-3 h-3" /> {t('datasource.tab_structure')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'system' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><Database className="w-3 h-3" /> {t('datasource.tab_system')}</span>
                        </button>
                    </div>
                )
            }}
            footer={footerText}
        >
            <div className={`max-w-4xl space-y-6 mx-auto ${isReadOnly ? 'opacity-80' : ''}`}>
                {/* --- TAB: IMPORT (Smart & Generic) --- */}
                {activeTab === 'import' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* 1. Smart Import (New Tables) */}
                        <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{t('datasource.smart_import_title')}</h3>
                                    <p className="text-xs text-slate-400">{t('datasource.smart_import_hint')}</p>
                                </div>
                            </div>
                            <SmartImport />
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                            <span className="text-xs font-bold text-slate-400 uppercase">{t('datasource.or_separator')}</span>
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                        </div>

                        {/* 2. Generic Import (Append Data) */}
                        <div className={`bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 shadow-sm">
                                        <Database className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{t('datasource.append_data_title')}</h3>
                                        <p className="text-xs text-slate-400">{t('datasource.append_data_hint')}</p>
                                    </div>
                                </div>
                                <MappingManager />
                            </div>

                            <div className="mb-6">
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedTable}
                                        onChange={e => setSelectedTable(e.target.value)}
                                        className="w-full md:w-1/2 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="" disabled>{t('datasource.select_target_table')}</option>
                                        {tables?.filter((t: string) => !isSystemTable(t)).map((t: string) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <button onClick={() => refreshTables()} className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-lg">
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {selectedTable && (
                                <ExcelImport
                                    key={selectedTable}
                                    onImportComplete={onImportComplete}
                                    config={activeConfig}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB: STRUCTURE (Schema & Tables) --- */}
                {activeTab === 'structure' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Custom Tables Manager */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <TableIcon className="w-4 h-4" /> {t('datasource.user_tables')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">{t('datasource.user_tables_hint')}</p>
                                </div>
                                {!isReadOnly && (
                                    <button
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" /> {t('datasource.new_table')}
                                    </button>
                                )}
                            </div>

                            {userTables.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                    <p className="text-slate-400 text-sm">{t('datasource.no_user_tables')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {userTables.map((t_name: string) => (
                                        <div key={t_name} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white rounded-lg shadow-sm text-blue-600">
                                                    <TableIcon className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-slate-700">{t_name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => { setSelectedTable(t_name); setIsSchemaOpen(true); }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title={t('datasource.show_schema')}
                                                >
                                                    <Info className="w-4 h-4" />
                                                </button>
                                                {!isReadOnly && (
                                                    <>
                                                        <button
                                                            onClick={() => { setSelectedTable(t_name); setActiveTab('import'); }}
                                                            className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                                            title={t('datasource.append_data_short')}
                                                        >
                                                            <Upload className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDropTable(t_name)}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* System Tables Read-Only */}
                        {isAdminMode && (
                            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-6">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('datasource.system_tables')}</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {systemTables.map((t_name: string) => (
                                        <button
                                            key={t_name}
                                            onClick={() => { setSelectedTable(t_name); setIsSchemaOpen(true); }}
                                            className="px-3 py-2 bg-white/50 border border-slate-200/50 rounded text-xs font-mono text-slate-500 hover:bg-white hover:text-blue-600 text-left transition-colors"
                                        >
                                            {t_name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: SYSTEM (Maintenace & Backup) --- */}
                {activeTab === 'system' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Backup Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">{t('datasource.backup_restore')}</h3>

                            {isBackupRecommended && (
                                <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>{t('datasource.backup_recommended', { count: changeCount })}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                {/* Encryption Toggle */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setUseEncryption(!useEncryption)}
                                        className={`flex-1 p-3 rounded-xl border flex items-center gap-3 transition-all ${useEncryption ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-500' : 'bg-slate-50 border-slate-200'}`}
                                    >
                                        <div className={`p-2 rounded-lg ${useEncryption ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                                            {useEncryption ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                        </div>
                                        <div className="text-left">
                                            <div className={`text-sm font-bold ${useEncryption ? 'text-emerald-900' : 'text-slate-600'}`}>
                                                {useEncryption ? t('datasource.encryption_active') : t('datasource.encryption_standard')}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {useEncryption ? t('datasource.encryption_active_hint') : t('datasource.encryption_standard_hint')}
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {useEncryption && (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <input
                                            type="password"
                                            placeholder={t('datasource.backup_password_placeholder')}
                                            value={backupPassword}
                                            onChange={e => setBackupPassword(e.target.value)}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                                            autoFocus
                                        />
                                    </div>
                                )}

                                {restoreAlert && (
                                    <div className="mb-4">
                                        <InlineAlert
                                            type={restoreAlert.type}
                                            title={restoreAlert.title}
                                            message={restoreAlert.message}
                                            details={restoreAlert.details}
                                            onClose={() => setRestoreAlert(null)}
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <button
                                        onClick={async () => {
                                            if (useEncryption && backupPassword.length < 4) {
                                                alert(t('datasource.backup_password_error'));
                                                return;
                                            }

                                            const { exportDatabase } = await import('../../lib/db');
                                            const bytes = await exportDatabase();
                                            const plainBuffer = new Uint8Array(bytes).buffer;
                                            let outputBuffer: ArrayBuffer = plainBuffer;

                                            if (useEncryption) {
                                                outputBuffer = await encryptBuffer(plainBuffer, backupPassword);
                                            }

                                            const blob = new Blob([outputBuffer], { type: 'application/x-sqlite3' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `backup_${new Date().toISOString().split('T')[0]}${useEncryption ? '_secure' : ''}.sqlite3`;
                                            a.click();
                                            markBackupComplete();
                                            if (useEncryption) setBackupPassword('');
                                        }}
                                        className={`flex items-center justify-center gap-2 p-3 border rounded-lg text-sm font-bold transition-colors ${useEncryption ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <Database className="w-4 h-4" />
                                        {useEncryption ? t('datasource.save_backup_secure') : t('datasource.save_backup_standard')}
                                    </button>

                                    <div className="relative flex items-center justify-center gap-2 p-3 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-bold transition-colors">
                                        <input
                                            type="file"
                                            accept=".sqlite3,.sqlite,.db"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={async (e) => {
                                                const logTime = () => new Date().toLocaleTimeString();
                                                console.log(`[Restore][${logTime()}] onChange triggered`);
                                                setRestoreAlert(null);
                                                const file = e.target.files?.[0];
                                                if (!file) {
                                                    console.log(`[Restore][${logTime()}] No file selected`);
                                                    return;
                                                }
                                                console.log(`[Restore][${logTime()}] File selected:`, file.name, file.size, file.type);

                                                try {
                                                    console.log(`[Restore][${logTime()}] Calling file.arrayBuffer()...`);
                                                    const buffer = await file.arrayBuffer();
                                                    console.log(`[Restore][${logTime()}] Buffer received, size:`, buffer.byteLength);

                                                    const header = new Uint8Array(buffer.slice(0, 16));
                                                    const headerString = new TextDecoder().decode(header);
                                                    const isSqlite = headerString.startsWith('SQLite format 3');
                                                    console.log('[Restore] Header check - isSqlite:', isSqlite);

                                                    let finalBuffer = buffer;

                                                    if (!isSqlite) {
                                                        // Assume encrypted
                                                        const pwd = prompt(t('datasource.restore_encrypted_prompt'));
                                                        if (!pwd) return;

                                                        try {
                                                            const decrypted = await decryptBuffer(buffer, pwd);
                                                            finalBuffer = decrypted;
                                                        } catch {
                                                            setRestoreAlert({
                                                                type: 'error',
                                                                title: t('common.error'),
                                                                message: t('datasource.restore_failed')
                                                            });
                                                            return;
                                                        }
                                                    }

                                                    if (confirm(t('datasource.restore_confirm'))) {
                                                        console.log(`[Restore][${logTime()}] User confirmed restore. Starting process...`);
                                                        setRestoreAlert({
                                                            type: 'warning',
                                                            title: t('common.loading'),
                                                            message: 'Verarbeite Backup-Datei...',
                                                        });

                                                        try {
                                                            console.log(`[Restore][${logTime()}] Importing db module...`);
                                                            const { importDatabase } = await import('../../lib/db');
                                                            console.log(`[Restore][${logTime()}] Calling worker importDatabase...`);
                                                            const report = await importDatabase(finalBuffer) as unknown as RestoreReport;
                                                            console.log(`[Restore][${logTime()}] Worker report received:`, report);
                                                            const { versionInfo } = report;

                                                            if (!report.headerMatch) {
                                                                setRestoreAlert({
                                                                    type: 'error',
                                                                    title: t('datasource.restore_invalid'),
                                                                    message: report.error || t('datasource.restore_warning_hint')
                                                                });
                                                                return;
                                                            }

                                                            if (report.error) {
                                                                setRestoreAlert({
                                                                    type: 'error',
                                                                    title: report.isDowngrade ? 'Incompatible Backup' : t('common.error'),
                                                                    message: report.error,
                                                                    details: versionInfo ? `Backup Version: V${versionInfo.backup} | App Version: V${versionInfo.current}` : undefined
                                                                });
                                                                return;
                                                            }

                                                            if (!report.isValid) {
                                                                let details = "";
                                                                if (versionInfo) {
                                                                    details += `Schema: V${versionInfo.backup} → V${versionInfo.current} (Update required)\n\n`;
                                                                }
                                                                if (report.missingTables.length > 0) {
                                                                    details += t('datasource.restore_missing_tables') + '\n- ' + report.missingTables.join('\n- ') + '\n\n';
                                                                }

                                                                if (Object.keys(report.missingColumns).length > 0) {
                                                                    details += t('datasource.restore_missing_columns') + '\n';
                                                                    for (const [tbl, cols] of Object.entries(report.missingColumns)) {
                                                                        details += `- ${tbl}: ${(cols as string[]).join(', ')}\n`;
                                                                    }
                                                                }

                                                                setRestoreAlert({
                                                                    type: 'warning',
                                                                    title: t('datasource.restore_warning_title'),
                                                                    message: t('datasource.restore_warning_hint'),
                                                                    details: details
                                                                });
                                                            } else {
                                                                setRestoreAlert({
                                                                    type: 'success',
                                                                    title: t('common.success'),
                                                                    message: t('datasource.restore_success_reload'),
                                                                    details: versionInfo ? `Database Version: V${versionInfo.backup} (Upgraded to V${versionInfo.current})` : undefined
                                                                });
                                                                console.log(`[Restore][${logTime()}] Success! Reloading in 2s...`);
                                                                markBackupComplete();
                                                                setTimeout(() => window.location.reload(), 2000);
                                                            }
                                                        } catch (err: unknown) {
                                                            console.error(`[Restore][${logTime()}] Inner Error:`, err);
                                                            setRestoreAlert({
                                                                type: 'error',
                                                                title: t('common.error'),
                                                                message: getErrorMessage(err)
                                                            });
                                                        }
                                                    }
                                                } catch (err: unknown) {
                                                    console.error(`[Restore][${logTime()}] Outer Error:`, err);
                                                    setRestoreAlert({
                                                        type: 'error',
                                                        title: t('common.error'),
                                                        message: getErrorMessage(err)
                                                    });
                                                }
                                            }}
                                        />
                                        <Upload className="w-4 h-4 text-amber-500" /> {t('datasource.restore_backup')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-sm font-bold text-red-900 dark:text-red-400 uppercase tracking-wider leading-none">
                                        {t('datasource.danger_zone')}
                                    </h3>
                                    <p className="text-xs text-red-700/70 dark:text-red-300/60 mt-1">
                                        {t('datasource.danger_zone_hint')}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                {/* Clear Data Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.clear_reset')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="clear-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>{t('datasource.select_target_table')}</option>
                                                {(isAdminMode ? tables : userTables)?.map((table_n: string) => <option key={table_n} value={table_n}>{table_n}</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('clear-table-select') as HTMLSelectElement;
                                                    if (select.value) handleClearTable(select.value);
                                                }}
                                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs transition-colors"
                                            >
                                                {t('datasource.clear_btn')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.clear_reset_hint')}</p>
                                    </div>
                                </div>

                                {/* Drop Table Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.drop_table_title')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="drop-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>{t('datasource.select_target_table')}</option>
                                                {userTables.map((table_n: string) => <option key={table_n} value={table_n}>{table_n}</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('drop-table-select') as HTMLSelectElement;
                                                    if (select.value) handleDropTable(select.value);
                                                }}
                                                disabled={userTables.length === 0}
                                                className="px-3 py-2 bg-red-900 hover:bg-black text-white rounded font-bold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                {t('datasource.drop_btn')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.drop_table_hint')}</p>
                                    </div>
                                </div>

                                {/* Factory Reset Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm md:col-span-2">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">{t('datasource.factory_reset_title', 'Werkseinstellungen')}</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={isResetting}
                                                onClick={async () => {
                                                    const confirmText = t('datasource.factory_reset_confirm', 'Bist du sicher? Alle Daten, Dashboards und Widgets werden endgültig gelöscht. Dies kann nicht rückgängig gemacht werden!');
                                                    if (confirm(confirmText)) {
                                                        const promptText = prompt(t('datasource.factory_reset_prompt', 'Bitte tippe "RESET" ein, um fortzufahren:'));
                                                        if (promptText === 'RESET') {
                                                            try {
                                                                setIsResetting(true);
                                                                const { factoryResetDatabase } = await import('../../lib/db');
                                                                await factoryResetDatabase();
                                                                alert(t('datasource.factory_reset_success', 'Datenbank wurde auf Werkseinstellungen zurückgesetzt! Lade neu...'));
                                                                markBackupComplete();
                                                                sessionStorage.removeItem('litebistudio_datasource_tab');
                                                                window.location.hash = '#/';
                                                                window.location.reload();
                                                            } catch (err: unknown) {
                                                                setIsResetting(false);
                                                                alert(getErrorMessage(err));
                                                            }
                                                        } else if (promptText !== null) {
                                                            alert(t('datasource.factory_reset_aborted', 'Abgebrochen: Falsche Eingabe.'));
                                                        }
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-900 hover:bg-black text-white rounded font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                                                {t('datasource.factory_reset_btn', 'Komplett zurücksetzen')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">{t('datasource.factory_reset_hint', 'Löscht die gesamte Datenbank und erstellt ein frisches, leeres Schema der neuesten Version.')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals outside tabs */}
            <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={t('datasource.create_table_title')}>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
                        <button onClick={() => setSqlMode(false)} className={`px-3 py-1 text-xs font-bold rounded ${!sqlMode ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>{t('datasource.assistant')}</button>
                        <button onClick={() => setSqlMode(true)} className={`px-3 py-1 text-xs font-bold rounded ${sqlMode ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>SQL</button>
                    </div>

                    {sqlMode ? (
                        <textarea
                            value={customSql} onChange={e => setCustomSql(e.target.value)}
                            className="w-full h-40 font-mono text-sm p-3 bg-slate-900 text-white rounded-lg"
                        />
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">{t('datasource.name_label')}</label>
                                <input value={newTableName} onChange={e => setNewTableName(e.target.value)} className="w-full p-2 border rounded" placeholder="usr_tabelle" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">{t('datasource.columns_label')}</label>
                                {createColumns.map((col, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input value={col.name} onChange={e => {
                                            const newCols = [...createColumns]; newCols[idx].name = e.target.value; setCreateColumns(newCols);
                                        }} className="flex-1 p-2 border rounded text-sm" placeholder={t('datasource.name_label')} />
                                        <select value={col.type} onChange={e => {
                                            const newCols = [...createColumns]; newCols[idx].type = e.target.value; setCreateColumns(newCols);
                                        }} className="w-32 p-2 border rounded text-sm">
                                            <option value="TEXT">TEXT</option>
                                            <option value="INTEGER">INTEGER</option>
                                            <option value="REAL">REAL</option>
                                            <option value="INTEGER PRIMARY KEY">ID (PK)</option>
                                        </select>
                                        <button onClick={() => setCreateColumns(createColumns.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => setCreateColumns([...createColumns, { name: '', type: 'TEXT' }])} className="text-xs text-blue-600 font-bold flex items-center gap-1">{t('datasource.add_column')}</button>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={handleCreateTable} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">{t('datasource.create_btn')}</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isSchemaOpen} onClose={() => setIsSchemaOpen(false)} title={tableSchema?.title || selectedTable}>
                {tableSchema ? <SchemaTable schema={tableSchema} /> : <div className="p-4 text-center">{t('datasource.schema_not_available')}</div>}
            </Modal>
        </PageLayout >
    );
};
