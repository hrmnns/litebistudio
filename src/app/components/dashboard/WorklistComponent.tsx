import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { SystemRepository } from '../../../lib/repositories/SystemRepository';
import { DashboardComponent, type DashboardTileProps } from '../ui/DashboardComponent';
import type { DbRow } from '../../../types';
import { createLogger } from '../../../lib/logger';
import { useNavigate } from 'react-router-dom';

const logger = createLogger('WorklistComponent');

interface WorklistStatusComponentProps extends DashboardTileProps {
    isOverlay?: boolean;
}

export const WorklistComponent: React.FC<WorklistStatusComponentProps> = ({
    onRemove,
    dragHandleProps,
    onClick,
    targetView,
    isOverlay
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ total: 0, pending: 0 });
    const [loading, setLoading] = useState(true);

    const loadStats = async () => {
        try {
            const list = await SystemRepository.getWorklist();
            const total = list.length;
            const pending = list.filter((item: DbRow) => item.status === 'pending' || !item.status).length;
            setStats({ total, pending });
        } catch (e) {
            logger.error('Failed to load worklist stats', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
        window.addEventListener('db-updated', loadStats);
        window.addEventListener('db-changed', loadStats);
        return () => {
            window.removeEventListener('db-updated', loadStats);
            window.removeEventListener('db-changed', loadStats);
        };
    }, []);

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate('/worklist');
    };

    return (
        <DashboardComponent
            title={t('widgets.worklist.title')}
            icon={ClipboardList}
            iconColor={stats.pending > 0 ? "amber" : "emerald"}
            onRemove={onRemove}
            dragHandleProps={dragHandleProps}
            onClick={onClick}
            targetView={targetView}
            backgroundIcon={ClipboardList}
            className={isOverlay ? "opacity-90" : ""}
            footerLeft={
                <button
                    onClick={handleNavigate}
                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors group/footer"
                >
                    {t('widgets.worklist.open_list')}
                    <ArrowRight className="w-3 h-3 transition-transform group-hover/footer:translate-x-1" />
                </button>
            }
        >
            <div className="flex flex-col h-full items-center justify-around py-2">
                {/* Primary Metric: Pending Items */}
                <div className="text-center">
                    <div className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-1 ${stats.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {stats.pending > 0 ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        <span>{stats.pending > 0 ? t('widgets.worklist.open_tasks') : t('widgets.worklist.all_done')}</span>
                    </div>
                    <div className={`text-4xl font-black tracking-tighter tabular-nums leading-none ${stats.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                        {loading ? '---' : stats.pending}
                    </div>
                </div>

                {/* Secondary Metric: Total Items */}
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800/50 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                        <ClipboardList className="w-3 h-3" />
                        <span>{t('widgets.worklist.total_entries')}</span>
                    </div>
                    <div className="text-xl font-black text-slate-700 dark:text-slate-300 tabular-nums leading-none">
                        {loading ? '---' : stats.total}
                    </div>
                </div>
            </div>
        </DashboardComponent>
    );
};
