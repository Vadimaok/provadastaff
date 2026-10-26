import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-push-webhook-secret") !== expected) {
    return new Response("Unauthorized webhook", { status: 401, headers: cors });
  }
  try {
    const event = await req.json();
    const record = event?.record || event?.data?.record || {};
    const table = event?.table || event?.data?.table || "";
    if (event?.type && event.type !== "INSERT") return Response.json({ ignored: true }, { headers: cors });
    let targetUser: string | null = null;
    let title = "Provoda Staff";
    let body = "У тебя новое уведомление.";
    let force = false;
    if (table === "user_notifications") {
      targetUser = record.user_id || null;
      title = record.title || "Provoda Staff";
      body = record.body || "У тебя новое уведомление.";
    } else if (table === "app_update_notices") {
      targetUser = record.target_user_id || null;
      title = record.force_update ? "Требуется обновление Provoda Staff" : "Доступно обновление Provoda Staff";
      body = record.notice_message || ("Доступна версия " + (record.target_version || "") + ". Открой приложение для обновления.");
      force = Boolean(record.force_update);
    } else {
      return Response.json({ ignored: true, reason: "unsupported_table" }, { headers: cors });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rawServiceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!url || !serviceKey || !rawServiceAccount) throw new Error("Missing Supabase or Firebase secrets");
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    let query = db.from("push_tokens").select("id,token,user_id").eq("active", true);
    if (targetUser) query = query.eq("user_id", targetUser);
    const { data: devices, error } = await query;
    if (error) throw error;
    if (!devices?.length) return Response.json({ sent: 0, reason: "no_registered_devices" }, { headers: cors });

    const sa = JSON.parse(rawServiceAccount);
    const key = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(sa.token_uri || "https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const authResponse = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });
    const authData = await authResponse.json();
    if (!authResponse.ok || !authData.access_token) throw new Error("Firebase OAuth failed: " + JSON.stringify(authData));
    const results = await Promise.all(devices.map(async (device: { id: string; token: string }) => {
      const response = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
        method: "POST",
        headers: { authorization: "Bearer " + authData.access_token, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title, body },
            data: { kind: table === "app_update_notices" ? "app_update" : "notification", force_update: String(force) },
            android: { priority: "HIGH", notification: { channel_id: "provoda_updates", sound: "default", default_vibrate_timings: true } }
          }
        })
      });
      const responseBody = await response.text();
      if (!response.ok && (response.status === 404 || response.status === 400) && /UNREGISTERED|registration-token-not-registered|invalid-registration-token/i.test(responseBody)) {
        await db.from("push_tokens").update({ active: false, updated_at: new Date().toISOString() }).eq("id", device.id);
      }
      return { ok: response.ok, status: response.status };
    }));
    return Response.json({ sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length }, { headers: cors });
  } catch (error) {
    console.error("send-push failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: cors });
  }
});
