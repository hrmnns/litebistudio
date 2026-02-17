import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { ChevronLeft, ChevronRight, Info, Bookmark, Target } from 'lucide-react';
import { WorklistRepository } from '../../lib/repositories/WorklistRepository';

interface RecordDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: any[];
    initialIndex?: number;
    title?: string;
    infoLabel?: string;
    tableName?: string;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
    isOpen,
    onClose,
    items,
    initialIndex = 0,
    title = "Datensatz-Details",
    infoLabel = "Archiv-Daten",
    tableName
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [previousIndex, setPreviousIndex] = useState<number | null>(null);
    const [referenceIndex, setReferenceIndex] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [isInWorklist, setIsInWorklist] = useState(false);

    // Get table name context (default to invoice_items if not provided)
    const activeTable = tableName || 'invoice_items';

    // Sync index when items change or modal opens
    useEffect(() => {
        if (isOpen && items && items.length > 0) {
            // Always sync provided index when modal opens or items/index change
            const val = Math.max(0, initialIndex);
            setCurrentIndex(val);
            setReferenceIndex(val); // Auto-set initial item as reference logic
            setPreviousIndex(null);
            setHelpOpen(false);
        }
    }, [isOpen, initialIndex, items]);

    // Check if current item is in worklist
    useEffect(() => {
        const checkStatus = async () => {
            const currentItem = items[currentIndex];
            if (currentItem?.id) {
                const status = await WorklistRepository.isInWorklist(activeTable, currentItem.id);
                setIsInWorklist(status);
            }
        };
        if (isOpen) {
            checkStatus();
        }
    }, [isOpen, currentIndex, items, activeTable]);

    const handleToggleWorklist = async () => {
        const currentItem = items[currentIndex];
        if (!currentItem?.id) return;

        // Label: Use Description or fallback to ID
        const label = currentItem.Description || currentItem.VendorName || `Eintrag #${currentItem.id}`;
        // Context: Use Period or Table
        const context = currentItem.Period || activeTable;

        await WorklistRepository.toggle(activeTable, currentItem.id, label, context);
        setIsInWorklist(!isInWorklist);

        // Trigger global sync for counters etc.
        window.dispatchEvent(new Event('db-updated'));
    };

    const handleToggleReference = () => {
        if (referenceIndex === currentIndex) {
            setReferenceIndex(null); // Toggle off if clicking active reference
        } else {
            setReferenceIndex(currentIndex); // Set current as reference
        }
    };

    const handleNavigate = (newIndex: number) => {
        setPreviousIndex(currentIndex);
        setCurrentIndex(newIndex);
    };

    if (!items || items.length === 0) return null;

    const currentItem = items[currentIndex];

    // Comparison Logic: Reference > Previous Visited
    const comparisonItem = referenceIndex !== null
        ? items[referenceIndex]
        : (previousIndex !== null && previousIndex >= 0 && previousIndex < items.length) ? items[previousIndex] : null;

    const isReferenceActive = referenceIndex !== null;
    const isCurrentReference = referenceIndex === currentIndex;

    if (!currentItem) return null;

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={items.length > 1
                    ? `${title} (${currentIndex + 1} von ${items.length})`
                    : title
                }
            >
                <div className="space-y-6">
                    {/* Toolbar / Menu Bar */}
                    <div className="-mx-6 -mt-6 mb-6 px-6 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setHelpOpen(true)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-500"
                                title="Hilfe anzeigen"
                            >
                                <Info className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleToggleWorklist}
                                className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${isInWorklist
                                    ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                                    }`}
                                title={isInWorklist ? "Vom Arbeitsvorrat entfernen" : "Zum Arbeitsvorrat hinzufügen"}
                            >
                                <Bookmark className={`w-4 h-4 ${isInWorklist ? 'fill-current' : ''}`} />
                            </button>

                            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />

                            <button
                                onClick={handleToggleReference}
                                className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1.5 group relative ${isReferenceActive
                                    ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                                    }`}
                                title={isCurrentReference ? "Referenz-Modus beenden" : "Als Referenz für Vergleich setzen"}
                            >
                                <Target className={`w-4 h-4 ${isReferenceActive ? 'fill-current' : ''}`} />
                                {isReferenceActive && !isCurrentReference && (
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                    </span>
                                )}
                            </button>

                            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                                Navigieren
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                disabled={currentIndex === 0}
                                onClick={() => handleNavigate(currentIndex - 1)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 min-w-[60px] text-center bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-800 shadow-sm">
                                {currentIndex + 1} / {items.length}
                            </div>
                            <button
                                disabled={currentIndex === items.length - 1}
                                onClick={() => handleNavigate(currentIndex + 1)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {isReferenceActive && !isCurrentReference && (
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg px-3 py-2 text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-2 mb-4">
                            <Target className="w-3.5 h-3.5" />
                            <span className="font-bold">Vergleich aktiv:</span>
                            <span>
                                Unterschiede werden relativ zu <span className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">#{items[referenceIndex].id || referenceIndex + 1}</span> angezeigt.
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        {Object.entries(currentItem).map(([key, value]) => {
                            // Skip internal tracking fields if they exist and are boolean/utility
                            if (key.startsWith('is') || key === 'compositeKey' || key === 'status') return null;

                            const isChanged = comparisonItem && String(value) !== String(comparisonItem[key]);

                            return (
                                <div
                                    key={key}
                                    className={`
                                        border-b border-slate-100 dark:border-slate-700 pb-2 transition-colors duration-500
                                        ${isChanged ? 'bg-amber-50 dark:bg-amber-900/20 -mx-2 px-2 rounded-lg border-amber-200 dark:border-amber-800' : ''}
                                    `}
                                >
                                    <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1 flex items-center justify-between">
                                        {key}
                                        {isChanged && (
                                            <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 rounded-full">
                                                DIFF
                                            </span>
                                        )}
                                    </dt>
                                    <dd className={`text-sm font-medium break-all ${isChanged ? 'text-amber-900 dark:text-amber-100' : 'text-slate-900 dark:text-white'}`}>
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

            {/* Nested Help Modal */}
            <Modal
                isOpen={helpOpen}
                onClose={() => setHelpOpen(false)}
                title="Hilfe & Informationen"
            >
                <div className="space-y-4 py-2">
                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-3">
                        <Info className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="space-y-2">
                            <p className="font-bold uppercase tracking-tight">🔍 {infoLabel}</p>
                            <p>
                                {currentItem.Period
                                    ? `Dieser Datensatz stammt aus der Periode ${currentItem.Period}. `
                                    : 'Dieser Datensatz wird in seinem Originalzustand aus der Datenbank angezeigt.'
                                }
                            </p>
                            <div className="pt-2 border-t border-blue-200 dark:border-blue-800/50 space-y-2">
                                <p className="font-medium italic">
                                    ✨ <span className="underline decoration-amber-400 underline-offset-2">Diff-Funktion:</span> Unterschiede werden standardmässig zum <strong>zuletzt besuchten Datensatz</strong> angezeigt.
                                </p>
                                <p className="font-medium italic">
                                    🎯 <span className="underline decoration-blue-400 underline-offset-2">Referenz-Modus:</span> Klicke auf das Zielscheiben-Symbol, um den aktuellen Datensatz als <strong>feste Vergleichsbasis</strong> zu fixieren.
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setHelpOpen(false)}
                        className="w-full py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-xs transition-opacity hover:opacity-90"
                    >
                        Verstanden
                    </button>
                </div>
            </Modal>
        </>
    );
};
