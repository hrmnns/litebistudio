import React from 'react';
import { Check, Pin, Search } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from './Button';

export interface SelectionListMetaItem {
    label: string;
    value: string;
}

export interface SelectionListItem {
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    meta?: SelectionListMetaItem[];
}

interface SelectionListDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder: string;
    items: SelectionListItem[];
    selectedId: string;
    onSelect: (id: string) => void;
    emptyLabel: string;
    onApply: () => void;
    applyDisabled?: boolean;
    cancelLabel: string;
    applyLabel: string;
    sortValue?: string;
    onSortChange?: (value: string) => void;
    sortOptions?: Array<{ value: string; label: string }>;
    showPinnedOnlyToggle?: boolean;
    pinnedOnly?: boolean;
    onPinnedOnlyToggle?: (value: boolean) => void;
    isItemPinned?: (id: string) => boolean;
    onToggleItemPin?: (id: string) => void;
    sortLabel?: string;
    pinnedOnlyLabel?: string;
}

export const SelectionListDialog: React.FC<SelectionListDialogProps> = ({
    isOpen,
    onClose,
    title,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    items,
    selectedId,
    onSelect,
    emptyLabel,
    onApply,
    applyDisabled,
    cancelLabel,
    applyLabel,
    sortValue,
    onSortChange,
    sortOptions,
    showPinnedOnlyToggle,
    pinnedOnly,
    onPinnedOnlyToggle,
    isItemPinned,
    onToggleItemPin,
    sortLabel,
    pinnedOnlyLabel
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} noScroll>
            <div
                className="flex min-h-0 flex-1 flex-col"
                style={{ height: '32rem', maxHeight: 'calc(90vh - 11rem)' }}
            >
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="ui-toolbar flex items-center justify-between gap-2">
                        <div className="relative w-full min-w-0 max-w-xs md:max-w-sm">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input
                                value={searchValue}
                                onChange={(e) => onSearchChange(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full pl-7 pr-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {sortOptions && sortOptions.length > 0 && onSortChange && (
                                <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                    <span>{sortLabel || 'Sort'}</span>
                                    <select
                                        value={sortValue}
                                        onChange={(e) => onSortChange(e.target.value)}
                                        className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {sortOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {showPinnedOnlyToggle && onPinnedOnlyToggle && (
                                <Button
                                    size="sm"
                                    variant="toggle"
                                    active={Boolean(pinnedOnly)}
                                    onClick={() => onPinnedOnlyToggle(!pinnedOnly)}
                                >
                                    <Pin className="w-3 h-3" />
                                    {pinnedOnlyLabel || 'Pinned only'}
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 px-4 pt-3 pb-0">
                    <div className="ui-panel min-h-0 h-full overflow-auto p-2 space-y-1">
                    {items.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 text-center">
                            {emptyLabel}
                        </div>
                    ) : (
                            items.map((item) => (
                                <div
                                    key={item.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onSelect(item.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            onSelect(item.id);
                                        }
                                    }}
                                    className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                        selectedId === item.id
                                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-700'
                                    }`}
                                >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.title}</div>
                                        <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                            {(item.subtitle || '').trim() || '-'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {onToggleItemPin && (
                                            <Button
                                                size="icon"
                                                variant="toggle"
                                                active={Boolean(isItemPinned?.(item.id))}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleItemPin(item.id);
                                                }}
                                                title="Pin"
                                                className="h-5 w-5 rounded-full"
                                            >
                                                <Pin className="w-3 h-3" />
                                            </Button>
                                        )}
                                        {selectedId === item.id && (
                                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white">
                                                <Check className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {item.description && (
                                    <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                        {item.description}
                                    </div>
                                )}
                                {item.meta && item.meta.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                                        {item.meta.map((entry) => (
                                            <span key={`${item.id}-${entry.label}`} className="inline-flex items-center gap-1">
                                                <span className="font-semibold uppercase tracking-wide">{entry.label}:</span>
                                                <code className="font-mono text-[10px]" title={entry.value}>{entry.value}</code>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                </div>
                        ))
                    )}
                </div>
                </div>
                <div className="mt-2 px-5 py-4 ui-surface-footer flex items-center justify-end gap-3">
                    <Button variant="secondary" size="md" onClick={onClose} className="rounded-xl">
                        {cancelLabel}
                    </Button>
                    <Button variant="primary" size="md" onClick={onApply} disabled={applyDisabled} className="rounded-xl">
                        {applyLabel}
                    </Button>
                </div>
            </div>
            </div>
        </Modal>
    );
};
