import { runQuery } from '../db';
import type { Anomaly } from '../../types';

export const AnomalyRepository = {
    async getAnomalies(period?: string): Promise<Anomaly[]> {
        let sql = 'SELECT * FROM view_anomalies';
        const params: string[] = [];

        if (period) {
            sql += ' WHERE Period = ?';
            params.push(period);
        }

        sql += ' ORDER BY RiskScore DESC';

        return await runQuery(sql, params) as unknown as Anomaly[];
    },

    async getAnomalyDetail(documentId: string, period?: string): Promise<Anomaly | null> {
        let sql = `SELECT * FROM view_anomalies WHERE DocumentId = ?`;
        const params = [documentId];

        if (period) {
            sql += ` AND Period = ?`;
            params.push(period);
        }

        const results = await runQuery(sql, params) as unknown as Anomaly[];
        return results.length > 0 ? results[0] : null;
    },

    async getTopRisks(limit: number = 3): Promise<Anomaly[]> {
        return await runQuery(`SELECT * FROM view_anomalies ORDER BY RiskScore DESC, Period DESC LIMIT ?`, [limit]) as unknown as Anomaly[];
    }
};
