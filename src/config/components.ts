import type { ComponentConfig } from '../types';

export const COMPONENTS: ComponentConfig[] = [
    {
        id: 'it-costs',
        title: 'IT Kosten',
        component: 'ItCostsComponent',
        targetView: '/costs',
        defaultSize: 'small',
    },
    {
        id: 'systems',
        title: 'Systeme',
        component: 'SystemsComponent',
        targetView: '/systems',
        defaultSize: 'small',
    },
    {
        id: 'clock',
        title: 'Status & Uhrzeit',
        component: 'ClockComponent',
        defaultSize: 'small',
    },
    {
        id: 'data-inspector',
        title: 'Daten-Inspektor',
        component: 'DataInspectorComponent',
        targetView: '/inspector',
        defaultSize: 'small',
    },
    {
        id: 'anomaly-radar',
        title: 'Anomalie Radar',
        component: 'AnomalyRadarComponent',
        targetView: '/anomalies',
        defaultSize: 'small',
    },
    {
        id: 'system-status',
        title: 'System Status',
        component: 'SystemStatusComponent',
        defaultSize: 'small',
    },
    {
        id: 'worklist',
        title: 'Arbeitsvorrat',
        component: 'WorklistComponent',
        targetView: '/worklist',
        defaultSize: 'small',
    },
    {
        id: 'database-status',
        title: 'Datenbank Status',
        component: 'DatabaseStatusComponent',
        defaultSize: 'small'
    }
];
