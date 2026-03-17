import type { DbRow, WidgetConfig } from '../../types';

export const isNumericLikeValue = (value: unknown): boolean => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') {
        const normalized = value.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
        if (!normalized) return false;
        return Number.isFinite(Number(normalized));
    }
    return false;
};

export const parseNumericLikeValue = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const normalized = value.replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
        if (!normalized) return Number.NaN;
        return Number(normalized);
    }
    return Number.NaN;
};

export const buildScatterData = (rows: DbRow[], xKey: string, yKey: string): DbRow[] => {
    if (!xKey || !yKey) return [];
    return rows
        .map((row) => {
            const x = Number(row[xKey]);
            const y = Number(row[yKey]);
            return { ...row, [xKey]: x, [yKey]: y };
        })
        .filter((row) => Number.isFinite(row[xKey] as number) && Number.isFinite(row[yKey] as number));
};

export const resolveComposedSeriesAsLine = (
    config: Pick<WidgetConfig, 'lineSeries' | 'barSeries'>,
    seriesKey: string,
    idx: number
): boolean => {
    if (Array.isArray(config.lineSeries) && config.lineSeries.length > 0) {
        return config.lineSeries.includes(seriesKey);
    }
    if (Array.isArray(config.barSeries) && config.barSeries.length > 0) {
        return !config.barSeries.includes(seriesKey);
    }
    return idx > 0;
};
