export const isCurrencyColumn = (col: string) => {
    const lower = col.toLowerCase();
    return lower.includes('price') || lower.includes('amount') || lower.includes('preis') || lower.includes('betrag') || lower.includes('summe') || lower.includes('kosten') || lower.includes('total');
};

export const formatValue = (val: unknown, col?: string): string => {
    if (typeof val !== 'number') {
        if (typeof val === 'string') return val;
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            try {
                return JSON.stringify(val);
            } catch {
                return String(val);
            }
        }
        return String(val);
    }
    if (col && isCurrencyColumn(col)) {
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
    }
    return new Intl.NumberFormat('de-DE').format(val);
};
