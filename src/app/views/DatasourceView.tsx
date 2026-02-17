import React from 'react';
import { Info, Database, Upload } from 'lucide-react';
import { ExcelImport } from '../components/ExcelImport';
import { SchemaTable } from '../components/SchemaDocumentation';
import { Modal } from '../components/Modal';
import { PageLayout } from '../components/ui/PageLayout';
import invoiceItemsSchema from '../../schemas/invoice-items-schema.json';
import systemsSchema from '../../schemas/systems-schema.json';
import { systemsImportConfig } from '../components/importers/SystemsImportConfig';
import { MappingManager } from '../components/MappingManager';
import { useBackupStatus } from '../hooks/useBackupStatus';

interface DatasourceViewProps {
    onImportComplete: () => void;
}

export const DatasourceView: React.FC<DatasourceViewProps> = ({ onImportComplete }) => {
    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    const [target, setTarget] = React.useState<'invoice_items' | 'systems'>('invoice_items');
    const [isSchemaOpen, setIsSchemaOpen] = React.useState(false);

    const { isBackupRecommended, changeCount, markBackupComplete } = useBackupStatus();

    const activeConfig = target === 'systems' ? systemsImportConfig : undefined;
    const activeSchema = target === 'systems' ? systemsSchema : invoiceItemsSchema;

    return (
        <PageLayout
            header={{
                title: 'Datenverwaltung',
                subtitle: 'Excel- und CSV-Dateien importieren und Datenbank verwalten',
                onBack: () => window.history.back(),
            }}
            footer={footerText}
            breadcrumbs={[
                { label: 'Datenverwaltung' }
            ]}
        >
            <div className="max-w-3xl space-y-6">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-1">
                                <Info className="w-4 h-4" />
                                Beispieldaten laden
                            </h3>
                            <p className="text-xs text-blue-700/70 dark:text-blue-300/60 max-w-md">
                                Neu im Dashboard? Lade Beispieldaten, um Kacheln, Diagramme und Datenbankfunktionen sofort zu erkunden.
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    const { loadDemoData, initSchema, initDB } = await import('../../lib/db');
                                    await initDB();
                                    await initSchema();
                                    await loadDemoData();
                                    window.dispatchEvent(new Event('db-updated'));
                                    onImportComplete();
                                } catch (e) {
                                    console.error(e);
                                    alert('Fehler beim Laden der Daten');
                                }
                            }}
                            className="flex-shrink-0 h-10 flex items-center justify-center gap-2 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all shadow-sm"
                        >
                            Demo laden
                        </button>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Daten importieren</h3>
                        <div className="flex items-center gap-4">
                            <MappingManager />
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                            <button
                                onClick={() => setIsSchemaOpen(true)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1.5 transition-colors"
                            >
                                <Info className="w-3.5 h-3.5" />
                                Format & Schema ansehen
                            </button>
                        </div>
                    </div>

                    {/* Target Selector */}
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg mb-6 w-fit">
                        <button
                            onClick={() => setTarget('invoice_items')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${target === 'invoice_items'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                        >
                            Rechnungen
                        </button>
                        <button
                            onClick={() => setTarget('systems')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${target === 'systems'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                }`}
                        >
                            Systeme
                        </button>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        {target === 'invoice_items'
                            ? 'Laden Sie hier Ihre Rechnungsdaten (Excel/CSV) hoch. Das System erkennt automatisch Perioden und Lieferanten.'
                            : 'Importieren Sie hier Ihre Systemliste. Die Datei muss mindestens eine Spalte "name" enthalten.'}
                    </p>

                    <ExcelImport
                        key={target} // Force re-mount on target change
                        onImportComplete={onImportComplete}
                        config={activeConfig}
                    />
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Sicherung & Wiederherstellung</h3>

                    {/* Backup Reminder Banner */}
                    {isBackupRecommended && (
                        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-lg flex items-start gap-3">
                            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                    Ungesicherte Änderungen
                                </h4>
                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                    Es wurden <strong>{changeCount}</strong> Änderungen seit der letzten Sicherung vorgenommen.
                                    Ein Backup wird empfohlen.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={async () => {
                                const { exportDatabase } = await import('../../lib/db');
                                const bytes = await exportDatabase();
                                const blob = new Blob([bytes as any], { type: 'application/x-sqlite3' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `itdashboard_backup_${new Date().toISOString().split('T')[0]}.sqlite3`;
                                a.click();
                                URL.revokeObjectURL(url);
                                markBackupComplete();
                            }}
                            className={`flex items-center justify-center gap-2 px-4 py-3 border text-sm font-medium rounded-lg transition-all shadow-sm ${isBackupRecommended
                                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-100'
                                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200'
                                }`}
                        >
                            <Database className={`w-4 h-4 ${isBackupRecommended ? 'text-amber-600' : 'text-blue-500'}`} />
                            Datenbank herunterladen (.sqlite3)
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                accept=".sqlite3"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (confirm('Das Importieren einer Datenbank überschreibt die aktuellen lokalen Daten. Die Seite wird nach dem Import neu geladen. Fortfahren?')) {
                                        try {
                                            const { importDatabase } = await import('../../lib/db');
                                            const buffer = await file.arrayBuffer();
                                            await importDatabase(buffer);
                                            alert('Datenbank erfolgreich wiederhergestellt. Seite wird neu geladen...');
                                            window.location.reload();
                                        } catch (err: any) {
                                            console.error(err);
                                            alert('Fehler beim Importieren: ' + err.message);
                                        }
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-all shadow-sm pointer-events-none">
                                <Upload className="w-4 h-4 text-indigo-500" />
                                Aus Sicherung wiederherstellen (.sqlite3)
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-rose-100 dark:border-rose-900/30 p-6 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
                        <Database className="w-32 h-32 text-rose-600 rotate-12" />
                    </div>

                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Gefahrenbereich</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                        Hier können Sie gezielt Tabelleninhalte löschen. Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>

                    <div className="flex flex-col md:flex-row items-end gap-4 max-w-xl">
                        <div className="flex-1 w-full">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                Tabelle auswählen
                            </label>
                            <select
                                id="table-to-clear"
                                className="w-full h-11 px-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all appearance-none cursor-pointer"
                                defaultValue="invoice_items"
                            >
                                <option value="invoice_items">Rechnungen (invoice_items)</option>
                                <option value="systems">Systeme (systems)</option>
                                <option value="worklist">Arbeitsvorrat (worklist)</option>
                            </select>
                        </div>

                        <button
                            onClick={async () => {
                                const select = document.getElementById('table-to-clear') as HTMLSelectElement;
                                const tableName = select.value;
                                const tableLabel = select.options[select.selectedIndex].text.split(' (')[0];

                                if (confirm(`Möchten Sie wirklich alle Einträge aus der Tabelle "${tableLabel}" löschen?`)) {
                                    const { clearTable } = await import('../../lib/db');
                                    await clearTable(tableName);
                                    window.dispatchEvent(new Event('db-updated'));
                                    window.dispatchEvent(new CustomEvent('db-changed', {
                                        detail: { type: 'clear', target: tableName }
                                    }));
                                    onImportComplete();
                                }
                            }}
                            className="h-11 flex items-center justify-center gap-2 px-6 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-700 dark:bg-rose-900/10 dark:hover:bg-rose-600 dark:text-rose-400 text-sm font-black rounded-xl border border-rose-100 dark:border-rose-900/30 transition-all uppercase tracking-wider shadow-sm"
                        >
                            Tabelle leeren
                            <Database className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isSchemaOpen}
                onClose={() => setIsSchemaOpen(false)}
                title={activeSchema.title || 'Datenschema'}
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {activeSchema.description}
                    </p>
                    <SchemaTable schema={activeSchema} />
                </div>
            </Modal>
        </PageLayout>
    );
};
