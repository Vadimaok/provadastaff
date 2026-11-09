import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/google-drive-media.sql", "utf8");
const fn = readFileSync("supabase/functions/google-drive-media-migrate/index.ts", "utf8");
const runner = readFileSync("scripts/migrate-drive-media.mjs", "utf8");
const docs = readFileSync("supabase/GOOGLE-DRIVE-MEDIA.md", "utf8");

assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public\.provoda_drive_media from anon, authenticated/i);
assert.match(sql, /grant all on public\.provoda_drive_media to service_role/i);
assert.match(fn, /rpc\("is_current_admin"\)/);
assert.match(fn, /createSignedUrl\(path, 90\)/);
assert.match(fn, /SHA-256/);\nassert.match(fn, /verifiedBytes.byteLength !== bytes.byteLength/);\nassert.match(fn, /migration_status: "verified"/);\nassert.match(fn, /list-candidates/);\nassert.match(fn, /allRows\("messenger_messages"/);
assert.match(fn, /uploadType=resumable/);
assert.doesNotMatch(fn, /permissions\.create|anyone/);
assert.match(fn, /MAX_BYTES = 100 \* 1024 \* 1024/);
assert.match(runner, /const execute = args\.includes\("--execute"\)/);
assert.match(runner, /if \(!execute\)/);
assert.match(docs, /does not delete old Supabase files/i);
console.log("Google Drive media migration safety checks passed.");
