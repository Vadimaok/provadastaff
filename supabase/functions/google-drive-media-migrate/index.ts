import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://vadimaok.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const ALLOWED_BUCKETS = new Set(["provoda-messenger", "provoda-global-stories", "provoda-user-stories"]);
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
  "video/mp4", "video/webm", "video/quicktime",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function safeName(path: string, mime: string) {
  const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif",
    "image/heic":"heic", "video/mp4":"mp4", "video/webm":"webm", "video/quicktime":"mov" } as Record<string,string>)[mime] || "bin";
  const leaf = path.split("/").pop() || "media";
  const base = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80).replace(/\.[^.]+$/, "") || "media";
  return base + "." + ext;
}
async function getDriveToken() {
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive OAuth secrets are not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google Drive OAuth token refresh failed (" + response.status + ").");
  return String(data.access_token);
}
async function requireAdmin(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") || "";
  if (!url || !anon || !serviceKey || !auth.startsWith("Bearer ")) throw new Error("Supabase configuration or user session is missing.");
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) throw new Error("A valid signed-in session is required.");
  const { data: isAdmin, error: adminError } = await userClient.rpc("is_current_admin");
  if (adminError || isAdmin !== true) throw new Error("Administrator access is required.");
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  return { user: userData.user, service };
}
async function listCandidates(service: ReturnType<typeof createClient>) {
  async function allRows(table: string, columns: string, pathColumn: string) {
    const rows: any[] = [];
    for (let offset = 0; offset < 50000; offset += 500) {
      const { data, error } = await service.from(table).select(columns).not(pathColumn, "is", null).order("id").range(offset, offset + 499);
      if (error) throw new Error("Could not list " + table + ": " + error.message);
      rows.push(...(data || []));
      if ((data || []).length < 500) return rows;
    }
    throw new Error("Media inventory exceeded 50,000 rows; export in smaller reviewed batches.");
  }
  const [stories, messages] = await Promise.all([
    allRows("global_stories", "id,storage_path,media_type,created_at", "storage_path"),
    allRows("messenger_messages", "id,conversation_id,attachment_path,attachment_mime,created_at", "attachment_path"),
  ]);
  const candidates = [
    ...stories.map((row: any) => ({ bucket: "provoda-global-stories", path: row.storage_path, recordType: "global_story", recordId: row.id, mimeType: row.media_type, createdAt: row.created_at })),
    ...messages.map((row: any) => ({ bucket: "provoda-messenger", path: row.attachment_path, recordType: "messenger_attachment", recordId: row.id, conversationId: row.conversation_id, mimeType: row.attachment_mime, createdAt: row.created_at })),
  ];
  const unique = new Map<string, any>();
  for (const item of candidates) if (item.path) unique.set(item.bucket + "\n" + item.path, item);
  return [...unique.values()];
}
async function migrateOne(service: ReturnType<typeof createClient>, userId: string, bucket: string, path: string) {
  if (!ALLOWED_BUCKETS.has(bucket)) throw new Error("Unsupported source bucket.");
  if (!path || path.length > 1024 || path.startsWith("/") || path.split("/").some((part) => part === ".." || !part)) {
    throw new Error("Invalid source object path.");
  }
  let rowId: string;
  const { data: prior, error: priorError } = await service.from("provoda_drive_media")
    .select("id,drive_file_id,drive_file_name,mime_type,byte_size,sha256,migration_status")
    .eq("source_bucket", bucket).eq("source_path", path).maybeSingle();
  if (priorError) throw priorError;
  if (prior?.migration_status === "copied" || prior?.migration_status === "verified") return { alreadyCopied: true, ...prior };
  if (prior?.migration_status === "pending") throw new Error("This file already has a pending migration. Check the Drive folder and registry before retrying.");
  if (prior?.migration_status === "failed" && prior.drive_file_id) throw new Error("A Drive file already exists for this failed migration. Reconcile it before retrying to avoid duplicate files.");
  if (prior) {
    const { error } = await service.from("provoda_drive_media").update({ migration_status: "pending", created_by: userId }).eq("id", prior.id);
    if (error) throw error;
    rowId = prior.id;
  } else {
    const { data: reservation, error } = await service.from("provoda_drive_media")
      .insert({ source_bucket: bucket, source_path: path, created_by: userId, migration_status: "pending" })
      .select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("A migration for this source path was started concurrently. Refresh the registry before retrying.");
      throw error;
    }
    rowId = reservation.id;
  }

  let uploadedDriveId: string | null = null;
  try {
    const { data: signed, error: signedError } = await service.storage.from(bucket).createSignedUrl(path, 90);
    if (signedError || !signed?.signedUrl) throw new Error("Source object is unavailable in Supabase Storage.");
    const source = await fetch(signed.signedUrl, { redirect: "error" });
    if (!source.ok) throw new Error("Could not read source object (" + source.status + ").");
    const mime = (source.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const declaredLength = Number(source.headers.get("content-length") || 0);
    if (!ALLOWED_MIME.has(mime)) throw new Error("Unsupported source MIME type: " + (mime || "unknown"));
    if (declaredLength > MAX_BYTES) throw new Error("Source file exceeds the 100 MB migration limit.");
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error("Source file is empty or exceeds the 100 MB migration limit.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const fileName = safeName(path, mime);
    const token = await getDriveToken();
    const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
    if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");

    const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": mime, "x-upload-content-length": String(bytes.byteLength) },
      body: JSON.stringify({ name: fileName, mimeType: mime, parents: [folderId], appProperties: { provodaSourceBucket: bucket, provodaSourceSha256: sha256 } }),
    });
    if (!init.ok) throw new Error("Google Drive upload session could not be created (" + init.status + ").");
    const sessionUrl = init.headers.get("location");
    if (!sessionUrl || !sessionUrl.startsWith("https://www.googleapis.com/upload/drive/")) throw new Error("Google Drive returned an invalid upload session.");
    const uploaded = await fetch(sessionUrl, { method: "PUT", headers: { "content-type": mime, "content-length": String(bytes.byteLength) }, body: bytes });
    const driveData = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || !driveData.id) throw new Error("Google Drive upload failed (" + uploaded.status + ").");
    uploadedDriveId = String(driveData.id);

    // Verify the stored bytes, not just the Drive upload response metadata.
    const verifyResponse = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(uploadedDriveId) + "?alt=media&supportsAllDrives=true", {
      headers: { authorization: "Bearer " + token },
    });
    if (!verifyResponse.ok) throw new Error("Google Drive verification download failed (" + verifyResponse.status + ").");
    const verifiedBytes = new Uint8Array(await verifyResponse.arrayBuffer());
    const verifiedDigest = await crypto.subtle.digest("SHA-256", verifiedBytes);
    const verifiedSha256 = Array.from(new Uint8Array(verifiedDigest), (b) => b.toString(16).padStart(2, "0")).join("");
    if (verifiedBytes.byteLength !== bytes.byteLength || verifiedSha256 !== sha256) {
      throw new Error("Drive copy verification failed: byte size or SHA-256 does not match. Drive file ID: " + uploadedDriveId);
    }
    const { data: saved, error: saveError } = await service.from("provoda_drive_media").update({
      drive_file_id: uploadedDriveId, drive_file_name: fileName, mime_type: mime,
      byte_size: bytes.byteLength, sha256, migration_status: "verified", verified_at: new Date().toISOString(),
    }).eq("id", rowId).select("id,drive_file_id,drive_file_name,mime_type,byte_size,sha256,migration_status").single();
    if (saveError) throw new Error("Drive copy verified but registry update failed. Drive file ID for manual reconciliation: " + uploadedDriveId);
    return { alreadyCopied: false, ...saved };
  } catch (error) {
    if (uploadedDriveId) {
      await service.from("provoda_drive_media").update({ drive_file_id: uploadedDriveId, migration_status: "failed" }).eq("id", rowId);
    } else {
      await service.from("provoda_drive_media").update({ migration_status: "failed" }).eq("id", rowId);
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { user, service } = await requireAdmin(req);
    const body = await req.json();
    if (body?.action === "list-candidates") return json({ ok: true, candidates: await listCandidates(service) });
    if (body?.action === "health") {
      const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
      if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");
      const token = await getDriveToken();
      const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(folderId) + "?fields=id,name,mimeType&supportsAllDrives=true", {
        headers: { authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Google Drive folder check failed (" + response.status + ").");
      return json({ ok: true, drive: await response.json() });
    }
    if (body?.action !== "migrate-file") return json({ error: "Unsupported action." }, 400);
    const result = await migrateOne(service, user.id, String(body.bucket || ""), String(body.path || ""));
    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = /Administrator access|valid signed-in session|required/i.test(message) ? 403 : 400;
    console.error("google-drive-media-migrate:", message);
    return json({ error: message }, status);
  }
});
