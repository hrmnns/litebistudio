import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Save, AlertCircle, Settings } from 'lucide-react';
import { DashboardComponent, type DashboardTileProps } from '../ui/DashboardComponent';
import { useBackupStatus } from '../../../hooks/useBackupStatus';

interface DatabaseStatusComponentProps extends DashboardTileProps {
    isOverlay?: boolean;
}

export const DatabaseStatusComponent: React.FC<DatabaseStatusComponentProps> = ({
    onRemove,
    dragHandleProps,
    onClick,
    targetView,
    isOverlay
}) => {
    const { t, i18n } = useTranslation();
    const { lastBackup, changeCount, isBackupRecommended } = useBackupStatus();

    const formatDate = (date: Date | null) => {
        if (!date) return t('widgets.database_status.never');
        return date.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
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
            title={t('widgets.database_status.title')}
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
                    {t('widgets.database_status.data_management')}
                    <Settings className="w-3 h-3 transition-transform group-hover/footer:rotate-90" />
                </button>
            }
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Last Backup */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                        <Save className="w-3 h-3" />
                        <span>{t('widgets.database_status.last_backup')}</span>
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
                        <span>{t('widgets.database_status.modifications')}</span>
                    </div>
                    <div className={`text-4xl font-black tabular-nums leading-none tracking-tighter ${isBackupRecommended ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                        }`}>
                        {changeCount}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                        {t('widgets.database_status.records_since_backup')}
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
