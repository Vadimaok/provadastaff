#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const manifestArg = args.find((arg) => !arg.startsWith("--"));
if (!manifestArg) {
  console.error("Usage: node scripts/migrate-drive-media.mjs <manifest.json> [--execute]");
  process.exit(2);
}
const manifest = JSON.parse(await readFile(manifestArg, "utf8"));
if (!Array.isArray(manifest) || manifest.some((x) => !x || typeof x.bucket !== "string" || typeof x.path !== "string")) {
  throw new Error("Manifest must be a JSON array of { bucket, path } entries.");
}
const unique = [...new Map(manifest.map((x) => [x.bucket + "\n" + x.path, x])).values()];
console.log("Google Drive migration", execute ? "EXECUTION MODE" : "DRY RUN");
console.log("Files in manifest:", unique.length);
for (const item of unique) console.log("-", item.bucket + "/" + item.path);
if (!execute) {
  console.log("\nNo files were uploaded. Add --execute only after reviewing the manifest and configuring secrets.");
  process.exit(0);
}
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!supabaseUrl || !anonKey || !accessToken) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_ACCESS_TOKEN in your local environment.");
const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/google-drive-media-migrate";
for (const [index, item] of unique.entries()) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anonKey, authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({ action: "migrate-file", bucket: item.bucket, path: item.path }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    console.error("FAILED", index + 1, item.bucket + "/" + item.path, result.error || response.status);
    process.exitCode = 1;
    break;
  }
  console.log("COPIED", index + 1 + "/" + unique.length, item.bucket + "/" + item.path, "=>", result.result.drive_file_id);
}
