---
name: transaction-entry-pins-spec
description: Design spec for "Pin" feature — server-backed per-field hydration in transaction entry form. MVP ships Account (per-user-per-space), Envelope (space-wide), Event (space-wide).
metadata:
  type: project
---

Spec v3 confirmed 2026-05-13 — scoping revised: Account is per-user-per-space, Envelope and Event are space-wide. Built on v2 (server-backed, all three pins in MVP, hydrate-not-submit, indicator glyph, dropdown entry point).

**Decisions baked in (v2):**
- Name: **"Pin"** (verb) / **"Pinned"** (state). Rejected "Default" (conflicts with `category.default_envelop_id`) and "Lock" (implies uneditable).
- **Hydrate, not auto-submit.** Pin only pre-fills the form; user always reviews.
- **Server-side persistence in TWO tables** (v3): `space_pin (space_id, field, envelop_id|event_id, set_by_user_id)` for shared pins and `user_space_pin (user_id, space_id, field, account_id)` for private pins. Shared enum `transaction_entry_pin_field`. `ON DELETE CASCADE` on entity FKs gives silent auto-expire at DB level. Migration number stays `043_transaction_entry_pins.mts`. Picked two tables over nullable-user_id because constraints + per-procedure authorization stay simpler and more grep-able.
- **New top-level `pin` router** (not under `space`). Procedures: `pin.listBySpace`, `pin.set`, `pin.clear`. All `authorizedProcedure`. List returns `{ account, envelop, event }` single-row shape (account from `user_space_pin`, envelop/event from `space_pin`, joined to entities with archived filtering). `set` input is a Zod **discriminated union** on `field` — scope is inferred (account → user_space_pin; envelop/event → space_pin), never passed by client. `clear` takes `{ spaceId, field }` and infers the same way.
- **All three pins ship in MVP** (Account, Envelope, Event). No phased rollout.
- **One pin per field type.** Selecting a new pin replaces the old (server `ON CONFLICT DO UPDATE`).
- **Pins supersede `lastAccountKey`** when set. When cleared, `lastAccountKey` resumes.
- **Envelope pin reverses the existing category→envelope auto-overwrite** at `NewTransactionSheet.tsx:1427-1434`. When envelope is pinned, picking a category does NOT clobber the envelope; the existing `envelopeOverridden` chip copy is extended.
- **Web state:** React Query hook `usePins(spaceId)` with `staleTime: 5min`; optimistic updates on set/clear. Not MobX — MobX reserved for auth/signup in this repo.
- **Archived entity (envelope `archived_at`, event `status != active`):** filtered out by `pin.listBySpace` procedure, treated as no-pin client-side. No toast, no banner — silent. For space-wide pins this means everyone in the space silently loses the pin, which is fine — archiving is a deliberate action.
- **Permissions (v3):** `pin.set`/`pin.clear` for envelope/event require `owner` or `editor` role (matches `event.create`/`update` precedent); account pin allows any member. Viewers cannot set space pins. The `set_by_user_id` column on `space_pin` is preserved purely for audit / future "Pinned by Alice" attribution — not surfaced in MVP UI. Accepting pin-thrashing risk between editors (low-probability in practice; one-tap recovery; no data loss).
- **Visual indicator (v3):** single pushpin glyph regardless of scope. The "(space)" modifier appears only in the dropdown header strip when the dropdown is open, never on the trigger. Rationale: cognitive load of distinguishing your-pin vs. shared-pin > value.
- **Notification of pin changes by others:** silent. No toast/banner/badge. The pushpin glyph + hydrate-not-submit invariant carry the message. If telemetry shows frequent overrides, add inline "Pinned by Bob — keep or replace?" prompt as Phase 2.
- **Visual indicator:** filled pushpin glyph (14px, lucide `Pin` filled) inside the OrbitSelect trigger at start of value, 6px from value text. Field label unchanged when no pin set (no empty slot). Un-pinning happens from the dropdown header strip ("📌 Pinned: X — [Unpin]"), NOT by tapping the glyph (too small a target).
- **Pin entry point:** explicit "Pin this" action in the field's selector dropdown (header strip when set; per-row affordance when unset). Rejected long-press (discoverability + iOS conflict) and separate settings sheet (indirect).
- **Personal space (`/s/me`):** Shipped as **hidden** (revised from earlier spec drafts that said "supported"). `usePins` short-circuits when `spaceId === "me"` (network disabled, `isPersonal: true` exposed on the hook), and every `<PinControl>` in `NewTransactionSheet` reads `available={!pinState.isPersonal}` — the control simply doesn't render in the personal flow. Rationale: low signal (a solo user re-picking their one default account/envelope is cheap; the friction pins solve is shared-space coordination) and no event concept in `/s/me`. If we later want personal pins for power users, they can ride on the existing `user_space_pin`/`space_pin` rows keyed on the real personal-space id — server is already capable; only the client gate needs lifting.
- **Edit form (`EditTransactionSheet`) deliberately does NOT read or write pins.**

**Why server-backed:** survives device switches and reinstalls, syncs across tabs naturally, gives DB-level cascade semantics for free. Cost is one migration + one router + ~3 procedures, contained risk.

**How to apply:** When future transaction-entry friction work comes up (income destination, transfer source/dest), extend the `transaction_entry_pin_field` enum AND decide scope per new field (per-user → `user_space_pin`; shared → `space_pin`). The discriminated-union `set` input pattern absorbs new variants cleanly. Smart auto-suggestions ("you usually use Joint Card at Tartine") remain a Phase 3 *replacement* for pins in many cases — don't ship both layers without precedence rules.

**Web-side impact of v3 scoping:** `NewTransactionSheet.tsx` changes are minimal — seams at 1156-1165 (Account default) and 1427-1434 (envelope/category interaction) are unchanged. Only deltas: (1) gate the [Pin this]/[Unpin] affordances on `role !== 'viewer'` for envelope/event fields; (2) dropdown header copy reads `Pinned (space)` for envelope/event vs `Pinned` for account. `usePins` hook signature unchanged.

Related: [[events-domain-shape]], [[envelope-category-coupling-decision]].
