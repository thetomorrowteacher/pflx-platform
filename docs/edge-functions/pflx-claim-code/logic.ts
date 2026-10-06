// @ts-nocheck
// PFLX claim-code logic -- pure helpers (no I/O) so they can be unit-tested
// in Node by stripping the `export` keywords. Kept free of TypeScript-only
// syntax on purpose for exactly that reason.

export const CODE_TTL_MS = 10 * 60 * 1000;        // a code is good for 10 minutes
export const MAX_ATTEMPTS = 5;                    // wrong guesses before the code locks
export const RESEND_COOLDOWN_MS = 45 * 1000;      // min gap between sends to one email
export const WINDOW_MS = 15 * 60 * 1000;          // rate-limit window
export const MAX_SENDS_PER_WINDOW = 3;            // sends per email per window

export function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
}

// ej*****@asdubai.org -- enough for the player to recognise their own inbox.
export function maskEmail(e) {
  const s = normalizeEmail(e);
  const at = s.indexOf('@');
  if (at < 1) return '';
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const keep = Math.min(2, Math.max(1, local.length - 1));
  return local.slice(0, keep) + '*****' + domain;
}

// rand32: an unsigned 32-bit integer from crypto.getRandomValues.
export function generateCode(rand32) {
  return String(Number(rand32) % 1000000).padStart(6, '0');
}

export async function hashCode(code, salt, email) {
  const data = new TextEncoder().encode(String(salt) + ':' + normalizeEmail(email) + ':' + String(code));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

export function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// recentCreatedAtMs: createdAt (ms) of this email's codes, any order.
export function rateLimitDecision(recentCreatedAtMs, now) {
  const inWindow = (recentCreatedAtMs || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (inWindow.length) {
    const newest = Math.max.apply(null, inWindow);
    if (now - newest < RESEND_COOLDOWN_MS) {
      return { ok: false, error: 'cooldown', retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - (now - newest)) / 1000) };
    }
  }
  if (inWindow.length >= MAX_SENDS_PER_WINDOW) return { ok: false, error: 'too_many' };
  return { ok: true };
}

// Find the roster entry that owns this email (optionally pinned to a player id).
export function findRosterMatch(items, email, playerId) {
  const k = normalizeEmail(email);
  if (!k || !Array.isArray(items)) return null;
  const hits = items.filter(function (p) { return p && normalizeEmail(p.email) === k; });
  if (playerId) {
    const pinned = hits.find(function (p) { return p.id === playerId; });
    return pinned || null;
  }
  return hits[0] || null;
}

// row: { used, attempts, expires_at_ms }. Says whether a guess may be checked.
export function attemptDecision(row, now) {
  if (!row || row.used) return 'expired';
  if (now > row.expires_at_ms) return 'expired';
  if ((row.attempts || 0) >= MAX_ATTEMPTS) return 'locked';
  return 'check';
}
