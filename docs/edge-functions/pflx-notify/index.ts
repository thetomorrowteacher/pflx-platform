// PFLX notify Edge Function (PATCH PLATFORM v269).
// Emails a player when (a) a task is approved for them and (b) they receive a
// digital coin (badge). The browser only says WHAT happened (playerId + taskId
// or badgeId); this function re-checks it against the stored data, builds the
// email text itself, de-duplicates, rate-limits, and honours opt-outs. Nothing
// the client sends is ever used as email content or as a recipient.
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD (same ones pflx-claim-code uses).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  normalizeEmail, isValidEmail, cleanId, itemsOf, badgeHolding, resolveBadge,
  verifyTaskApproval, rateDecision, existingDecision, eventKeyTask, eventKeyCoin,
  buildTaskEmail, buildCoinEmail, SITE_URL,
} from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function db() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

async function getKey(sb: ReturnType<typeof db>, key: string) {
  const { data, error } = await sb.from("app_data").select("data").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return (data as any).data;
}

async function hmacToken(playerId: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("pflx-notify-unsub:" + playerId));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sendMail(to: string, mail: { subject: string; text: string; html: string }) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return "email_not_configured";
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } },
  });
  try {
    await client.send({ from: `PFLX <${user}>`, to, subject: mail.subject, content: mail.text, html: mail.html });
    return "ok";
  } catch (e) {
    console.error("smtp_failed", String((e as Error)?.message || e));
    return "send_failed";
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

// Claim the right to send one event. Returns the row to update, or a response.
async function claimEvent(sb: ReturnType<typeof db>, eventKey: string, kind: string, playerId: string, email: string) {
  const now = Date.now();
  const ins = await sb.from("pflx_notifications").insert({ event_key: eventKey, kind, player_id: playerId, email, status: "pending", attempts: 1 });
  if (!ins.error) return { claimed: true };
  const { data: row } = await sb.from("pflx_notifications").select("*").eq("event_key", eventKey).maybeSingle();
  const decision = existingDecision(row as any, now);
  if (decision === "deduped") return { claimed: false, res: json({ ok: true, deduped: true }) };
  if (decision === "inflight") return { claimed: false, res: json({ ok: true, deduped: true, inflight: true }) };
  if (decision === "gave_up") return { claimed: false, res: json({ ok: false, error: "gave_up" }) };
  // retry: only one caller wins the flip back to pending
  const upd = await sb.from("pflx_notifications")
    .update({ status: "pending", attempts: ((row as any).attempts || 0) + 1, created_at: new Date().toISOString(), error: null })
    .eq("event_key", eventKey).eq("status", (row as any).status).select("event_key");
  if (upd.error || !upd.data || !upd.data.length) return { claimed: false, res: json({ ok: true, deduped: true, inflight: true }) };
  return { claimed: true };
}

async function deliver(sb: ReturnType<typeof db>, eventKey: string, playerId: string, email: string, mail: any) {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: perPlayer }, { count: perDay }] = await Promise.all([
    sb.from("pflx_notifications").select("event_key", { count: "exact", head: true }).eq("player_id", playerId).eq("status", "sent").gte("sent_at", hourAgo),
    sb.from("pflx_notifications").select("event_key", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", dayAgo),
  ]);
  const rl = rateDecision(perPlayer || 0, perDay || 0);
  if (!rl.ok) {
    await sb.from("pflx_notifications").update({ status: rl.error, error: rl.error }).eq("event_key", eventKey);
    return json({ ok: false, error: rl.error }, 429);
  }
  const sent = await sendMail(email, mail);
  if (sent !== "ok") {
    await sb.from("pflx_notifications").update({ status: "failed", error: sent }).eq("event_key", eventKey);
    return json({ ok: false, error: sent }, sent === "email_not_configured" ? 503 : 502);
  }
  await sb.from("pflx_notifications").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("event_key", eventKey);
  return json({ ok: true, sent: true });
}

async function handleEvent(body: any) {
  const action = String(body.action || "");
  const playerId = cleanId(body.playerId);
  if (!playerId) return json({ ok: false, error: "invalid_input" }, 400);
  const sb = db();

  const roster = itemsOf(await getKey(sb, "pflx_mc_players"));
  const player: any = roster.find((p: any) => p && p.id === playerId);
  if (!player) return json({ ok: false, error: "no_player" }, 404);
  const email = normalizeEmail(player.email);
  if (!isValidEmail(email)) return json({ ok: false, error: "no_email" });
  if (/admin|host|teacher|instructor/i.test(String(player.role || ""))) return json({ ok: true, skipped: "staff" });

  const { data: opt } = await sb.from("pflx_notify_optout").select("player_id").eq("player_id", playerId).maybeSingle();
  if (opt) return json({ ok: true, skipped: "optout" });

  const unsubUrl = `${SITE_URL}/?pflx_unsub=${encodeURIComponent(playerId)}&t=${await hmacToken(playerId)}`;
  const who = player.brandName || player.brand || player.name || "Player";

  if (action === "task_approved") {
    const taskId = cleanId(body.taskId);
    if (!taskId) return json({ ok: false, error: "invalid_input" }, 400);
    const task: any = itemsOf(await getKey(sb, "pflx_mc_tasks")).find((t: any) => t && t.id === taskId);
    const v = verifyTaskApproval(task, playerId, player);
    if (!v.ok) return json({ ok: false, error: "not_verified", reason: v.reason }, 409);
    const key = eventKeyTask(taskId, playerId);
    const c = await claimEvent(sb, key, "task_approved", playerId, email);
    if (!c.claimed) return (c as any).res;
    const mail = buildTaskEmail({ name: who, title: task.title, xc: task.xcReward, unsubUrl });
    return await deliver(sb, key, playerId, email, mail);
  }

  if (action === "coin") {
    const badgeId = cleanId(body.badgeId);
    if (!badgeId) return json({ ok: false, error: "invalid_input" }, 400);
    const { data: row } = await sb.from("app_data").select("data").eq("key", `pflx_player_${playerId}`).maybeSingle();
    const hold = badgeHolding([player, row ? (row as any).data : null], badgeId);
    if (!hold.has) return json({ ok: false, error: "not_verified", reason: "badge_not_held" }, 409);
    const catalog = itemsOf(await getKey(sb, "pflx_mc_badges"));
    const b = resolveBadge(catalog, badgeId, hold.nameFromRecord);
    const key = eventKeyCoin(playerId, badgeId, hold.endorsements);
    const c = await claimEvent(sb, key, "coin", playerId, email);
    if (!c.claimed) return (c as any).res;
    const mail = buildCoinEmail({ name: who, badgeName: b.name, xc: b.xc, endorsements: hold.endorsements, unsubUrl });
    return await deliver(sb, key, playerId, email, mail);
  }

  return json({ ok: false, error: "bad_action" }, 400);
}

async function handleUnsubscribe(body: any) {
  const playerId = cleanId(body.playerId);
  const token = String(body.token || "");
  if (!playerId || !token) return json({ ok: false, error: "invalid_input" }, 400);
  if (!sameToken(token, await hmacToken(playerId))) return json({ ok: false, error: "bad_token" }, 403);
  const sb = db();
  const roster = itemsOf(await getKey(sb, "pflx_mc_players"));
  const player: any = roster.find((p: any) => p && p.id === playerId);
  await sb.from("pflx_notify_optout").upsert({ player_id: playerId, email: player ? normalizeEmail(player.email) : null });
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: "bad_json" }, 400); }
  try {
    if (body.action === "task_approved" || body.action === "coin") return await handleEvent(body);
    if (body.action === "unsubscribe") return await handleUnsubscribe(body);
    return json({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    console.error("unhandled", String((e as Error)?.message || e));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
