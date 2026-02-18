import React, { useState, useEffect } from 'react';
import { Info, Database, Upload, Table as TableIcon, Plus, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { ExcelImport, type ImportConfig } from '../components/ExcelImport';
import { SmartImport } from '../components/SmartImport';
import { SchemaTable } from '../components/SchemaDocumentation';
import { Modal } from '../components/Modal';
import { PageLayout } from '../components/ui/PageLayout';
import { MappingManager } from '../components/MappingManager';
import { useBackupStatus } from '../../hooks/useBackupStatus';
import { SystemRepository } from '../../lib/repositories/SystemRepository';
import { useAsync } from '../../hooks/useAsync';
import { encryptBuffer, decryptBuffer } from '../../lib/utils/crypto';
import { Lock, Unlock } from 'lucide-react';

interface DatasourceViewProps {
    onImportComplete: () => void;
}

export const DatasourceView: React.FC<DatasourceViewProps> = ({ onImportComplete }) => {
    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    // Tab State
    const [activeTab, setActiveTab] = useState<'import' | 'structure' | 'system'>('import');

    // Import State
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [tableSchema, setTableSchema] = useState<any>(null);
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
                const properties: Record<string, any> = {};
                columns.forEach(col => {
                    properties[col.name] = {
                        type: col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') ? 'number' : 'string',
                        description: col.type
                    };
                });
                setTableSchema({
                    title: selectedTable,
                    description: `Schema für ${selectedTable}`,
                    properties,
                    required: columns.filter(c => c.notnull).map(c => c.name)
                });
            } catch (e) {
                console.error("Failed to load schema", e);
                setTableSchema(null);
            }
        };
        loadSchema();
    }, [selectedTable, tables]); // Reload schema when table selection OR table list changes (e.g. after migration/drop)

    // Build Import Config
    const getImportConfig = (): ImportConfig | undefined => {
        if (!selectedTable || !tableSchema) return undefined;

        return {
            key: `import_${selectedTable}`,
            entityLabel: `Datensätze (${selectedTable})`,
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
            alert('Tabelle erstellt!');
        } catch (error: any) {
            alert('Fehler: ' + error.message);
        }
    };

    const handleDropTable = async (tableName: string) => {
        if (!confirm(`Tabelle "${tableName}" wirklich löschen?`)) return;
        try {
            await SystemRepository.executeRaw(`DROP TABLE ${tableName}`);
            refreshTables();
            if (selectedTable === tableName) setSelectedTable('');
        } catch (error: any) {
            alert('Fehler: ' + error.message);
        }
    };

    const handleClearTable = async (tableName: string) => {
        if (!confirm(`Alle Daten in Tabelle "${tableName}" unwiderruflich löschen?`)) return;
        try {
            await SystemRepository.executeRaw(`DELETE FROM ${tableName}`);
            refreshTables();
            alert('Tabelle geleert.');
        } catch (error: any) {
            alert('Fehler: ' + error.message);
        }
    };

    return (
        <PageLayout
            header={{
                title: 'Daten-Management Center',
                subtitle: 'Zentrale Verwaltung für Importe, Strukturen und Systemwartung.',
                onBack: () => window.history.back(),
                actions: (
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'import' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><Upload className="w-3 h-3" /> Daten-Import</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('structure')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'structure' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><TableIcon className="w-3 h-3" /> Struktur & Schema</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'system' ? 'bg-white dark:bg-slate-600 shadow text-blue-600 dark:text-blue-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="flex items-center gap-2"><Database className="w-3 h-3" /> Wartung & Backup</span>
                        </button>
                    </div>
                )
            }}
            footer={footerText}
        >
            <div className="max-w-4xl space-y-6 mx-auto">

                {/* --- TAB: IMPORT (Smart & Generic) --- */}
                {activeTab === 'import' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* 1. Smart Import (New Tables) */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Neue Tabelle erstellen (Smart Import)</h3>
                                    <p className="text-xs text-slate-400">Analysiert Excel-Dateien und erstellt automatisch die passenden Tabellen.</p>
                                </div>
                            </div>
                            <SmartImport />
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                            <span className="text-xs font-bold text-slate-400 uppercase">ODER</span>
                            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                        </div>

                        {/* 2. Generic Import (Append Data) */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 shadow-sm">
                                        <Database className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Daten anfügen</h3>
                                        <p className="text-xs text-slate-400">Importieren Sie Daten in eine bestehende Tabelle.</p>
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
                                        <option value="" disabled>Ziel-Tabelle wählen...</option>
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
                                        <TableIcon className="w-4 h-4" /> Benutzerdefinierte Tabellen
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">Verwalten Sie Ihre eigenen Tabellenstrukturen.</p>
                                </div>
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4" /> Neue Tabelle
                                </button>
                            </div>

                            {userTables.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                    <p className="text-slate-400 text-sm">Keine eigenen Tabellen vorhanden.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {userTables.map((t: string) => (
                                        <div key={t} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white rounded-lg shadow-sm text-blue-600">
                                                    <TableIcon className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-slate-700">{t}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => { setSelectedTable(t); setIsSchemaOpen(true); }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Schema anzeigen"
                                                >
                                                    <Info className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedTable(t); setActiveTab('import'); }}
                                                    className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                                    title="Daten anfügen"
                                                >
                                                    <Upload className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDropTable(t)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Löschen"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* System Tables Read-Only */}
                        <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-6">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">System-Tabellen (Read-Only)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {systemTables.map((t: string) => (
                                    <button
                                        key={t}
                                        onClick={() => { setSelectedTable(t); setIsSchemaOpen(true); }}
                                        className="px-3 py-2 bg-white/50 border border-slate-200/50 rounded text-xs font-mono text-slate-500 hover:bg-white hover:text-blue-600 text-left transition-colors"
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: SYSTEM (Maintenace & Backup) --- */}
                {activeTab === 'system' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Backup Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Backup & Restore</h3>

                            {isBackupRecommended && (
                                <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>{changeCount} ungesicherte Änderungen. Backup empfohlen.</span>
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
                                                {useEncryption ? 'Verschlüsselung aktiviert' : 'Standard-Backup (Unverschlüsselt)'}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {useEncryption ? 'Datei wird mit Passwort geschützt.' : 'Datei ist für jeden lesbar.'}
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {useEncryption && (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <input
                                            type="password"
                                            placeholder="Passwort für Backup setzen..."
                                            value={backupPassword}
                                            onChange={e => setBackupPassword(e.target.value)}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                                            autoFocus
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <button
                                        onClick={async () => {
                                            if (useEncryption && backupPassword.length < 4) {
                                                alert('Bitte ein sicheres Passwort angeben (min. 4 Zeichen).');
                                                return;
                                            }

                                            const { exportDatabase } = await import('../../lib/db');
                                            let bytes = await exportDatabase();

                                            if (useEncryption) {
                                                bytes = new Uint8Array(await encryptBuffer(bytes as any, backupPassword));
                                            }

                                            const blob = new Blob([bytes as any], { type: 'application/x-sqlite3' });
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
                                        {useEncryption ? 'Geschützt speichern' : 'Backup speichern'}
                                    </button>

                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".sqlite3"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                const buffer = await file.arrayBuffer();
                                                const header = new Uint8Array(buffer.slice(0, 16));
                                                const headerString = new TextDecoder().decode(header);
                                                const isSqlite = headerString.startsWith('SQLite format 3');

                                                let finalBuffer = buffer;

                                                if (!isSqlite) {
                                                    // Assume encrypted
                                                    const pwd = prompt('Diese Datei scheint verschlüsselt zu sein. Bitte Passwort eingeben:');
                                                    if (!pwd) return;

                                                    try {
                                                        const decrypted = await decryptBuffer(buffer, pwd);
                                                        finalBuffer = decrypted;
                                                    } catch (err) {
                                                        alert('Entschlüsselung fehlgeschlagen! Falsches Passwort oder beschädigte Datei.');
                                                        return;
                                                    }
                                                }

                                                if (confirm('Achtung: Dies überschreibt ALLE lokalen Daten! Fortfahren?')) {
                                                    try {
                                                        const { importDatabase } = await import('../../lib/db');
                                                        await importDatabase(finalBuffer);
                                                        window.location.reload();
                                                    } catch (err: any) { alert('Fehler: ' + err.message); }
                                                }
                                            }}
                                        />
                                        <button className="w-full flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 transition-colors pointer-events-none">
                                            <Upload className="w-4 h-4 text-amber-500" /> Backup wiederherstellen
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-red-900 dark:text-red-100 uppercase tracking-widest">Gefahrenzone</h3>
                                    <p className="text-xs text-red-700/70 dark:text-red-300/60">Destruktive Aktionen – Änderungen können nicht rückgängig gemacht werden.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Clear Data Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">Daten löschen (Reset)</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="clear-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Tabelle wählen...</option>
                                                {tables?.map((t: string) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('clear-table-select') as HTMLSelectElement;
                                                    if (select.value) handleClearTable(select.value);
                                                }}
                                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs transition-colors"
                                            >
                                                Leeren
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Entfernt alle Zeilen aus der gewählten Tabelle, behält aber die Struktur bei.</p>
                                    </div>
                                </div>

                                {/* Drop Table Card */}
                                <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-black text-slate-400 uppercase mb-3">Tabelle entfernen</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="drop-table-select"
                                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none"
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Eigene Tabelle wählen...</option>
                                                {userTables.map((t: string) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('drop-table-select') as HTMLSelectElement;
                                                    if (select.value) handleDropTable(select.value);
                                                }}
                                                disabled={userTables.length === 0}
                                                className="px-3 py-2 bg-red-900 hover:bg-black text-white rounded font-bold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                Löschen
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Löscht die komplette Tabelle inklusive Struktur. Nur für eigene Tabellen möglich.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modals outside tabs */}
                <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Neue Tabelle">
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
                            <button onClick={() => setSqlMode(false)} className={`px-3 py-1 text-xs font-bold rounded ${!sqlMode ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Assistent</button>
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
                                    <label className="text-xs font-bold text-slate-500 uppercase">Name</label>
                                    <input value={newTableName} onChange={e => setNewTableName(e.target.value)} className="w-full p-2 border rounded" placeholder="usr_tabelle" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Spalten</label>
                                    {createColumns.map((col, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <input value={col.name} onChange={e => {
                                                const newCols = [...createColumns]; newCols[idx].name = e.target.value; setCreateColumns(newCols);
                                            }} className="flex-1 p-2 border rounded text-sm" placeholder="Name" />
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
                                    <button onClick={() => setCreateColumns([...createColumns, { name: '', type: 'TEXT' }])} className="text-xs text-blue-600 font-bold flex items-center gap-1">+ Spalte</button>
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-4">
                            <button onClick={handleCreateTable} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Erstellen</button>
                        </div>
                    </div>
                </Modal>

                <Modal isOpen={isSchemaOpen} onClose={() => setIsSchemaOpen(false)} title={tableSchema?.title || selectedTable}>
                    {tableSchema ? <SchemaTable schema={tableSchema} /> : <div className="p-4 text-center">Kein Schema verfügbar</div>}
                </Modal>

            </div>
        </PageLayout >
    );
};
