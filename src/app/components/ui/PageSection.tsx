import React from 'react';
import { cn } from '../../../lib/utils';

interface PageSectionProps {
    /** Section heading, e.g. "Zusammenfassung" */
    title?: string;
    /** Optional trailing actions or badges in the header */
    actions?: React.ReactNode;
    /** Content */
    children: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Whether to remove default padding (useful for full-bleed tables) */
    noPadding?: boolean;
}

export const PageSection: React.FC<PageSectionProps> = ({
    title,
    actions,
    children,
    className,
    noPadding = false,
}) => {
    return (
        <section
            className={cn(
                'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden',
                className
            )}
        >
            {title && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/50">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={cn(!noPadding && 'p-6')}>
                {children}
            </div>
        </section>
    );
};
