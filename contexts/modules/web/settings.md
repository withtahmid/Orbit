# Space settings (web)

> Per-space settings page with three tabs — General (rename), Members (list, role change, add/remove), and Danger (delete space, owner-only).

## Route(s)
- Path: `ROUTES.spaceSettings(id)` -> `/s/:spaceId/settings` (`apps/web/src/router/routes.ts:28`).
- Lazy-imported in `apps/web/src/router/index.tsx:73`, mounted at `apps/web/src/router/index.tsx:251-254` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only — `SpaceLayout` hides the Settings tab in personal mode (`apps/web/src/layouts/SpaceLayout.tsx:74-77`).

## Files
- Main page: `apps/web/src/pages/space/settings/SpaceSettingsPage.tsx`. Single file with the page plus inline sub-components: `MembersCard`, `RoleSelect`, `RemoveMember`, and `AddMember`.
- Uses shadcn-style `Card` / `Tabs` (`:10-11`) rather than orbit-design CSS — the page sits in the default `SpaceLayout` padding and looks more "default shadcn" than the other space pages.

## tRPC procedures consumed
General tab:
- `space.update` — rename via `{ spaceId, name }` (`:50`).

Members tab:
- `space.memberList` — current members list (`:154`).
- `auth.findUserByEmail` — used by `AddMember` to look up an invite target (`:267`).
- `space.addMembers` — invite new members (`:271`).
- `space.changeMemberRole` — role dropdown change (`:208`).
- `space.removeMember` — kick a member (`:241`).

Danger tab:
- `space.delete` — destroy the space (`:49`).

## State & mutations
- Local state: `newName` (rename input, initialized from `space.name`); inside `AddMember`, `email` and `role` (default `"editor"`).
- Invalidations:
  - `space.update` (rename) -> `space.list` (`:53`).
  - `space.delete` -> `space.list` then navigate to `ROUTES.spaces` with `replace: true`.
  - `space.changeMemberRole`, `space.removeMember`, `space.addMembers` -> `space.memberList` scoped to current spaceId (`:211, 244, 274`).
- Toast feedback on every mutation via `sonner`.
- Permission gating:
  - Danger tab itself only renders when `isOwner` (`:66`) — `useIsOwner` from `@/hooks/useCurrentSpace`.
  - Delete button additionally wrapped in `PermissionGate roles={["owner"]}` (`:127-142`) with a `ConfirmDialog` requiring the user to type the space name.
  - `AddMember` form wrapped in `PermissionGate roles={["owner","editor"]}` (`:198-200`).
  - Role select and remove-member column render only when `isOwner` (`:164, 183-191`).
- The rename input also gates on `isOwner` — it disables for non-owners but is always visible.

## Conventions & gotchas
- The `MembersCard` table renders members from the raw `space.memberList` result with a permissive `m: any` cast (`:168`) — the shape uses snake_case (`first_name`, `last_name`, `avatar_file_id`) where most other procs return camelCase. Don't tidy the cast without aligning the proc.
- Delete uses `typedConfirmationText={space.name}` so accidental clicks are practically impossible.
- The personal sidebar omits Settings entirely; if you wire a deep-link to `/s/me/settings` it will route through `CurrentSpaceProvider` -> `SpaceLayout` -> this page but every mutation will fail because `space.id === "me"` is not a real space row.

## Cross-references
- Server: `apps/server/src/procedures/space/*` and `apps/server/src/procedures/auth/findUserByEmail.mts`.
- Web: member management mirrors the account-member surface in `pages/space/accounts/AccountDetailPage.tsx`.
