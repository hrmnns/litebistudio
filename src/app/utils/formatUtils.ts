export const isCurrencyColumn = (col: string) => {
    const lower = col.toLowerCase();
    return lower.includes('price') || lower.includes('amount') || lower.includes('preis') || lower.includes('betrag') || lower.includes('summe') || lower.includes('kosten') || lower.includes('total');
};

export const formatValue = (val: unknown, col?: string): string | unknown => {
    if (typeof val !== 'number') return val;
    if (col && isCurrencyColumn(col)) {
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
    }
    return new Intl.NumberFormat('de-DE').format(val);
};
