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
- `budget_monthly.csv` (phase 2: budget baseline per month and cost center)
- `queries.sql` (copy/paste starter analysis into SQL Workspace)

Recommended import order:

1. `vendors.csv`
2. `cost_centers.csv`
3. `invoices.csv`
4. `invoice_items.csv`
5. `budget_monthly.csv`

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

## 3b) Add Budget and Variance (Phase 2)

Import `budget_monthly.csv` into table `budget_monthly`.

Then use queries `7` to `10` in `queries.sql` for:

- Budget vs actual per month and cost center
- Top budget overruns
- Monthly budget coverage
- Traffic-light variance status (`green/yellow/red`)

## 4) Create Reusable Widgets

In **Widgets**:

1. Save each KPI query as a widget.
2. Add chart/table configuration.
3. Save and verify no dirty marker remains.

### Widget Build Steps (recommended)

Use the same flow for every widget to keep behavior consistent:

1. Open **Widgets -> Widget erstellen**.
2. Click **SQL-Statement auswählen** and pick the statement number from `queries.sql`.
3. Click **Ausführen** once to validate result columns.
4. Open **Konfiguration** and set:
   - chart type
   - category/x field
   - value/y field(s)
   - sorting and limit (if needed)
   - number format (currency/percent)
5. In **Finalize**, set:
   - widget name (prefix with statement number, for example `#7 Budget vs Actual by Cost Center`)
   - short description (business meaning, not technical SQL detail)
6. Save and confirm:
   - dirty marker (`*`) disappears
   - widget appears in **Widgets verwalten**
   - preview looks correct in both chart and table tabs

Recommended starter widgets:

- `Monthly IT Spend` (SQL statement `#1`)
- `Top 10 Vendors` (SQL statement `#2`)
- `Spend by Service Category` (SQL statement `#3`)
- `Open Invoices (status != paid)` (SQL statement `#5`)
- `Budget vs Actual by Cost Center` (SQL statement `#7`)
- `Top Overruns` (SQL statement `#8`)

### Suggested Visualization per Statement

Use these defaults as a starting point:

- SQL statement `#1` -> **Line chart**
  - X: `year_month`
  - Y: `total_spend`
- SQL statement `#2` -> **Bar chart**
  - X: `vendor_name`
  - Y: `total_spend`
  - Sort descending
- SQL statement `#3` -> **Donut or Bar**
  - Category: `service_category`
  - Value: `amount_net`
- SQL statement `#5` -> **Table**
  - Show: `invoice_id`, `vendor_name`, `invoice_date`, `status`, `gross_total`
- SQL statement `#7` -> **Grouped Bar** (or Line with two series)
  - X: `year_month` (or `cost_center_code` for a monthly snapshot)
  - Series/Values: `budget_amount`, `actual_amount`
- SQL statement `#8` -> **Table or Bar**
  - Category: `cost_center_code` (or vendor, depending on query shape)
  - Value: `variance_abs`
  - Focus on positive variance only

Naming convention tip:

- Use `P2 - #<statement> - <business name>` to simplify dashboard maintenance (for example `P2 - #10 - Variance Traffic Light`).

## 5) Build an Executive Dashboard

In **Dashboard**:

1. Add the core widgets.
2. Arrange by decision flow:
   - trend first, then contributors, then operational backlog.
3. Save layout and test reload behavior.

### Phase 2 Dashboard Blueprint (Budget and Variance)

Use this structure for a practical management dashboard:

1. KPI row (top):
   - `Actual IT Spend (current month)`
   - `Budget (current month)`
   - `Variance % (current month)`
   - `Cost Centers in Red/Yellow`
2. Main analysis row:
   - `Actual vs Budget by Month` (line chart, two series)
   - `Actual by Cost Center` (bar chart, monthly filtered)
3. Risk/operations row:
   - `Variance Traffic-Light by Cost Center` (table with status colors)
   - `Top Overruns` (table or bar chart, highest positive variance)

Suggested SQL mapping (from `queries.sql`):

- KPI row:
  - SQL statement `#7` (budget vs actual baseline)
  - SQL statement `#10` (variance status and percentage)
- Main analysis:
  - SQL statement `#7` (trend and cost center variance base)
  - SQL statement `#9` (coverage signal as optional KPI)
- Risk/operations:
  - SQL statement `#8` (top overruns)
  - SQL statement `#10` (traffic-light status)

Recommended dashboard filters:

- `year_month`
- `cost_center_code`
- optional `vendor_name` (for investigation views)

Recommended drilldown behavior:

1. Click a cost center in variance widgets.
2. Open related detail widget/table (invoice-level rows).
3. Escalate suspicious rows into **Worklist** for follow-up.

## 6) Add Operational Follow-up

Use **Worklist** for approval/clarification tasks:

- Missing contract reference
- Unmapped cost center
- Unusual amount delta vs previous month

## Suggested Expansion Roadmap

## Phase 2: Budget and Variance

- Included in this example:
  - `budget_monthly.csv`
  - Variance queries (`7-10`) in `queries.sql`
- Next optional step:
  - Add automatic alert rules for `variance_status = 'red'`

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
