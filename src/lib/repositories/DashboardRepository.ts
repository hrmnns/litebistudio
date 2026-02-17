import { runQuery } from '../db';
import type { ItCostsSummary, KpiRecord } from '../../types';

export const DashboardRepository = {
    async getItCostsSummary(): Promise<ItCostsSummary | null> {
        const result = await runQuery("SELECT * FROM it_costs_summary");
        return result.length > 0 ? (result[0] as unknown as ItCostsSummary) : null;
    },

    async getItCostsTrend(limit: number = 4): Promise<KpiRecord[]> {
        return await runQuery(
            "SELECT * FROM kpi_history WHERE metric = 'IT Costs' AND period NOT LIKE '%-13' ORDER BY date DESC LIMIT ?",
            [limit]
        ) as unknown as KpiRecord[];
    },



    async getItCostsByCategory(limit: number = 3): Promise<{ category: string; amount: number }[]> {
        return await runQuery(
            "SELECT Category as category, SUM(Amount) as amount FROM invoice_items WHERE Category IS NOT NULL GROUP BY Category ORDER BY amount DESC LIMIT ?",
            [limit]
        ) as unknown as { category: string; amount: number }[];
    },

    async getKpiByYear(year: number): Promise<KpiRecord[]> {
        return await runQuery(`
            SELECT 
                'IT Costs' as metric,
                SUM(Amount) as value,
                'EUR' as unit,
                'Total' as category,
                MAX(PostingDate) as date,
                Period as period
            FROM invoice_items 
            WHERE FiscalYear = ? 
            GROUP BY Period
            ORDER BY Period ASC
        `, [year]) as unknown as KpiRecord[];
    },

    async getItCostsMetrics(): Promise<{ totalAmount: number; vendorCount: number; avgMonthlySpend: number; monthCount: number }> {
        const result = await runQuery(`
            SELECT 
                SUM(Amount) as totalAmount,
                COUNT(DISTINCT COALESCE(NULLIF(VendorId, ''), VendorName)) as vendorCount,
                COUNT(DISTINCT Period) as monthCount,
                SUM(Amount) / CAST(COUNT(DISTINCT Period) AS REAL) as avgMonthlySpend
            FROM invoice_items
        `);
        return result[0] as unknown as { totalAmount: number; vendorCount: number; avgMonthlySpend: number; monthCount: number };
    }
};
