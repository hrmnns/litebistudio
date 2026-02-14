DROP VIEW IF EXISTS latest_kpis;
CREATE VIEW latest_kpis AS
WITH aggregated_invoice_costs AS (
    SELECT 
        'IT Costs' as metric, 
        SUM(Amount) as value, 
        'EUR' as unit, 
        'Actuals' as category, 
        MAX(PostingDate) as date
    FROM invoice_items
    GROUP BY Period
),
combined_kpis AS (
    SELECT metric, value, unit, category, date FROM kpi_data
    UNION ALL
    SELECT metric, value, unit, category, date FROM aggregated_invoice_costs
)
SELECT metric, value, unit, category, date
FROM combined_kpis
GROUP BY metric
ORDER BY date DESC;

-- Detailed summary for the IT Costs tile
DROP VIEW IF EXISTS it_costs_summary;
CREATE VIEW it_costs_summary AS
SELECT 
    SUM(Amount) as total_amount,
    COUNT(DISTINCT VendorId) as active_vendors,
    MAX(PostingDate) as latest_date,
    MAX(FiscalYear) as latest_year,
    'EUR' as unit
FROM invoice_items;
