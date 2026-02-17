import React from 'react';
import { Database, Save, AlertCircle, Settings } from 'lucide-react';
import { DashboardComponent } from '../ui/DashboardComponent';
import { useBackupStatus } from '../../hooks/useBackupStatus';

interface DatabaseStatusComponentProps {
    onRemove?: () => void;
    dragHandleProps?: any;
    onClick?: () => void;
    targetView?: string;
    isOverlay?: boolean;
}

export const DatabaseStatusComponent: React.FC<DatabaseStatusComponentProps> = ({
    onRemove,
    dragHandleProps,
    onClick,
    targetView,
    isOverlay
}) => {
    const { lastBackup, changeCount, isBackupRecommended } = useBackupStatus();

    const formatDate = (date: Date | null) => {
        if (!date) return 'Nie';
        return date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.location.hash = '#/datasource';
    };

    return (
        <DashboardComponent
            title="Datenbank Status"
            icon={Database}
            iconColor={isBackupRecommended ? "amber" : "emerald"}
            onRemove={onRemove}
            dragHandleProps={dragHandleProps}
            onClick={onClick}
            targetView={targetView}
            backgroundIcon={Database}
            className={isOverlay ? "opacity-90" : ""}
            footerLeft={
                <button
                    onClick={handleNavigate}
                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors group/footer"
                >
                    Datenverwaltung
                    <Settings className="w-3 h-3 transition-transform group-hover/footer:rotate-90" />
                </button>
            }
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Last Backup */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                        <Save className="w-3 h-3" />
                        <span>Letztes Backup</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums leading-none">
                        {formatDate(lastBackup)}
                    </div>
                </div>

                {/* Secondary Metric: Modifications */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50 text-center">
                    <div className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-1 ${isBackupRecommended ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                        {isBackupRecommended ? <AlertCircle className="w-3 h-3" /> : <Database className="w-3 h-3" />}
                        <span>Änderungen</span>
                    </div>
                    <div className={`text-4xl font-black tabular-nums leading-none tracking-tighter ${isBackupRecommended ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                        }`}>
                        {changeCount}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                        Datensätze seit Backup
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
