#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const exportOnly = args.includes("--export");
const manifestArg = args.find((arg) => !arg.startsWith("--")) || "./provoda-drive-media-manifest.json";
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const endpoint = supabaseUrl ? supabaseUrl.replace(/\/+$/, "") + "/functions/v1/google-drive-media-migrate" : "";
async function callAdmin(payload) {
  if (!supabaseUrl || !anonKey || !accessToken) {
    throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_ACCESS_TOKEN in your local environment.");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anonKey, authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "Edge Function returned HTTP " + response.status);
  return result;
}

if (exportOnly) {
  const manifestMap = new Map();
  let offset = 0;
  for (;;) {
    const page = await callAdmin({ action: "list-candidates", offset, limit: 250 });
    for (const item of page.candidates || []) {
      manifestMap.set(item.bucket + String.fromCharCode(10) + item.path, { bucket: item.bucket, path: item.path });
    }
    if (page.nextOffset === null || page.nextOffset === undefined) break;
    offset = page.nextOffset;
  }
  const manifest = [...manifestMap.values()];
  await writeFile(manifestArg, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log("Exported", manifest.length, "referenced media objects to", manifestArg);
  console.log("No files were copied. Review this manifest before running with --execute.");
  process.exit(0);
}

if (!args.some((arg) => !arg.startsWith("--"))) {
  console.error("Usage: node scripts/migrate-drive-media.mjs <manifest.json> [--execute]");
  console.error("       node scripts/migrate-drive-media.mjs [manifest.json] --export");
  process.exit(2);
}
const manifest = JSON.parse(await readFile(manifestArg, "utf8"));
if (!Array.isArray(manifest) || manifest.some((x) => !x || typeof x.bucket !== "string" || typeof x.path !== "string")) {
  throw new Error("Manifest must be a JSON array of { bucket, path } entries.");
}
const unique = [...new Map(manifest.map((x) => [x.bucket + String.fromCharCode(10) + x.path, x])).values()];
console.log("Google Drive migration", execute ? "EXECUTION MODE" : "DRY RUN");
console.log("Files in manifest:", unique.length);
for (const item of unique) console.log("-", item.bucket + "/" + item.path);
if (!execute) {
  console.log("");
  console.log("No files were uploaded. Add --execute only after reviewing the manifest and configuring secrets.");
  process.exit(0);
}
for (const [index, item] of unique.entries()) {
  try {
    const result = await callAdmin({ action: "migrate-file", bucket: item.bucket, path: item.path });
    console.log("VERIFIED", index + 1 + "/" + unique.length, item.bucket + "/" + item.path, "=>", result.result.drive_file_id || "(already verified)");
  } catch (error) {
    console.error("FAILED", index + 1, item.bucket + "/" + item.path, error.message);
    process.exitCode = 1;
    break;
  }
}
