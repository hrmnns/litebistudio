import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface RecordDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: any[];
    initialIndex?: number;
    title?: string;
    infoLabel?: string;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
    isOpen,
    onClose,
    items,
    initialIndex = 0,
    title = "Datensatz-Details",
    infoLabel = "Archiv-Daten"
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    // Sync index when items change or modal opens
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
        }
    }, [isOpen, initialIndex, items]);

    if (!items || items.length === 0) return null;

    const currentItem = items[currentIndex];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={items.length > 1
                ? `${title} (${currentIndex + 1} von ${items.length})`
                : title
            }
        >
            <div className="space-y-6">
                {/* Navigation Header for Multi-Record */}
                {items.length > 1 && (
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Datensatz-Navigation
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                disabled={currentIndex === 0}
                                onClick={() => setCurrentIndex(prev => prev - 1)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="text-xs font-black text-slate-700 dark:text-slate-200 min-w-[60px] text-center">
                                {currentIndex + 1} / {items.length}
                            </div>
                            <button
                                disabled={currentIndex === items.length - 1}
                                onClick={() => setCurrentIndex(prev => prev + 1)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-black uppercase block mb-1">🔍 {infoLabel}:</span>
                        {currentItem.Period && `Dieser Datensatz stammt aus der Periode ${currentItem.Period}. `}
                        {items.length > 1 ? (
                            <>
                                Dies ist einer von <strong>{items.length} Belegen</strong> in dieser Ansicht.
                                Nutze die Pfeile oben, um zwischen den Buchungen zu wechseln.
                            </>
                        ) : (
                            'Er wird hier im Originalzustand angezeigt, wie er in der Datenbank gespeichert ist.'
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {Object.entries(currentItem).map(([key, value]) => {
                        // Skip internal tracking fields if they exist and are boolean/utility
                        if (key.startsWith('is') || key === 'compositeKey' || key === 'status') return null;

                        return (
                            <div key={key} className="border-b border-slate-100 dark:border-slate-700 pb-2">
                                <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1">{key}</dt>
                                <dd className="text-sm font-medium text-slate-900 dark:text-white break-all">
                                    {value === null || value === undefined || value === '' ? (
                                        <span className="text-slate-300 italic">&lt;leer&gt;</span>
                                    ) : (
                                        String(value)
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};
