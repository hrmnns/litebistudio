import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type RightOverlayPanelWidth = 'sm' | 'md' | 'lg' | number | string;

interface RightOverlayPanelProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    width?: RightOverlayPanelWidth;
    noScroll?: boolean;
}

const widthClassByPreset: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'w-[min(100vw,26rem)]',
    md: 'w-[min(100vw,34rem)]',
    lg: 'w-[min(100vw,42rem)]'
};

const resolveWidthStyle = (width: RightOverlayPanelWidth | undefined): React.CSSProperties | undefined => {
    if (typeof width === 'number') return { width: `${width}px` };
    if (typeof width === 'string' && !widthClassByPreset[width as 'sm' | 'md' | 'lg']) return { width };
    return undefined;
};

const resolveWidthClass = (width: RightOverlayPanelWidth | undefined): string => {
    if (!width) return widthClassByPreset.md;
    if (typeof width !== 'string') return 'w-full max-w-full';
    return widthClassByPreset[width as 'sm' | 'md' | 'lg'] ?? 'w-full max-w-full';
};

export const RightOverlayPanel: React.FC<RightOverlayPanelProps> = ({
    isOpen,
    onClose,
    title,
    children,
    width = 'md',
    noScroll
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleEsc);
        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[90] flex justify-end">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <aside
                role="dialog"
                aria-modal="true"
                className={cn(
                    'relative h-full max-h-screen bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700',
                    'animate-in slide-in-from-right-16 duration-200',
                    resolveWidthClass(width)
                )}
                style={resolveWidthStyle(width)}
            >
                <div className="h-full min-h-0 flex flex-col">
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{title}</h3>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            aria-label="Close panel"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className={cn('flex-1 min-h-0 p-5', !noScroll && 'overflow-auto')}>
                        {children}
                    </div>
                </div>
            </aside>
        </div>,
        document.body
    );
};
