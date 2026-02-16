import { runQuery } from '../db';
import type { ItCostsSummary, KpiRecord, DbRow } from '../../types';

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

    async getRecentOperations(limit: number = 5): Promise<DbRow[]> {
        return await runQuery("SELECT * FROM operations_events ORDER BY timestamp DESC LIMIT ?", [limit]);
    }
};
