---
name: resolve_space_membership
description: Standard auth guard at `procedures/space/utils/resolveSpaceMembership.mts` — checks the caller is a member of `spaceId` with a role in `roles[]`.
metadata:
  type: reference
---

Signature:
```
resolveSpaceMembership({ trx, spaceId, userId, roles }) → { space, membership }
```

- Throws `NOT_FOUND` if space doesn't exist.
- Throws `FORBIDDEN` if user has no membership row with one of the allowed roles.

**How to apply:** When auditing space-scoped procedures, confirm:
1. `resolveSpaceMembership` is called (otherwise IDOR likely).
2. The role set matches the *destructive intent*, not just "any member". The codebase is inconsistent:
   - `addMembers` / `revokeInvite` / `sendInvite` / `listInvites` allow `["owner","editor"]`.
   - `removeMember` allows `["owner"]` only.
   - `leaveSpace` doesn't call the helper at all (different semantics — caller is self-removing).
3. The check runs **inside** the transaction (`trx`), not against the snapshot pool.
