import type { ComponentConfig } from '../types';

export const COMPONENTS: ComponentConfig[] = [
    {
        id: 'clock',
        title: 'Status & Uhrzeit',
        component: 'ClockComponent',
        defaultSize: 'small',
    },
    {
        id: 'data-inspector',
        title: 'Data Inspector',
        component: 'DataInspectorComponent',
        targetView: '/inspector',
        defaultSize: 'small',
    },
    {
        id: 'system-status',
        title: 'System Status',
        component: 'SystemStatusComponent',
        defaultSize: 'small',
    },
    {
        id: 'database-status',
        title: 'Datenbank Status',
        component: 'DatabaseStatusComponent',
        defaultSize: 'small'
    },
    {
        id: 'worklist',
        title: 'Arbeitsvorrat',
        component: 'WorklistComponent',
        targetView: '/worklist',
        defaultSize: 'medium'
    }
];
