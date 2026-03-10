# Cherit Systems GmbH - IT Invoice Control Dataset

This folder contains a compact, realistic starter dataset for the wiki scenario:

- `vendors.csv`
- `cost_centers.csv`
- `invoices.csv`
- `invoice_items.csv`
- `budget_monthly.csv`
- `queries.sql`

## Import Order

1. `vendors.csv`
2. `cost_centers.csv`
3. `invoices.csv`
4. `invoice_items.csv`
5. `budget_monthly.csv` (for phase 2: budget vs actual)

## Recommended Table Names

- `vendors`
- `cost_centers`
- `invoices`
- `invoice_items`
- `budget_monthly`

## Notes

- Currency is `EUR`.
- Tax values are stored per line item (`tax_rate`).
- A mix of `approved`, `paid`, and `in_review` status is intentional for dashboard/worklist examples.
- Data currently spans `2026-01` to `2026-04` for trend and MoM analysis.
- Budget data covers `2026-01` to `2026-04` on cost center level.
