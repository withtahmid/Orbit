---
name: auth-session-security-posture
description: Orbit's session model — non-expiring JWTs revoked only via token_version; what makes it defensible and the sign-out UX gap.
metadata:
  type: project
---

Orbit intentionally uses non-expiring JWTs (as of branch `auth-logout-fix`, 2026-07-01). User's explicit ask: "logged in forever."

**Revocation primitive:** `token_version` (migration 040). Bumped on password change (`user/changePassword.mts`), password reset (`auth/resetPassword/complete.mts`), and account deletion (`user/deleteAccount.mts`). Auth layer (`trpc/auth.mts`) rejects a JWT whose `tokenVersion` claim != DB `token_version`. Missing claim (pre-040 tokens) treated as `1`. This is the ONLY way a session dies.

**Why forever-sessions are defensible here:** password-reset-from-another-device is the real "lost device" revocation path; SecurityPage already has per-device "Log out" + password card; consumer finance apps (YNAB/Monarch) do the same. So do NOT recommend idle-timeout or active-session-list — unwarranted scope for this app.

**Known UX gap (recommended, may not be built yet):** client detects UNAUTHORIZED via global TanStack Query `onError` in `App.tsx` and hard-redirects via `window.location.href` to `/login` with no message. This re-creates the "app looks broken" perception the original bug caused. Fix = stash a `logout_reason` flag before redirect, have LoginPage show a "You were signed out" toast.

**Why:** the original prod bug was a stale-name-but-no-data state because the client never detected the expired-JWT UNAUTHORIZED and never logged out.

**How to apply:** when reviewing auth/session/settings changes, check the sign-out UX communicates *why*, and confirm any new session-invalidation path also bumps `token_version` (else it won't actually kill sessions).
