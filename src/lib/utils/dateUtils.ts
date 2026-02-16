/**
 * Calculates the previous period based on the current period string (YYYY-MM).
 * @param currentPeriod - The current period in "YYYY-MM" format.
 * @returns The previous period in "YYYY-MM" format.
 */
export const getPreviousPeriod = (currentPeriod: string): string => {
    const [year, month] = currentPeriod.split('-').map(Number);
    // Create date for 1st of current month
    const date = new Date(year, month - 1, 1);
    // Subtract 1 month
    date.setMonth(date.getMonth() - 1);
    const prevYear = date.getFullYear();
    const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${prevYear}-${prevMonth}`;
};
