# Example Scenario: Cherit Systems GmbH IT Invoice Control

_Last updated: 2026-03-10_

## Goal

This scenario shows how LiteBI Studio can be used to control monthly IT costs from incoming invoices.

Business question:

- Which vendors, services, and cost centers drive the highest IT spend?
- Where are unusual changes month-over-month?
- Which invoices still need clarification or approval?

## Company Context (Fictional)

**Cherit Systems GmbH** is a mid-sized company with:

- Hybrid infrastructure (cloud + on-prem)
- 10+ recurring software vendors
- Central IT budget with department allocations
- Monthly invoice review workflow (finance + IT operations)

## Data Scope (Phase 1)

Start with one simple but useful data model:

- `invoices`: one row per invoice
- `invoice_items`: one row per billed item/position
- `vendors`: vendor master data
- `cost_centers`: IT cost center mapping

Minimum fields:

- Invoice header: `invoice_id`, `vendor_id`, `invoice_date`, `due_date`, `currency`, `gross_total`, `status`
- Invoice item: `item_id`, `invoice_id`, `service_category`, `service_name`, `period_from`, `period_to`, `amount_net`, `tax_rate`, `cost_center_id`
- Vendor: `vendor_name`, `vendor_type`, `contract_model`
- Cost center: `cost_center_code`, `owner_team`

## Ready-to-Use Demo Dataset

You can import a prepared sample package from:

- `docs/examples/cherit-systems-it-invoice-control/`

Included files:

- `vendors.csv`
- `cost_centers.csv`
- `invoices.csv`
- `invoice_items.csv`
- `queries.sql` (copy/paste starter analysis into SQL Workspace)

Recommended import order:

1. `vendors.csv`
2. `cost_centers.csv`
3. `invoices.csv`
4. `invoice_items.csv`

## Step-by-Step in LiteBI Studio

## 1) Import Data

1. Open **Data Management**.
2. Import CSV/Excel files for invoices and dimensions.
3. Validate mapping and types.
4. Save to internal tables.

Expected result:

- Data is available in **Tables** and queryable from **SQL Workspace**.

## 2) Validate Data Quality

Run these checks in **SQL Workspace**:

```sql
-- Duplicate invoice ids
SELECT invoice_id, COUNT(*) AS cnt
FROM invoices
GROUP BY invoice_id
HAVING COUNT(*) > 1;
```

```sql
-- Invoices without line items
SELECT i.invoice_id
FROM invoices i
LEFT JOIN invoice_items it ON it.invoice_id = i.invoice_id
WHERE it.invoice_id IS NULL;
```

```sql
-- Items without cost center mapping
SELECT it.item_id, it.invoice_id
FROM invoice_items it
LEFT JOIN cost_centers cc ON cc.cost_center_id = it.cost_center_id
WHERE cc.cost_center_id IS NULL;
```

## 3) Build Core KPI Queries

```sql
-- Monthly IT spend trend
SELECT
  strftime('%Y-%m', invoice_date) AS year_month,
  ROUND(SUM(gross_total), 2) AS total_spend
FROM invoices
GROUP BY 1
ORDER BY 1;
```

```sql
-- Top vendors by spend
SELECT
  v.vendor_name,
  ROUND(SUM(i.gross_total), 2) AS total_spend
FROM invoices i
JOIN vendors v ON v.vendor_id = i.vendor_id
GROUP BY v.vendor_name
ORDER BY total_spend DESC
LIMIT 10;
```

```sql
-- Spend by service category
SELECT
  service_category,
  ROUND(SUM(amount_net), 2) AS amount_net
FROM invoice_items
GROUP BY service_category
ORDER BY amount_net DESC;
```

## 4) Create Reusable Widgets

In **Widgets**:

1. Save each KPI query as a widget.
2. Add chart/table configuration.
3. Save and verify no dirty marker remains.

Recommended starter widgets:

- `Monthly IT Spend`
- `Top 10 Vendors`
- `Spend by Service Category`
- `Open Invoices (status != paid)`

## 5) Build an Executive Dashboard

In **Dashboard**:

1. Add the four widgets.
2. Arrange by decision flow:
   - trend first, then contributors, then operational backlog.
3. Save layout and test reload behavior.

## 6) Add Operational Follow-up

Use **Worklist** for approval/clarification tasks:

- Missing contract reference
- Unmapped cost center
- Unusual amount delta vs previous month

## Suggested Expansion Roadmap

## Phase 2: Budget and Variance

- Add monthly budget table per cost center.
- Add variance KPIs (`actual - budget`) and alerts.

## Phase 3: Forecasting

- Add trailing 3/6/12-month moving averages.
- Mark abnormal increases per vendor/category.

## Phase 4: Governance

- Approval SLA tracking
- Late payment risk panel
- Audit trail widgets

## Success Criteria

You are successful when:

- Finance and IT can explain monthly cost deltas within minutes.
- Top cost drivers are visible without ad-hoc SQL every time.
- Open/unclear invoices are visible in one operational view.

## Related Pages

- [Page: Data Management](Page-Data-Management)
- [Page: Tables](Page-Tables)
- [Page: SQL Workspace](Page-SQL-Workspace)
- [Page: Widgets](Page-Widgets)
- [Page: Dashboard](Page-Dashboard)
- [Page: Worklist](Page-Worklist)
