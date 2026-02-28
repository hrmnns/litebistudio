import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';

import { SystemHealthModal } from './SystemHealthModal';

interface SystemStatusProps {
    isCollapsed?: boolean;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ isCollapsed }) => {
    const { t } = useTranslation();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsDetailsOpen(true)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${isCollapsed ? 'md:w-11 md:h-11 md:mx-auto md:justify-center md:px-0 md:py-0 md:gap-0' : ''}`}
                title={isCollapsed ? t('sidebar.system_status') : ''}
            >
                <Activity className="w-5 h-5 flex-shrink-0 text-blue-500" />
                <span className={`transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0 overflow-hidden' : 'opacity-100'}`}>
                    {t('sidebar.system_status')}
                </span>
            </button>

            <SystemHealthModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
            />
        </>
    );
};
