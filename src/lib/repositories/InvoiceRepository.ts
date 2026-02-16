import { runQuery } from '../db';
import type { InvoiceItem, ItCostsTrend } from '../../types';

export const InvoiceRepository = {
    /**
     * Get all invoices for a specific period
     */
    async getMonthlyOverview(period: string): Promise<InvoiceItem[]> {
        const sql = `SELECT * FROM invoice_items WHERE Period = ? ORDER BY DocumentId, LineId`;
        return await runQuery(sql, [period]) as unknown as InvoiceItem[];
    },

    /**
     * Get all line items for a specific invoice
     */
    async getItemsByInvoice(period: string, documentId: string): Promise<InvoiceItem[]> {
        const sql = `SELECT * FROM invoice_items WHERE Period = ? AND DocumentId = ? ORDER BY LineId`;
        return await runQuery(sql, [period, documentId]) as unknown as InvoiceItem[];
    },

    async getByIdOrDocumentId(idOrDocId: string | number): Promise<InvoiceItem[]> {
        if (typeof idOrDocId === 'string' && isNaN(Number(idOrDocId))) {
            return await runQuery('SELECT * FROM invoice_items WHERE DocumentId = ?', [idOrDocId]) as unknown as InvoiceItem[];
        } else {
            return await runQuery('SELECT * FROM invoice_items WHERE id = ?', [idOrDocId]) as unknown as InvoiceItem[];
        }
    },

    /**
     * Get history for a specific item based on key fields
     */
    async getItemHistory(referenceItem: InvoiceItem, keyFields: string[]): Promise<InvoiceItem[]> {
        const conditions: string[] = [];
        const params: (string | number | null)[] = [];

        keyFields.forEach((field: string) => {
            const value = referenceItem[field];
            if (value !== undefined && value !== null) {
                conditions.push(`${field} = ?`);
                params.push(value as string | number);
            } else {
                conditions.push(`${field} IS NULL`);
            }
        });

        const sql = `SELECT * FROM invoice_items WHERE ${conditions.join(' AND ')} ORDER BY Period ASC, PostingDate ASC`;
        return await runQuery(sql, params) as unknown as InvoiceItem[];
    },

    /**
     * Get yearly trend data from it_costs_summary view
     */
    async getYearlyTrend(): Promise<ItCostsTrend[]> {
        const sql = `
            SELECT 
                Period, 
                SUM(Amount) as total,
                MAX(FiscalYear) as year,
                MAX(PostingDate) as date,
                COUNT(DISTINCT DocumentId) as invoice_count,
                COUNT(*) as item_count,
                SUM(CASE WHEN DocumentId LIKE 'GEN-%' THEN 1 ELSE 0 END) as synthetic_invoices
            FROM invoice_items 
            GROUP BY Period
            ORDER BY Period DESC
        `;
        return await runQuery(sql) as unknown as ItCostsTrend[];
    },

    async getVendorItemHistory(vendorName: string, description: string): Promise<any[]> {
        const sql = `
            SELECT 
                Period,
                SUM(Amount) as Amount, 
                COUNT(*) as RecordCount,
                MAX(id) as id,
                MAX(DocumentId) as DocumentId,
                MAX(LineId) as LineId,
                MAX(VendorName) as VendorName,
                MAX(Description) as Description,
                MAX(CostCenter) as CostCenter,
                MAX(GLAccount) as GLAccount
            FROM invoice_items 
            WHERE VendorName = ? AND Description = ? 
            GROUP BY Period
            ORDER BY Period ASC
        `;
        return await runQuery(sql, [vendorName, description]);
    },

    async getItemsByVendorAndDescription(vendorName: string, description: string, period: string): Promise<InvoiceItem[]> {
        const sql = `
            SELECT * FROM invoice_items 
            WHERE VendorName = ? AND Description = ? AND Period = ?
            ORDER BY id ASC
        `;
        return await runQuery(sql, [vendorName, description, period]) as unknown as InvoiceItem[];
    }
};
