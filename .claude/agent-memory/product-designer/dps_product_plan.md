---
name: dps-product-plan
description: Product plan for tracking Bangladesh DPS (Deposit Pension Scheme) — modeled as locked account + dps_schemes side-table + projection-only interest, monthly installment as ordinary transfer.
metadata:
  type: project
---

Plan delivered 2026-05-13 on branch `feature-DPS` (no prior code).

**Core decision:** DPS is NOT a new top-level primitive. It is a `locked` `accounts` row + a `dps_schemes` side-table holding the scheme metadata (term, rate, compounding, installment, start). The principal lives in `account_balances` like any account. Interest is projection-only (computed on read) until the bank actually credits a maturity income transaction.

Key design choices (do not relitigate without strong reason):
- Installment posting = normal transfer (savings → DPS locked account); analytics already handle it.
- Compounding monthly or quarterly, future-value-of-ordinary-annuity formula. Frequencies stored as enum `monthly | quarterly`.
- Maturity date is derived (`start_date + term_months`), stored as a generated column or computed.
- Status enum on `dps_schemes`: `active | matured | encashed_early | abandoned`.
- Personal-space first surface; spaces also support it (rare household DPS case) — both via same data, different routers.
- Missed-installment ledger derived on-read by diffing expected schedule vs. actual transfers tagged with `dps_scheme_id`.
- Premature encashment = mutation that records final payout amount and writes a closing adjustment + a one-off income for interest portion.

**How to apply:** If the user comes back with DPS questions — early encashment math, tax-on-maturity, missed installment behavior — anchor the answer on this model. Don't redesign from scratch.
