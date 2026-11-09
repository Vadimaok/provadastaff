# Google Drive media migration (staged, no cutover)

This PR introduces a **copy-only migration foundation**. It does not change how Provoda Staff uploads, reads, or deletes media today.

## Why this is staged

- Existing Supabase Storage remains the live source of truth.
- Google Drive copies are private; the migration function does not create public links or permissions.
- The source objects and all application rows remain untouched.
- A registry stores the source bucket/path, Drive file ID, size, MIME type and SHA-256.
- Re-running the same source path is idempotent: an existing registry entry is returned instead of uploading a second copy.
- No automatic source deletion, URL rewrite, or production schema change occurs until the SQL and Edge Function are manually deployed.

## Google account setup

Use a dedicated Google account for Provoda Staff with enough Drive storage. Create a Google Cloud project, enable the Google Drive API, configure an OAuth consent screen, and create an OAuth client. Obtain an offline refresh token with the narrow `https://www.googleapis.com/auth/drive.file` scope (`access_type=offline`, `prompt=consent`). The Edge Function creates the private destination folder itself, so the app only needs access to files it creates rather than the whole Drive. Keep the client secret and refresh token private.

A service account alone is **not** a valid owner for files in a normal personal "My Drive": service accounts have no personal Drive storage quota. For a Workspace Shared Drive, service-account access is possible when the account is a member and the API calls support shared drives. This implementation uses OAuth refresh-token credentials so it also works with a dedicated consumer Google account.

After deploying the function, call `{ "action": "create-folder" }` once with an admin session, then save the returned folder ID as `GOOGLE_DRIVE_FOLDER_ID`. The folder is created by the OAuth app and is accessible under the `drive.file` scope. Do not share it publicly or with all employees.

## Supabase setup (manual approval required)

1. Review and run `supabase/google-drive-media.sql` in the intended Supabase project. It creates only a new RLS-protected migration registry and grants table access only to `service_role`.
2. Deploy `supabase/functions/google-drive-media-migrate/index.ts` as the function `google-drive-media-migrate`.
3. Configure these Edge Function secrets in Supabase (never commit them):
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_FOLDER_ID`
   - Existing Supabase function environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Optional `APP_ORIGIN` (exact production app origin)
4. Set the Google OAuth consent screen to Production for a long-running integration, or use an eligible internal Workspace app. Google documents that external apps left in Testing issue refresh tokens that expire after 7 days for Drive scopes. Refresh tokens can also be revoked or expire for other policy reasons; the function surfaces reauthorization failures.
5. The signed-in caller must be an administrator according to the existing `is_current_admin()` function. The Edge Function does not accept a client-supplied owner ID.
6. Call the function with `{ "action": "create-folder" }` once, save the returned folder ID in the `GOOGLE_DRIVE_FOLDER_ID` secret, then call `{ "action": "health" }` to verify access.

## Gradual copy process

Export a local manifest from the existing application records (the script reads only paths from `global_stories` and `messenger_messages`; it does not export message bodies or user content):\n\n```bash\nSUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_USER_ACCESS_TOKEN=... \
  node scripts/migrate-drive-media.mjs --export\n```\n\nReview the generated local manifest. It is not committed. It contains only known Storage object paths:

```json
[
  { "bucket": "provoda-global-stories", "path": "USER_UUID/OBJECT.jpg" },
  { "bucket": "provoda-messenger", "path": "CONVERSATION_UUID/USER_UUID/OBJECT.jpg" }
]
```

Run a dry run first:

```bash
node scripts/migrate-drive-media.mjs ./media-manifest.json
```

Only after reviewing the paths and confirming the destination folder, run:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_USER_ACCESS_TOKEN=... \
  node scripts/migrate-drive-media.mjs ./media-manifest.json --execute
```

The script processes files sequentially. The registry reserves each source path before copying to prevent concurrent duplicate uploads. Failed entries without a Drive file ID can be retried; entries with a Drive file ID are held for manual reconciliation to prevent duplicates. The export paginates the live `messenger_messages` and `global_stories` tables in bounded batches and currently covers messenger attachments and global stories. User stories from the separate unmerged stories PR and product catalog external image links are not included. Each source object is limited to 100 MB and supported image/video MIME types. Large uploads use Drive's resumable upload protocol. The function downloads the Drive copy again and compares both byte size and SHA-256 before marking a record `verified`. Drive API quotas/rate limits still apply; keep batches modest and retry failed entries individually.

## What this PR intentionally does not do

- Does not make Drive files public or expose Drive URLs to the browser.
- Does not replace existing Supabase Storage uploads or signed-URL reads.
- Does not rewrite `global_stories.storage_path`, messenger attachment paths, or any other application data.
- Does not delete old Supabase files.
- A file is marked `verified` only after the Drive copy is downloaded again and its byte size and SHA-256 match the source; failed verification keeps the source untouched.
- Does not migrate product photos or arbitrary external links.

A follow-up cutover PR must add a server-side media delivery proxy that checks the actual message/story authorization before streaming private Drive content (including HTTP Range for video), then update each app surface to use provider-neutral media IDs. Only after real-device tests and byte-for-byte verification should a separate, explicitly approved cleanup process consider deleting legacy objects.
