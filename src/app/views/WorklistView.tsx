import React, { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { WorklistRepository } from '../../lib/repositories/WorklistRepository';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { PageLayout } from '../components/ui/PageLayout';
import { PageSection } from '../components/ui/PageSection';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { Bookmark, ExternalLink, Trash2, CheckCircle, AlertCircle, HelpCircle, RotateCcw } from 'lucide-react';
import type { WorklistEntry, WorklistStatus } from '../../types';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';
import { cn } from '../../lib/utils';

interface WorklistViewProps {
    onBack: () => void;
}

export const WorklistView: React.FC<WorklistViewProps> = ({ onBack }) => {
    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    const [resolvedRecords, setResolvedRecords] = useState<any[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Fetch all worklist items
    const { data: worklistItems, refresh } = useAsync<WorklistEntry[]>(
        () => WorklistRepository.getAll(),
        []
    );

    const handleRemove = async (e: React.MouseEvent, item: WorklistEntry) => {
        e.stopPropagation();
        if (confirm('Diesen Eintrag aus dem Arbeitsvorrat entfernen?')) {
            await WorklistRepository.toggle(item.source_table, item.source_id);
            refresh();
            window.dispatchEvent(new Event('db-updated'));
        }
    };

    // Resolve all worklist items to full records for navigation
    React.useEffect(() => {
        const resolveAll = async () => {
            if (!worklistItems || worklistItems.length === 0) {
                setResolvedRecords([]);
                return;
            }

            setLoadingDetail(true);
            try {
                const results = await Promise.all(
                    worklistItems.map(async (item) => {
                        if (item.source_table === 'invoice_items') {
                            const records = await InvoiceRepository.getByIdOrDocumentId(item.source_id);
                            return records[0] || null;
                        }
                        return null;
                    })
                );
                setResolvedRecords(results.filter(r => r !== null));
            } catch (err) {
                console.error('Failed to resolve worklist items', err);
            } finally {
                setLoadingDetail(false);
            }
        };

        resolveAll();
    }, [worklistItems]);

    const handleRowClick = (item: WorklistEntry) => {
        setSelectedDetailId(item.source_id);
    };

    const handleStatusUpdate = async (e: React.MouseEvent, item: WorklistEntry, status: WorklistStatus) => {
        e.stopPropagation();
        await WorklistRepository.updateStatus(item.source_table, item.source_id, status);
        refresh();
        window.dispatchEvent(new Event('db-updated'));
    };

    const columns: Column<WorklistEntry>[] = [
        {
            header: 'Status',
            accessor: 'status',
            render: (item: WorklistEntry) => {
                const config: Record<WorklistStatus, { label: string; icon: any; color: string }> = {
                    open: { label: 'Offen', icon: Bookmark, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800' },
                    ok: { label: 'OK', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' },
                    error: { label: 'Fehlerhaft', icon: AlertCircle, color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800' },
                    clarification: { label: 'In Klärung', icon: HelpCircle, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' }
                };
                const { label, icon: Icon, color } = config[item.status] || config.open;

                return (
                    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider w-fit", color)}>
                        <Icon className="w-3 h-3" />
                        {label}
                    </div>
                );
            }
        },
        {
            header: 'Bezeichnung',
            accessor: 'display_label',
            className: 'w-[40%]',
            render: (item: WorklistEntry) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-slate-900 dark:text-white line-clamp-1">
                        {item.display_label}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                            ID: {item.source_id}
                        </span>
                        <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-800 rounded font-black text-slate-500 uppercase">
                            {item.source_table}
                        </span>
                    </div>
                </div>
            )
        },
        {
            header: 'Kontext',
            accessor: 'display_context',
            render: (item: WorklistEntry) => (
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                    {item.display_context}
                </span>
            )
        },
        {
            header: 'Aktionen',
            accessor: 'id',
            align: 'right',
            render: (item: WorklistEntry) => (
                <div className="flex justify-end gap-1.5">
                    {/* Status Actions */}
                    <div className="flex items-center gap-1 mr-2 pr-2 border-r border-slate-100 dark:border-slate-800">
                        <button
                            onClick={(e) => handleStatusUpdate(e, item, 'ok')}
                            className={cn("p-1.5 rounded-lg transition-colors", item.status === 'ok' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40" : "text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600")}
                            title="Als OK markieren"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => handleStatusUpdate(e, item, 'error')}
                            className={cn("p-1.5 rounded-lg transition-colors", item.status === 'error' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40" : "text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600")}
                            title="Als Fehlerhaft markieren"
                        >
                            <AlertCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => handleStatusUpdate(e, item, 'clarification')}
                            className={cn("p-1.5 rounded-lg transition-colors", item.status === 'clarification' ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40" : "text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600")}
                            title="In Klärung setzen"
                        >
                            <HelpCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => handleStatusUpdate(e, item, 'open')}
                            className={cn("p-1.5 rounded-lg transition-colors", item.status === 'open' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40" : "text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600")}
                            title="Status zurücksetzen (Offen)"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={() => handleRowClick(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="Details öffnen"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => handleRemove(e, item)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Entfernen"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )
        }
    ];

    const now = new Date();
    const footerText = `Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <PageLayout
            header={{
                title: 'Arbeitsvorrat',
                subtitle: `${worklistItems?.length || 0} Einträge markiert`,
                onBack,
                actions: (
                    <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase rounded-full border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                        <Bookmark className="w-3 h-3 fill-current" />
                        {worklistItems?.length || 0} Einträge
                    </span>
                ),
            }}
            footer={footerText}
            breadcrumbs={[
                { label: 'Arbeitsvorrat' }
            ]}
        >
            <PageSection title="Datensätze" noPadding>
                <DataTable
                    data={worklistItems || []}
                    columns={columns}
                    emptyMessage="Dein Arbeitsvorrat ist aktuell leer. Markiere Datensätze in den Detail-Ansichten, um sie hier zu sammeln."
                    onRowClick={handleRowClick}
                />
            </PageSection>

            <RecordDetailModal
                isOpen={!!selectedDetailId}
                onClose={() => setSelectedDetailId(null)}
                items={resolvedRecords}
                initialIndex={resolvedRecords.findIndex(r => r.id === selectedDetailId)}
                title="Datensatz-Prüfung"
                infoLabel="Arbeitsvorrat"
                tableName="invoice_items"
            />

            {/* Global Loading Spinner for resolving details */}
            {loadingDetail && (
                <div className="fixed inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-[1px] z-[100] flex items-center justify-center">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="text-xs font-bold text-slate-500">Lade Objektdaten...</span>
                    </div>
                </div>
            )}
        </PageLayout>
    );
};
