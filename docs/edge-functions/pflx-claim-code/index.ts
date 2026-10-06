// PFLX claim-code Edge Function (PATCH PLATFORM v261).
// Proves a player owns the email on their roster entry before they can claim
// the account: emails a 6-digit code (Gmail SMTP), verifies it server-side.
// Secrets (set by the host in Supabase > Edge Functions > Secrets):
//   GMAIL_USER, GMAIL_APP_PASSWORD   (Supabase injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS,
  normalizeEmail, isValidEmail, maskEmail, generateCode, hashCode,
  timingSafeEqual, rateLimitDecision, findRosterMatch, attemptDecision,
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

async function loadRoster(sb: ReturnType<typeof db>) {
  const { data, error } = await sb.from("app_data").select("data").eq("key", "pflx_mc_players").maybeSingle();
  if (error || !data) return [];
  const d = (data as any).data;
  return Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
}

function randomSalt() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sendMail(to: string, name: string, code: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return "email_not_configured";
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } },
  });
  try {
    const safeName = String(name || "Player").replace(/[<>&]/g, "");
    await client.send({
      from: `PFLX <${user}>`,
      to,
      subject: `Your PFLX claim code: ${code}`,
      content: `Hi ${safeName},\n\nYour PFLX account claim code is ${code}\n\nIt expires in 10 minutes. After you enter it you will be asked to choose your own new PIN.\n\nIf you did not request this, you can ignore this email.\n\n- PFLX`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px"><p>Hi ${safeName},</p><p>Your PFLX account claim code is</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:12px 0">${code}</p><p>It expires in 10 minutes. After you enter it you will be asked to choose your own new PIN.</p><p style="color:#666">If you did not request this, you can ignore this email.</p><p>- PFLX</p></div>`,
    });
    return "ok";
  } catch (e) {
    console.error("smtp_failed", String((e as Error)?.message || e));
    return "send_failed";
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

async function handleRequest(body: any) {
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);
  const sb = db();
  const roster = await loadRoster(sb);
  const match = findRosterMatch(roster, email, body.playerId ? String(body.playerId) : "");
  if (!match) return json({ ok: false, error: "no_match" }, 404);

  const now = Date.now();
  const since = new Date(now - 15 * 60 * 1000).toISOString();
  const { data: recent } = await sb.from("pflx_claim_codes").select("created_at").eq("email", email).gte("created_at", since);
  const times = (recent || []).map((r: any) => new Date(r.created_at).getTime());
  const rl = rateLimitDecision(times, now);
  if (!rl.ok) return json(rl, 429);

  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = generateCode(buf[0]);
  const salt = randomSalt();
  const code_hash = await hashCode(code, salt, email);
  const { data: ins, error: insErr } = await sb.from("pflx_claim_codes").insert({
    email, player_id: match.id || null, code_hash, salt, expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  }).select("id").single();
  if (insErr || !ins) return json({ ok: false, error: "server_error" }, 500);

  const sent = await sendMail(email, match.brandName || match.brand || match.name, code);
  if (sent !== "ok") {
    await sb.from("pflx_claim_codes").delete().eq("id", (ins as any).id);
    return json({ ok: false, error: sent }, sent === "email_not_configured" ? 503 : 502);
  }
  return json({ ok: true, masked: maskEmail(email), playerId: match.id, expiresInSec: CODE_TTL_MS / 1000, resendInSec: RESEND_COOLDOWN_MS / 1000 });
}

async function handleVerify(body: any) {
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").replace(/\s+/g, "");
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return json({ ok: false, error: "invalid_input" }, 400);
  const sb = db();
  const { data: rows } = await sb.from("pflx_claim_codes").select("*").eq("email", email).eq("used", false)
    .order("created_at", { ascending: false }).limit(1);
  const row: any = rows && rows[0];
  const now = Date.now();
  if (!row) return json({ ok: false, error: "expired" }, 410);
  const decision = attemptDecision({ used: row.used, attempts: row.attempts, expires_at_ms: new Date(row.expires_at).getTime() }, now);
  if (decision === "expired") return json({ ok: false, error: "expired" }, 410);
  if (decision === "locked") return json({ ok: false, error: "locked" }, 429);

  const attempted = await hashCode(code, row.salt, email);
  if (!timingSafeEqual(attempted, row.code_hash)) {
    const attempts = (row.attempts || 0) + 1;
    await sb.from("pflx_claim_codes").update({ attempts }).eq("id", row.id);
    return json({ ok: false, error: "wrong_code", attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) }, 401);
  }
  await sb.from("pflx_claim_codes").update({ used: true }).eq("id", row.id);
  return json({ ok: true, playerId: row.player_id });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: "bad_json" }, 400); }
  try {
    if (body.action === "request") return await handleRequest(body);
    if (body.action === "verify") return await handleVerify(body);
    return json({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    console.error("unhandled", String((e as Error)?.message || e));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
