---
name: invite_token_design
description: Space invites are token-only bearer credentials — acceptance is NOT pinned to the invited email; whoever holds the URL can claim the role.
metadata:
  type: project
---

`apps/server/src/db/kysely/migrations/039_create_space_invites.mts` and `procedures/space/acceptInvite.mts` deliberately:
- Authenticate the acceptor as **any** logged-in user — not the email on the invite row.
- Trust the 32-byte hex token as the sole credential.

The docstring in the migration explicitly calls this out ("a user can invite a friend by any address and the friend can accept with whatever account they already have").

**Why:** Reduces signup friction for "invite by guessed email" scenarios where the invitee already has an Orbit account under a different address. Documented intent.

**How to apply:** Don't flag the missing email-match as a bug. **Do** flag downstream risks: invite URLs leak via Referer headers, email forwarding, browser history, server logs, etc. — and an attacker who gets a `role: "owner"` invite link gains full financial-data access. Mitigations worth recommending (if asked): one-time-use enforcement (currently only the unique partial-index prevents re-issue, not re-accept), require email match for `role: "owner"` invites, signed-in-email match warning UI.
