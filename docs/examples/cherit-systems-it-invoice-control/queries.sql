-- Cherit Systems GmbH - IT Invoice Control starter queries
-- Load tables: invoices, invoice_items, vendors, cost_centers

-- Q01) Monthly spend trend
SELECT
  strftime('%Y-%m', invoice_date) AS year_month,
  ROUND(SUM(gross_total), 2) AS total_spend
FROM invoices
GROUP BY 1
ORDER BY 1;

-- Q02) Top vendors
SELECT
  v.vendor_name,
  ROUND(SUM(i.gross_total), 2) AS total_spend
FROM invoices i
JOIN vendors v ON v.vendor_id = i.vendor_id
GROUP BY v.vendor_name
ORDER BY total_spend DESC;

-- Q03) Spend by service category
SELECT
  it.service_category,
  ROUND(SUM(it.amount_net), 2) AS amount_net
FROM invoice_items it
GROUP BY it.service_category
ORDER BY amount_net DESC;

-- Q04) Open invoice volume
SELECT
  status,
  COUNT(*) AS invoice_count,
  ROUND(SUM(gross_total), 2) AS total_amount
FROM invoices
GROUP BY status
ORDER BY total_amount DESC;

-- Q05) Cost center split
SELECT
  cc.cost_center_code,
  cc.owner_team,
  ROUND(SUM(it.amount_net), 2) AS amount_net
FROM invoice_items it
JOIN cost_centers cc ON cc.cost_center_id = it.cost_center_id
GROUP BY cc.cost_center_code, cc.owner_team
ORDER BY amount_net DESC;

-- Q06) Month-over-month vendor delta
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

-- Q07) Budget vs actual by month and cost center
-- Requires table: budget_monthly(year_month, cost_center_id, budget_amount, ...)
WITH actuals AS (
  SELECT
    strftime('%Y-%m', i.invoice_date) AS year_month,
    it.cost_center_id,
    ROUND(SUM(it.amount_net), 2) AS actual_amount
  FROM invoice_items it
  JOIN invoices i ON i.invoice_id = it.invoice_id
  GROUP BY strftime('%Y-%m', i.invoice_date), it.cost_center_id
)
SELECT
  b.year_month,
  cc.cost_center_code,
  b.budget_amount,
  COALESCE(a.actual_amount, 0) AS actual_amount,
  ROUND(COALESCE(a.actual_amount, 0) - b.budget_amount, 2) AS variance_abs,
  ROUND(
    CASE
      WHEN b.budget_amount = 0 THEN NULL
      ELSE ((COALESCE(a.actual_amount, 0) - b.budget_amount) / b.budget_amount) * 100
    END
  , 2) AS variance_pct
FROM budget_monthly b
LEFT JOIN actuals a
  ON a.year_month = b.year_month
  AND a.cost_center_id = b.cost_center_id
LEFT JOIN cost_centers cc ON cc.cost_center_id = b.cost_center_id
ORDER BY b.year_month, cc.cost_center_code;

-- Q08) Top budget overruns
WITH variance AS (
  SELECT
    b.year_month,
    cc.cost_center_code,
    b.budget_amount,
    COALESCE(SUM(it.amount_net), 0) AS actual_amount
  FROM budget_monthly b
  LEFT JOIN cost_centers cc ON cc.cost_center_id = b.cost_center_id
  LEFT JOIN invoices i ON strftime('%Y-%m', i.invoice_date) = b.year_month
  LEFT JOIN invoice_items it
    ON it.invoice_id = i.invoice_id
    AND it.cost_center_id = b.cost_center_id
  GROUP BY b.year_month, cc.cost_center_code, b.budget_amount
)
SELECT
  year_month,
  cost_center_code,
  ROUND(actual_amount, 2) AS actual_amount,
  ROUND(budget_amount, 2) AS budget_amount,
  ROUND(actual_amount - budget_amount, 2) AS variance_abs,
  ROUND(
    CASE
      WHEN budget_amount = 0 THEN NULL
      ELSE ((actual_amount - budget_amount) / budget_amount) * 100
    END
  , 2) AS variance_pct
FROM variance
WHERE actual_amount > budget_amount
ORDER BY variance_abs DESC
LIMIT 10;

-- Q09) Monthly total budget coverage
WITH actual_month AS (
  SELECT
    strftime('%Y-%m', i.invoice_date) AS year_month,
    ROUND(SUM(it.amount_net), 2) AS actual_amount
  FROM invoice_items it
  JOIN invoices i ON i.invoice_id = it.invoice_id
  GROUP BY strftime('%Y-%m', i.invoice_date)
),
budget_month AS (
  SELECT
    year_month,
    ROUND(SUM(budget_amount), 2) AS budget_amount
  FROM budget_monthly
  GROUP BY year_month
)
SELECT
  b.year_month,
  b.budget_amount,
  COALESCE(a.actual_amount, 0) AS actual_amount,
  ROUND(COALESCE(a.actual_amount, 0) - b.budget_amount, 2) AS variance_abs,
  ROUND(
    CASE
      WHEN b.budget_amount = 0 THEN NULL
      ELSE ((COALESCE(a.actual_amount, 0) - b.budget_amount) / b.budget_amount) * 100
    END
  , 2) AS variance_pct
FROM budget_month b
LEFT JOIN actual_month a ON a.year_month = b.year_month
ORDER BY b.year_month;

-- Q10) Variance with traffic-light indicator
WITH variance AS (
  SELECT
    b.year_month,
    cc.cost_center_code,
    b.budget_amount,
    COALESCE(SUM(it.amount_net), 0) AS actual_amount
  FROM budget_monthly b
  LEFT JOIN cost_centers cc ON cc.cost_center_id = b.cost_center_id
  LEFT JOIN invoices i ON strftime('%Y-%m', i.invoice_date) = b.year_month
  LEFT JOIN invoice_items it
    ON it.invoice_id = i.invoice_id
    AND it.cost_center_id = b.cost_center_id
  GROUP BY b.year_month, cc.cost_center_code, b.budget_amount
)
SELECT
  year_month,
  cost_center_code,
  ROUND(actual_amount - budget_amount, 2) AS variance_abs,
  ROUND(
    CASE
      WHEN budget_amount = 0 THEN NULL
      ELSE ((actual_amount - budget_amount) / budget_amount) * 100
    END
  , 2) AS variance_pct,
  CASE
    WHEN budget_amount = 0 THEN 'n/a'
    WHEN ((actual_amount - budget_amount) / budget_amount) > 0.10 THEN 'red'
    WHEN ((actual_amount - budget_amount) / budget_amount) > 0.03 THEN 'yellow'
    ELSE 'green'
  END AS variance_status
FROM variance
ORDER BY year_month, cost_center_code;
