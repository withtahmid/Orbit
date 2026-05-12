---
name: role_cast_pattern
description: Kysely codegens enum role columns as `ArrayType<"owner"|"editor"|"viewer">`; the codebase uses `"owner" as unknown as SpaceMembers["role"]` casts everywhere.
metadata:
  type: project
---

`types.mts` represents the Postgres enum `__type_space_user_role` as `ArrayType<"editor" | "owner" | "viewer">` (kysely-codegen treats the synthesized `__type_*` types as arrays of the union members). At runtime they're plain strings.

Procedures route around this with:
```
"owner" as unknown as SpaceMembers["role"]
```

**Why:** Avoids touching codegen output. Tolerable because the actual SQL value is a string.

**How to apply:** When auditing, the cast itself isn't the bug — but watch for:
- Comparisons mixed-mode (`membership.role === ("owner" as unknown as SpaceMembers["role"])` returns true only if both reduce to the same string at runtime — works today, but the cast hides that comparing arrays would silently fail if codegen ever produced a real tuple).
- `where("role", "in", ["owner"])` vs casted array — Kysely's typed `in` may complain about the literal but works at runtime; if you see one place using the cast and the next not (e.g. `removeMember.mts:34,41` uses raw `["owner"]`), that's an inconsistency, not a bug.
