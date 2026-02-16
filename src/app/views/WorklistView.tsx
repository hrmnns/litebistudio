import React, { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
// import { useQuery } from '../../hooks/useQuery'; // Keep for now if needed, or remove if fully replaced
import { WorklistRepository } from '../../lib/repositories/WorklistRepository';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ViewHeader } from '../components/ui/ViewHeader';
import { RecordDetailModal } from '../components/RecordDetailModal';
import { Bookmark, ExternalLink, Trash2, Calendar, Tag } from 'lucide-react';
import type { WorklistEntry, InvoiceItem } from '../../types';
import { InvoiceRepository } from '../../lib/repositories/InvoiceRepository';

interface WorklistViewProps {
    onBack: () => void;
}

export const WorklistView: React.FC<WorklistViewProps> = ({ onBack }) => {
    const [selectedDetail, setSelectedDetail] = useState<{ table: string, id: number } | null>(null);
    const [detailRecords, setDetailRecords] = useState<InvoiceItem[]>([]);
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

    const handleRowClick = async (item: WorklistEntry) => {
        setLoadingDetail(true);
        try {
            // Fetch details using Repository
            // Currently mostly supports 'invoice_items'
            let records: InvoiceItem[] = [];

            if (item.source_table === 'invoice_items') {
                records = await InvoiceRepository.getByIdOrDocumentId(item.source_id);
            } else {
                console.warn(`Detail view not implemented for table: ${item.source_table}`);
                // Fallback or generic fetch could go here if needed, but for now we enforce repo usage.
            }

            setDetailRecords(records);
            setSelectedDetail({ table: item.source_table, id: item.source_id });
        } catch (err) {
            console.error('Failed to fetch detail', err);
            alert('Fehler beim Laden der Details.');
        } finally {
            setLoadingDetail(false);
        }
    };

    const columns: Column<WorklistEntry>[] = [
        {
            header: 'Datum hinzugefügt',
            accessor: 'added_at',
            render: (item: WorklistEntry) => (
                <div className="flex items-center gap-2 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{new Date(item.added_at).toLocaleString()}</span>
                </div>
            )
        },
        {
            header: 'Quelle',
            accessor: 'source_table',
            render: (item: WorklistEntry) => (
                <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 w-fit">
                    <Tag className="w-3 h-3" />
                    {item.source_table}
                </div>
            )
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
                    <span className="text-[10px] text-slate-400 font-medium">
                        ID: {item.source_id}
                    </span>
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
                <div className="flex justify-end gap-2">
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

    return (
        <div className="p-6 md:p-8 h-full flex flex-col space-y-6">
            <ViewHeader
                title="Arbeitsvorrat"
                subtitle="Markierte Datensätze zur späteren Bearbeitung"
                onBack={onBack}
                badges={
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase rounded-full border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                            <Bookmark className="w-3 h-3 fill-current" />
                            {worklistItems?.length || 0} Einträge
                        </span>
                    </div>
                }
            />

            <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-0">
                <DataTable
                    data={worklistItems || []}
                    columns={columns}
                    emptyMessage="Dein Arbeitsvorrat ist aktuell leer. Markiere Datensätze in den Detail-Ansichten, um sie hier zu sammeln."
                    onRowClick={handleRowClick}
                />
            </div>

            {/* Status Footer */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-[10px] flex justify-between items-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 font-medium">
                        <Bookmark className="w-3 h-3" />
                        Persistente Liste
                    </div>
                </div>
            </div>

            <RecordDetailModal
                isOpen={!!selectedDetail}
                onClose={() => setSelectedDetail(null)}
                items={detailRecords}
                title="Datensatz-Prüfung"
                infoLabel="Arbeitsvorrat"
                tableName={selectedDetail?.table}
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
        </div>
    );
};
