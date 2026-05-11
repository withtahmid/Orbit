# File upload (R2)

> Three-step presigned upload to Cloudflare R2 plus per-purpose signed downloads; junction tables wire files to transactions and events.

## Components

Server (S3-compatible R2 client):

- `apps/server/src/services/r2/client.mts` — `createR2Service()` returns `{ createPresignedPut, createPresignedGet, headObject, deleteObject, getObjectBuffer, putObjectBuffer }`. PUT URLs expire in 10 min, GET URLs in 15 min (`client.mts:12-13`). Sets `requestChecksumCalculation/responseChecksumValidation: "WHEN_REQUIRED"` to work around R2's CRC32 rejection (`client.mts:31-34`).
- `apps/server/src/procedures/file/shared.mts` — `uploadablePurposeSchema` zod enum (`avatar`, `transaction_receipt`, `event_attachment`) and `PURPOSE_LIMITS`: avatar 5 MB image-only, the other two 20 MB images + PDFs. `buildR2Key(purpose, fileId)` returns `"<purpose>/<fileId>"`.
- Procedures (`apps/server/src/procedures/file/*.mts`):
  - `createUploadUrl.mts` — validates size/MIME against `PURPOSE_LIMITS`, inserts a `files` row with `status='pending'`, computes the R2 key, updates `r2_key`, signs a PUT URL.
  - `confirm.mts` — verifies the object exists via `headObject`, flips `status='confirmed'`, sets `confirmed_at`. For `purpose='avatar'`, runs `sharp` to produce a 256-px `image/webp` at `<key>` and a 64-px variant at `<key>-sm` (`confirm.mts:62-86`), and overwrites `mime_type='image/webp'`.
  - `getDownloadUrl.mts` — purpose-specific authorization (avatars are open to any authed user; receipts require space membership through `transaction_attachments`; event attachments mirror it; `exported_report` requires `uploaded_by === user.id`). Accepts `variant: "original" | "sm"` (only honored for `avatar`).
  - `delete.mts` — owner-only; deletes the `files` row, then best-effort R2 delete for `<key>` and `<key>-sm` (avatars).
  - `listForTransaction.mts`, `listForEvent.mts` — join `*_attachments → files` after a space-membership check.
  - `removeFromTransaction.mts` — owner/editor only (via `resolveSpaceMembership`); deletes the file row + R2 object.
  - `attach.mts` — `verifyFilesOwnedAndConfirmed`, `attachFilesToTransaction`, `attachFilesToEvent`. Called from inside transaction-create / event-create flows in their own routers.
- Router: `apps/server/src/routers/file.mts` exposes `createUploadUrl`, `confirm`, `getDownloadUrl`, `delete`, `listForTransaction`, `listForEvent`, `removeFromTransaction`.

Web:

- `apps/web/src/hooks/useFileUpload.ts` — single `upload(file, purpose)` that runs all three steps and returns the new `fileId`.
- `apps/web/src/hooks/useSignedUrl.ts` — TanStack-Query wrapper around `file.getDownloadUrl`; `staleTime: 12 * 60 * 1000` (refresh before the 15-min server TTL).
- `apps/web/src/components/file-upload-field.tsx` — generic field used by transactions and events (4× in `NewTransactionSheet.tsx`, 1× in `CreateOrEditEventDialog.tsx`).
- Consumers: avatars (`ProfilePage.tsx`), transaction receipts (`NewTransactionSheet.tsx`, `TransactionDetailsSheet.tsx`), event attachments (`CreateOrEditEventDialog.tsx`).

Tables (migrations 028 + 029):

- `files` — `id`, `r2_key UNIQUE`, `mime_type`, `size_bytes`, `original_name`, `purpose` (`__type_file_purpose` enum: `avatar | transaction_receipt | event_attachment | exported_report`), `status` (`__type_file_status`: `pending | confirmed`, default `pending`), `uploaded_by → users(id) ON DELETE SET NULL`, `confirmed_at`. Index on `uploaded_by`.
- `transaction_attachments(transaction_id, file_id)` — composite PK, both FKs `ON DELETE CASCADE`, index on `file_id`.
- `event_attachments(event_id, file_id)` — same shape.
- `users.avatar_file_id → files(id) ON DELETE SET NULL` (`029_add_attachment_tables.mts:5-9`; the older `users.avatar_url` column was dropped here).
- `exported_reports` table also lives in 029 but has no procedure surface yet.

## Flow

### Upload (client → server → R2)

1. Client calls `file.createUploadUrl` with `{ purpose, originalName, mimeType, sizeBytes }` (`useFileUpload.ts:14`). Server (`createUploadUrl.mts:17`) checks size + MIME against `PURPOSE_LIMITS`, inserts a `files` row (with a `__placeholder__` r2_key so the NOT NULL passes), generates the real key from the returned `id` via `buildR2Key`, updates the row, then `r2.createPresignedPut({ key })`. Response: `{ fileId, uploadUrl, expiresAt }`.
2. Client does a plain `fetch(uploadUrl, { method:"PUT", body: file, headers: { "Content-Type": file.type } })` (`useFileUpload.ts:21`). Direct browser → R2 — server bandwidth is not touched.
3. Client calls `file.confirm` with `{ fileId }`. Server (`confirm.mts:13`) loads the file row (ownership-checked via `uploaded_by`), short-circuits if already confirmed, `r2.headObject` to verify presence, runs avatar resize if `purpose='avatar'`, and writes `status='confirmed'` + `confirmed_at = NOW()`. The avatar branch also rewrites `mime_type='image/webp'` even if the user uploaded a PNG/JPEG.

### Attach to transaction/event

Transaction-create and event-create procedures (`procedures/transaction/*.mts`, `procedures/event/*.mts`) call `verifyFilesOwnedAndConfirmed` + `attachFilesToTransaction/Event` from `procedures/file/attach.mts` inside the same `qb.transaction()` that creates the parent row. Verification requires (a) `uploaded_by === user.id`, (b) `purpose` matches, (c) `status='confirmed'`.

### Download

`useSignedUrl(fileId, { variant })` calls `file.getDownloadUrl`. Server picks `<key>` or `<key>-sm` based on variant (sm only valid for avatar), runs purpose-specific authorization, signs a GET URL, returns `{ url, expiresAt, mimeType }`. Client refetches at 12 min to dodge the 15-min server TTL.

### Delete

Three exit paths: `file.delete` (orphan files), `file.removeFromTransaction` (preserves owner/editor gate), and the cascade-delete via `transaction_attachments`/`event_attachments` `ON DELETE CASCADE` when the parent is removed. The procedural deletes also best-effort `r2.deleteObject`; orphan R2 objects are tolerated (the DB row is the source of truth).

## Conventions & gotchas

- **`status='pending'` rows leak**: `createUploadUrl` always inserts a row; if the client crashes between steps 1 and 3, you get a `pending` `files` row with no R2 object. There is no sweep job yet — only confirmation flips status.
- **Avatar processing happens in `confirm`, not on PUT**: the uploaded blob is overwritten with the resized webp at the same key, plus a `-sm` variant. Re-confirming a different image at the same `fileId` would re-run sharp.
- **Purpose enum has 4 values, schema accepts 3**: `exported_report` exists in the DB enum and in `getDownloadUrl`'s authz branch, but `uploadablePurposeSchema` (`shared.mts:3`) excludes it — server-generated exports take a different path.
- **Junction PKs are `(parent_id, file_id)`**: a single file can only appear once on a given transaction/event, but the same file CAN technically be re-attached to different parents (the inserts in `attach.mts` don't enforce uniqueness across parents).
- **R2 SDK quirk**: the `requestChecksumCalculation: "WHEN_REQUIRED"` flag in `r2/client.mts:31-34` is load-bearing — without it, AWS SDK v3.729+ bakes a zero-byte CRC32 into the presigned URL and R2 rejects the real upload.
- **No multipart upload**: the 20 MB cap is hard; raising it requires switching to `CreateMultipartUpload` flow.

## Cross-references

- `./trpc-setup.md` — `authorizedProcedure` and the `ctx.services.r2` injection.
- `./db-layer.md` — `safeAwait` patterns used in every file procedure.
- `../server/transactions.md` (if present) for how `attachFilesToTransaction` is called.
