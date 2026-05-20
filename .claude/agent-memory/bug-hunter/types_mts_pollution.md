---
name: types-mts-pollution
description: types.mts can carry table/column declarations for objects that exist only in a developer's local DB — generated against a contaminated state and committed silently
metadata:
  type: project
---

`apps/server/src/db/kysely/types.mts` is kysely-codegen output, regenerated via
`pnpm generate-types`. The generator reflects the live DB it's pointed at — so if
a developer's local DB has extra tables (their own experiments, side migrations
not in tree), those tables become part of the committed `DB` interface even
though no migration creates them.

**Example observed on `rename-plan-goal` branch:**
- `DpsPayouts`, `DpsSchemes` table types
- `Transactions.dps_scheme_id` column
- No corresponding `migrations/*.mts` create them — grep returns zero hits.

**Why this is a real bug, not just noise:**
- Code can `selectFrom("dps_schemes").select(...)` and compile cleanly. Runtime explodes ("relation does not exist") on the first deploy where the DB actually matches its own migrations.
- Hides drift: reviewers reading types.mts can't tell which declarations are migration-backed vs developer-detritus.

**How to apply:**
- When reviewing any PR that touches `types.mts`, cross-check every NEW table/column against a migration in the same PR (or earlier merged migrations). Anything without a migration trail is contamination.
- Don't accept `types.mts` changes blindly because "the engineer ran generate-types." Verify the generator was pointed at a clean migrated DB, not a dev sandbox.
- Fix: regenerate against a freshly-`pnpm migrate`'d empty DB before committing.

Related: [[envelope_target_clearing]] (envelope target columns are added by 046+047 and DO have a migration trail — that part is correct).
