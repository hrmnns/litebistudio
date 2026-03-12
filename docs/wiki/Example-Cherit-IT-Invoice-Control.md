# Example Scenario: Cherit Systems GmbH IT Invoice Control

_Last updated: 2026-03-11_

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
- `budget_monthly.csv` (budget baseline per month and cost center)
- `queries.sql` (copy/paste starter analysis into SQL Workspace)

Recommended import order:

1. `vendors.csv`
2. `cost_centers.csv`
3. `invoices.csv`
4. `invoice_items.csv`
5. `budget_monthly.csv`

## Step-by-Step in LiteBI Studio

Note:

- Budget and variance analysis is fully integrated in this base walkthrough (not an optional future phase).
- The core budget/variance statements are SQL `Q07` to `Q10` and are used directly in the dashboard build steps below.

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

What this validates:

- Ensures `invoice_id` is unique in the imported header table.
- Detects duplicate imports or accidental re-imports.

Expected result:

- **No rows returned**.
- If rows appear, each returned `invoice_id` has been imported more than once and should be cleaned before dashboarding.

```sql
-- Invoices without line items
SELECT i.invoice_id
FROM invoices i
LEFT JOIN invoice_items it ON it.invoice_id = i.invoice_id
WHERE it.invoice_id IS NULL;
```

What this validates:

- Checks referential completeness between invoice headers and line items.
- Ensures every invoice used in analytics has at least one position.

Expected result:

- **No rows returned**.
- If rows appear, these invoices are incomplete and can distort totals and category breakdowns.

```sql
-- Items without cost center mapping
SELECT it.item_id, it.invoice_id
FROM invoice_items it
LEFT JOIN cost_centers cc ON cc.cost_center_id = it.cost_center_id
WHERE cc.cost_center_id IS NULL;
```

What this validates:

- Ensures each invoice item is assigned to a valid cost center.
- Prevents unallocated spend from disappearing in cost-center dashboards.

Expected result:

- **No rows returned**.
- If rows appear, these positions need mapping correction before budget/variance analysis (SQL `Q07-Q10`).

## 3) Save SQL Statements from `queries.sql`

Open `docs/examples/cherit-systems-it-invoice-control/queries.sql` and save reusable statements in SQL Workspace.

Use this naming pattern:

- Query names: `Q01 - <name>`, `Q02 - <name>`, ...
- Widget names: `W01 - <name>`, `W02 - <name>`, ...

For this walkthrough, use this SQL catalog:

- `Q01` Monthly total spend
- `Q02` Top vendors by spend
- `Q03` Spend by service category
- `Q04` Open invoice volume (status overview)
- `Q05` Cost center split
- `Q06` Month-over-month vendor delta
- `Q07` Budget vs actual by month and cost center
- `Q08` Top overruns
- `Q09` Monthly budget coverage
- `Q10` Variance traffic-light indicator

Note:

- Dashboards below require `Q01`, `Q02`, `Q03`, `Q05`, `Q07`, `Q08`, `Q09`, and `Q10`.
- `Q04` and `Q06` are optional analysis extensions for operational and vendor deep dives.

## 4) Build a Reusable Widget Catalog

Build widgets once, then reuse them across multiple dashboards.

### Generic widget build flow

1. Open **Widgets -> Editor**.
2. Select a SQL statement (for example `Q07`).
3. Run once to validate columns.
4. Open **Configuration** and choose chart/table settings.
5. Set a clear widget name and description.
6. Save and verify:
   - no dirty marker (`*`)
   - widget appears in **Widgets Manage**
   - table and chart preview render correctly.

### Recommended widget set

- `W01 - Monthly IT Spend Trend` -> SQL `Q01` -> Line chart
- `W02 - Top Vendors by Spend` -> SQL `Q02` -> Bar chart
- `W03 - Spend by Service Category` -> SQL `Q03` -> Donut (or Bar)
- `W04 - Open Invoices` -> SQL `Q05` -> Table
- `W05 - Budget vs Actual Trend` -> SQL `Q07` -> Line chart (2 series)
- `W06 - Budget vs Actual by Cost Center` -> SQL `Q07` -> Grouped bar
- `W07 - Top Overruns` -> SQL `Q08` -> Table (or Bar)
- `W08 - Monthly Budget Coverage` -> SQL `Q09` -> KPI/Line
- `W09 - Variance Traffic Light` -> SQL `Q10` -> Table (status-focused)

## 5) Dashboard 1: Executive Management

Purpose:

- Give management a fast monthly overview of budget compliance and major risks.

### Build steps

1. Create dashboard: `Executive Management`.
2. Add widgets in this order:
   - `W05 - Budget vs Actual Trend` (SQL `Q07`)
   - `W08 - Monthly Budget Coverage` (SQL `Q09`)
   - `W09 - Variance Traffic Light` (SQL `Q10`)
   - `W07 - Top Overruns` (SQL `Q08`)
3. Layout recommendation:
   - top row: trend + coverage
   - second row: traffic-light table + top overruns
4. Add dashboard filters:
   - `year_month`
   - `cost_center_code`
5. Validation:
   - trend totals match table totals
   - variance status reacts correctly to thresholds
   - reload keeps layout and dashboard selection.

## 6) Dashboard 2: Vendor and Category Analysis

Purpose:

- Explain where spend concentration comes from.

### Build steps

1. Create dashboard: `Vendor & Category Analysis`.
2. Add widgets:
   - `W02 - Top Vendors by Spend` (SQL `Q02`)
   - `W03 - Spend by Service Category` (SQL `Q03`)
   - `W01 - Monthly IT Spend Trend` (SQL `Q01`)
3. Add filters:
   - `year_month`
   - optional `vendor_name`
4. Validation:
   - top vendor list is plausible
   - category distribution explains trend spikes.

## 7) Dashboard 3: Operational Invoice Control

Purpose:

- Support day-to-day follow-up and issue triage.

### Build steps

1. Create dashboard: `Operational Invoice Control`.
2. Add widgets:
   - `W04 - Open Invoices` (SQL `Q05`)
   - `W07 - Top Overruns` (SQL `Q08`)
   - `W09 - Variance Traffic Light` (SQL `Q10`)
3. Prefer table-oriented layout for operational work.
4. Add filters:
   - `year_month`
   - `cost_center_code`
   - optional `status`
5. Validation:
   - open invoices are actionable
   - overruns and red statuses are easy to identify.

## 8) Link Dashboards to Worklist

When analysts detect suspicious findings, create follow-up tasks in **Worklist**:

- Missing contract reference
- Unmapped cost center
- Unusual amount delta vs previous month
- Repeated overrun in same cost center

## Budget and Variance Dashboard Mapping

Use this mapping as a compact implementation reference:

| Widget | SQL statement | Visualization | Target dashboard | Purpose |
|---|---|---|---|---|
| W05 - Budget vs Actual Trend | Q07 | Line chart (2 series) | Executive Management | Monthly budget compliance trend |
| W06 - Budget vs Actual by Cost Center | Q07 | Grouped bar | Executive Management (optional) / Operational Invoice Control | Compare budget vs actual by cost center |
| W07 - Top Overruns | Q08 | Table or Bar | Executive Management + Operational Invoice Control | Identify largest positive variances |
| W08 - Monthly Budget Coverage | Q09 | KPI or Line | Executive Management | High-level budget coverage signal |
| W09 - Variance Traffic Light | Q10 | Table (status-focused) | Executive Management + Operational Invoice Control | Highlight red/yellow risk cost centers |

Recommended build order for Budget/Variance:

1. Create `W05`, `W08`, and `W09` first (management baseline).
2. Add `W07` for overrun prioritization.
3. Add `W06` if cost-center comparison is needed in chart form.
4. Reuse the same widgets in the operational dashboard to avoid duplication.

## Suggested Expansion Roadmap

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
- Teams can navigate from management dashboard to operational dashboard and derive concrete actions.

## Related Pages

- [Page: Data Management](Page-Data-Management)
- [Page: Tables](Page-Tables)
- [Page: SQL Workspace](Page-SQL-Workspace)
- [Page: Widgets](Page-Widgets)
- [Page: Dashboard](Page-Dashboard)
- [Page: Worklist](Page-Worklist)
