-- Cherit Systems GmbH - IT Invoice Control starter queries
-- Load tables: invoices, invoice_items, vendors, cost_centers

-- 1) Monthly spend trend
SELECT
  strftime('%Y-%m', invoice_date) AS year_month,
  ROUND(SUM(gross_total), 2) AS total_spend
FROM invoices
GROUP BY 1
ORDER BY 1;

-- 2) Top vendors
SELECT
  v.vendor_name,
  ROUND(SUM(i.gross_total), 2) AS total_spend
FROM invoices i
JOIN vendors v ON v.vendor_id = i.vendor_id
GROUP BY v.vendor_name
ORDER BY total_spend DESC;

-- 3) Spend by service category
SELECT
  it.service_category,
  ROUND(SUM(it.amount_net), 2) AS amount_net
FROM invoice_items it
GROUP BY it.service_category
ORDER BY amount_net DESC;

-- 4) Open invoice volume
SELECT
  status,
  COUNT(*) AS invoice_count,
  ROUND(SUM(gross_total), 2) AS total_amount
FROM invoices
GROUP BY status
ORDER BY total_amount DESC;

-- 5) Cost center split
SELECT
  cc.cost_center_code,
  cc.owner_team,
  ROUND(SUM(it.amount_net), 2) AS amount_net
FROM invoice_items it
JOIN cost_centers cc ON cc.cost_center_id = it.cost_center_id
GROUP BY cc.cost_center_code, cc.owner_team
ORDER BY amount_net DESC;

-- 6) Month-over-month vendor delta
WITH vendor_month AS (
  SELECT
    v.vendor_name,
    strftime('%Y-%m', i.invoice_date) AS year_month,
    ROUND(SUM(i.gross_total), 2) AS month_total
  FROM invoices i
  JOIN vendors v ON v.vendor_id = i.vendor_id
  GROUP BY v.vendor_name, strftime('%Y-%m', i.invoice_date)
)
SELECT
  cur.vendor_name,
  cur.year_month,
  cur.month_total,
  prev.month_total AS prev_month_total,
  ROUND(cur.month_total - COALESCE(prev.month_total, 0), 2) AS delta_abs
FROM vendor_month cur
LEFT JOIN vendor_month prev
  ON prev.vendor_name = cur.vendor_name
  AND prev.year_month = strftime('%Y-%m', date(cur.year_month || '-01', '-1 month'))
ORDER BY ABS(delta_abs) DESC;
