---
name: Money storage convention
description: How Orbit stores and transmits monetary amounts — relevant to precision/rounding checks
type: project
---

Orbit stores money in Postgres `numeric` columns (e.g. `numeric(14, 2)` for `events.estimated_amount`). Procedures cast to `text` in SELECT (`::text`) and the client does `Number(value)` to get a JS number for display. There is no integer-cents (minor-unit) layer.

**Why:** Numeric is exact, but the cast-to-Number step is the precision boundary. JS `Number` is float64, so above ~15 significant digits you lose precision. For realistic ledger amounts in a personal-finance app this is fine, but treat it as a known limit.

**How to apply:**
- Don't flag the text↔Number conversion as a precision bug unless realistic values would overflow ~$9 quadrillion.
- Aggregation in SQL is exact (numeric); the rounding happens at the JS boundary.
- The `.toFixed(2)` and `toLocaleString` patterns on the client are correct for display, not for storage round-trips.
