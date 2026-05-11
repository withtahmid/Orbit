# file module (server)

> Two-phase file upload to Cloudflare R2 (presigned PUT then confirm) plus download URL signing, deletion, and listing attachments by transaction/event. Generates a `-sm` WebP thumbnail for avatars during confirm. Linkage to transactions/events is via attach helpers used from those modules.

## Router
- File: `apps/server/src/routers/file.mts:10`
- Composes procedures:
  - `file.createUploadUrl` — register a pending file row and return a presigned R2 PUT URL.
  - `file.confirm` — verify the upload landed in R2, mark `confirmed`, and post-process avatars.
  - `file.getDownloadUrl` — return a presigned GET URL, role-gated by purpose.
  - `file.delete` — hard-delete the file row and the R2 object(s).
  - `file.listForTransaction` — list attachments for a transaction (space members only).
  - `file.listForEvent` — list attachments for an event (space members only).
  - `file.removeFromTransaction` — detach + delete a file from a transaction.

## Procedures
- **`createUploadUrl`** (`procedures/file/createUploadUrl.mts:8`) — Auth: authorized. Input: `{ purpose ∈ ('avatar'|'transaction_receipt'|'event_attachment'), originalName, mimeType, sizeBytes }`. Enforces `PURPOSE_LIMITS` (`shared.mts:13`): avatars ≤ 5 MB, receipts/event attachments ≤ 20 MB; avatars must be `image/{jpeg,png,webp,gif}`; receipts/events additionally allow `application/pdf`. Throws `PAYLOAD_TOO_LARGE` or `BAD_REQUEST` on violation. Inserts a `files` row with `status='pending'` (uses `__placeholder__` as the initial `r2_key` because the `id` is needed to build the real key), then UPDATEs `r2_key = '${purpose}/${id}'` via `buildR2Key`, then asks R2 for a presigned PUT URL (`PUT_URL_TTL_SECONDS = 600`). Returns `{ fileId, uploadUrl, expiresAt }`.
- **`confirmUpload`** (`procedures/file/confirm.mts:11`) — Auth: authorized; the file must be owned by the caller (`uploaded_by = ctx.auth.user.id`). Idempotent: if already `confirmed`, returns immediately. Calls `r2.headObject` to verify the upload exists (throws `BAD_REQUEST` otherwise). If `purpose='avatar'`, runs `generateAvatarVariants` — uses `sharp` to produce a 256x256 main WebP (cover-fit, rotates by EXIF) and a 64x64 `-sm` WebP, overwrites the original key with the main, and writes the small variant to `${key}-sm`. Then UPDATEs `status='confirmed'`, `confirmed_at = now()`, and (for avatars) `mime_type='image/webp'`.
- **`getDownloadUrl`** (`procedures/file/getDownloadUrl.mts:6`) — Auth: authorized, role-gated by `purpose`. Input: `{ fileId, variant ∈ ('original'|'sm') = 'original' }`. Loads the file; rejects unless `status='confirmed'`. Access rules: `avatar` → any logged-in user; `transaction_receipt` → caller must be a member of the transaction's space; `event_attachment` → member of the event's space; `exported_report` → only `uploaded_by` (rows for this purpose are not created by this module — see `exported_reports` table). For `variant='sm'` AND `purpose='avatar'`, signs `${r2_key}-sm`; otherwise signs `r2_key`. Returns `{ url, expiresAt, mimeType }` with `GET_URL_TTL_SECONDS = 900`.
- **`deleteFile`** (`procedures/file/delete.mts:6`) — Auth: authorized; owner-only (`uploaded_by = ctx.auth.user.id`). Deletes the `files` row, then best-effort deletes `r2_key` (and `${r2_key}-sm` if `purpose='avatar'`) from R2. R2 deletion errors are swallowed — orphan objects are accepted as cleanup-job material.
- **`listAttachmentsForTransaction`** (`procedures/file/listForTransaction.mts:5`) — Auth: any member of the transaction's space. Returns `[{ id, mimeType, originalName, sizeBytes, createdAt }]` ordered by `files.created_at ASC`.
- **`listAttachmentsForEvent`** (`procedures/file/listForEvent.mts:5`) — Same as above for events.
- **`removeFileFromTransaction`** (`procedures/file/removeFromTransaction.mts:8`) — Auth: owner or editor of the transaction's space (via `resolveSpaceMembership`). Input: `{ transactionId, fileId }`. Looks up the join row; deletes the `files` row (cascades remove `transaction_attachments`); best-effort R2 cleanup. Throws `NOT_FOUND` if the file isn't actually attached to that transaction.

## Database tables
- **`files`** (`migrations/028_create_files_table.mts`). Columns: `id uuid PK`, `r2_key text UNIQUE NOT NULL`, `mime_type varchar(127)`, `size_bytes bigint`, `original_name varchar(255)`, `purpose` enum `__type_file_purpose ('avatar','transaction_receipt','event_attachment','exported_report')`, `status` enum `__type_file_status ('pending','confirmed') DEFAULT 'pending'`, `uploaded_by uuid → users.id ON DELETE SET NULL`, `created_at`, `confirmed_at`. Index on `uploaded_by`.
- **`transaction_attachments`** (`migrations/029_add_attachment_tables.mts`). Composite PK `(transaction_id, file_id)`. `transaction_id → transactions.id ON DELETE CASCADE`, `file_id → files.id ON DELETE CASCADE`, `created_at`. Index on `file_id`.
- **`event_attachments`** (`migrations/029_add_attachment_tables.mts`). Same shape as `transaction_attachments` but joins to `events`.
- **`exported_reports`** (`migrations/029_add_attachment_tables.mts`). `id`, `file_id → files.id CASCADE`, `user_id → users.id CASCADE`, `kind varchar(64)`, `params_json jsonb`, `generated_at`. Indexed on `user_id`. Created/consumed by the analytics export flow, not this module.

## Conventions & gotchas
- The R2 key layout is `${purpose}/${fileId}` (`shared.mts:22`). For avatars, the thumbnail uses the suffix `-sm` appended to the same key — so the small variant is `avatar/${id}-sm`. The DB does not store the variant key; consumers reconstruct it.
- `createUploadUrl` does a two-step INSERT-then-UPDATE because the `r2_key` is `NOT NULL UNIQUE` but depends on the row's id (`createUploadUrl.mts:36-66`). The placeholder `__placeholder__` only ever exists for a single row at a time (uniqueness would block a second concurrent caller — note this if you ever see a uniqueness failure on `r2_key`).
- The R2 client (`services/r2/client.mts:32`) is configured with `requestChecksumCalculation: "WHEN_REQUIRED"` because R2 rejects the CRC32 checksum that AWS SDK v3.729+ bakes into presigned URLs by default. Don't remove that setting.
- `confirmUpload` is the only path that promotes `status` from `pending` to `confirmed`; attach helpers (`procedures/file/attach.mts:12`) require `status='confirmed'`. Re-confirming a confirmed file is a no-op.
- Avatar processing **overwrites the original R2 object** with the resized WebP (`procedures/file/confirm.mts:83`). The originally-uploaded image is not retained. `mime_type` is forced to `image/webp` on the file row after this.
- Role/access checks differ per procedure: `confirm` and `delete` gate by `uploaded_by`; `removeFromTransaction` gates by space role (owner/editor); listings gate by any space membership; `getDownloadUrl` has per-purpose rules including a public-to-logged-in-users path for avatars.
- The attach helpers in `procedures/file/attach.mts` (`verifyFilesOwnedAndConfirmed`, `attachFilesToTransaction`, `attachFilesToEvent`) are not exposed via tRPC — they're imported by the `transaction` and `event` modules during their own mutations.
- Attachment join rows cascade-delete from either side. Deleting the `files` row in `deleteFile` / `removeFileFromTransaction` therefore also cleans `transaction_attachments` / `event_attachments`.

## Cross-references
- `apps/server/src/services/r2/client.mts` — the S3-compatible client used for all presigned URL signing, head, get/put buffer, and delete.
- `apps/server/src/procedures/file/attach.mts` — shared `verifyFilesOwnedAndConfirmed` + attach helpers consumed by transaction/event create/update procedures.
- `contexts/modules/server/user.md` — `user.updateAvatar` is the only consumer of `purpose='avatar'` files.
- `contexts/modules/server/space.md` — `resolveSpaceMembership` is used by `removeFromTransaction` for the role check.
