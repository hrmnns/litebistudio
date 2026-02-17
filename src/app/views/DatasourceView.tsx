import React from 'react';
import { Info, Database, Upload } from 'lucide-react';
import { ExcelImport } from '../components/ExcelImport';
import { SchemaDocumentation } from '../components/SchemaDocumentation';
import { PageLayout } from '../components/ui/PageLayout';
import invoiceItemsSchema from '../../schemas/invoice-items-schema.json';

interface DatasourceViewProps {
    onImportComplete: () => void;
}

export const DatasourceView: React.FC<DatasourceViewProps> = ({ onImportComplete }) => {
    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <PageLayout
            header={{
                title: 'Datenverwaltung',
                subtitle: 'Excel- und CSV-Dateien importieren und Datenbank verwalten',
                onBack: () => window.history.back(),
            }}
            footer={footerText}
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
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Daten importieren</h3>
                    <ExcelImport onImportComplete={onImportComplete} />
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Sicherung & Wiederherstellung</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={async () => {
                                const { exportDatabase } = await import('../../lib/db');
                                const bytes = await exportDatabase();
                                const blob = new Blob([bytes as any], { type: 'application/x-sqlite3' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'itdashboard.sqlite3';
                                a.click();
                                URL.revokeObjectURL(url);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-all shadow-sm"
                        >
                            <Database className="w-4 h-4 text-blue-500" />
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

                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-6">
                    <SchemaDocumentation
                        schema={invoiceItemsSchema}
                        title="Erwartetes Rechnungsformat"
                    />
                </div>
            </div>
        </PageLayout>
    );
};
