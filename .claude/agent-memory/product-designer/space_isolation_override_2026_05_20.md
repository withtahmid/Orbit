---
name: space-isolation-override-2026-05-20
description: Tahmid overrode spec §12 with two rules — flow analytics must be space-isolated; only My Money unions across spaces. Recommendation accepted hybrid scoping for balance/net-worth tiles.
metadata:
  type: project
---

On 2026-05-20 Tahmid declared two rules that override `contexts/project-specification.md` §12 (the "money-flow analytics are account-scoped" doctrine):

- **R1.** "One space's expense should not include another space's expense. Spaces are isolated."
- **R2.** "Only My Money virtual space unions all spaces of a user."

The pre-existing spec §12 (lines 1119-1174) and the comment on `apps/server/src/procedures/account/shareWithSpace.mts:16-17` were already in tension: the share-with-space comment said "historical transactions in other spaces remain visible only in those spaces" (R1-flavored), but §12 codified account-scoping (R1-violating). Tahmid's call resolves the conflict in favor of R1.

**Why:** the trigger from `0018_create_update_account_balance_trigger.mts` keeps `account_balances.balance` as a cross-space lifetime ledger, which was conflating "this space's flow" with "the account's full ledger" in every per-space Overview when an account is shared into multiple spaces. Concrete leak: 420.00 expense showed up in "pp's Family" Overview that belonged to "Tahmid's space".

**How to apply (recommended hybrid, see [[concept_critique_2026_05_13]] for related budgeting model concerns):**
- **Flow analytics** (income/expense/category/cashflow/spending/anomalies — Tier A list) → strict R1, just add `transactions.space_id = ${spaceId}` to WHERE.
- **Balance/Net-worth tiles** → still show the underlying account's true balance (Option α from the question) but **re-label**. The "Total balance" / "Net worth" tile in a non-personal space is misleading; rename to "Accounts in this space (full balance)" or split into "Spendable here" + "Account total" so the user understands they're looking at a real-world bucket, not a space-scoped quantity. Use "Net worth" terminology **only on /s/me**.
- **Reconciliation invariant** (spec §12 "periodNet must equal balanceHistory delta") is a self-imposed constraint with no end-user value once accounts can be shared — drop it. Document its retirement in §12.
- **`shareWithSpace`** stays valid under α, useful precisely because the balance tile still shows the real account. Under β it would be near-useless and should be deprecated.

**Where this lands in the spec:** §12 needs a rewrite (the combination table is wrong under R1). §6.3 share semantics need the comment re-confirmed. §6.5 already matches R2.
