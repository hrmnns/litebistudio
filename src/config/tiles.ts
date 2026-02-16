import type { TileConfig } from '../types';

export const TILES: TileConfig[] = [
    {
        id: 'it-costs',
        title: 'IT Kosten',
        component: 'ItCostsTile',
        targetView: '/costs',
        defaultSize: 'small',
    },
    {
        id: 'systems',
        title: 'Systems Availability',
        component: 'SystemsTile',
        targetView: '/systems',
        defaultSize: 'small',
    },
    {
        id: 'it-forecast',
        title: 'Budget Forecast',
        component: 'ItForecastTile',
        defaultSize: 'medium',
    },
    {
        id: 'clock',
        title: 'Status & Time',
        component: 'ClockTile',
        defaultSize: 'small',
    },
    {
        id: 'data-inspector',
        title: 'Data Inspector',
        component: 'DataInspectorTile',
        targetView: '/inspector',
        defaultSize: 'small',
    },
    {
        id: 'anomaly-radar',
        title: 'Anomaly Radar',
        component: 'AnomalyRadarTile',
        targetView: '/anomalies',
        defaultSize: 'small',
    },
    {
        id: 'system-status',
        title: 'System Status',
        component: 'SystemStatusTile',
        defaultSize: 'small',
    },
    {
        id: 'worklist',
        title: 'Arbeitsvorrat',
        component: 'WorklistTile',
        targetView: '/worklist',
        defaultSize: 'small',
    },
];
