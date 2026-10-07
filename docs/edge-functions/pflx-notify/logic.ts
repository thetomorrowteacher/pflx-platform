// @ts-nocheck
// PFLX notify logic -- pure helpers (no I/O) so they can be unit-tested in
// Node by stripping the `export` keywords. Kept free of TypeScript-only
// syntax on purpose for exactly that reason.

export const MAX_PER_PLAYER_PER_HOUR = 15;   // emails to one player in a rolling hour
export const MAX_PER_DAY = 400;              // global daily cap (Gmail free sends ~500/day)
export const INFLIGHT_MS = 90 * 1000;        // a 'pending' row younger than this is being sent
export const MAX_ATTEMPTS = 3;               // give up on one event after this many tries
export const SITE_URL = 'https://www.prototypeflx.com';

export function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Only short, simple identifiers are accepted from the client.
export function cleanId(v) {
  var s = String(v == null ? '' : v);
  if (!s || s.length > 120) return '';
  return /^[A-Za-z0-9._:\-]+$/.test(s) ? s : '';
}

// Roster list lives either as a bare array or as { items: [...] }.
export function itemsOf(data) {
  if (Array.isArray(data)) return data;
  return data && Array.isArray(data.items) ? data.items : [];
}

// "badge-self-directed-player" -> "Self Directed Player"
export function prettyBadgeName(id) {
  var s = String(id || '').replace(/^badge-/, '').replace(/[-_]+/g, ' ').trim();
  if (!s) return 'Digital Coin';
  return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
}

// Which of a player's stored copies hold this badge? Records can store
// badges as bare id strings or { id, endorsements } objects.
export function badgeHolding(records, badgeId) {
  var has = false, endorsements = 0, nameFromRecord = '';
  (records || []).forEach(function (rec) {
    if (!rec || !Array.isArray(rec.badges)) return;
    rec.badges.forEach(function (b) {
      var id = (b && typeof b === 'object') ? b.id : b;
      if (id !== badgeId) return;
      has = true;
      var n = (b && typeof b === 'object' && typeof b.endorsements === 'number') ? b.endorsements : 1;
      if (n > endorsements) endorsements = n;
      if (b && typeof b === 'object' && b.name && !nameFromRecord) nameFromRecord = String(b.name);
    });
  });
  return { has: has, endorsements: has ? Math.max(1, endorsements) : 0, nameFromRecord: nameFromRecord };
}

// Resolve what to call a badge, never trusting client-supplied text.
export function resolveBadge(catalogItems, badgeId, nameFromRecord) {
  var cat = (catalogItems || []).find(function (b) { return b && b.id === badgeId; });
  var name = (cat && cat.name) || nameFromRecord || '';
  if (!name && badgeId === 'pflx-user-cert') name = 'PFLX User Certification';
  if (!name) name = prettyBadgeName(badgeId);
  if (badgeId === 'pflx-user-cert') name = 'PFLX User Certification';
  var xc = cat && typeof cat.xc === 'number' ? cat.xc : 0;
  return { name: String(name).slice(0, 120), xc: xc };
}

// Was this task actually approved for this player? Handles the per-player
// submissions[] shape and the legacy single-track shape.
export function verifyTaskApproval(task, playerId, player) {
  if (!task || !playerId) return { ok: false, reason: 'no_task' };
  var keys = {};
  keys[playerId] = 1;
  if (player) {
    if (player.brand) keys[player.brand] = 1;
    if (player.name) keys[player.name] = 1;
  }
  var subs = Array.isArray(task.submissions) ? task.submissions : [];
  var mine = subs.find(function (s) {
    return s && (keys[s.playerId] || keys[s.submittedBy] || keys[s.submittedById]);
  });
  if (mine) return mine.status === 'approved' ? { ok: true } : { ok: false, reason: 'not_approved' };
  if (task.status === 'approved') {
    var sub = task.submission || {};
    var assigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
    if (keys[sub.submittedBy] || keys[task.playerId] || assigned.indexOf(playerId) >= 0) return { ok: true };
  }
  return { ok: false, reason: 'not_approved' };
}

export function rateDecision(playerSentLastHour, globalSentLastDay) {
  if (globalSentLastDay >= MAX_PER_DAY) return { ok: false, error: 'daily_cap' };
  if (playerSentLastHour >= MAX_PER_PLAYER_PER_HOUR) return { ok: false, error: 'rate_limited' };
  return { ok: true };
}

// Decide what to do with an event_key that already has a row.
export function existingDecision(row, nowMs) {
  if (!row) return 'new';
  if (row.status === 'sent') return 'deduped';
  if (row.status === 'pending' && nowMs - new Date(row.created_at).getTime() < INFLIGHT_MS) return 'inflight';
  if ((row.attempts || 0) >= MAX_ATTEMPTS) return 'gave_up';
  return 'retry';
}

export function eventKeyTask(taskId, playerId) { return 'task:' + taskId + ':' + playerId; }
export function eventKeyCoin(playerId, badgeId, endorsements) { return 'coin:' + playerId + ':' + badgeId + ':' + endorsements; }

function shell(innerHtml, unsubUrl) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111">' +
    '<div style="background:#0b1020;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold;letter-spacing:2px">PFLX</div>' +
    '<div style="border:1px solid #e3e6ee;border-top:none;padding:18px;border-radius:0 0 10px 10px">' + innerHtml +
    '<p style="margin:22px 0 0"><a href="' + SITE_URL + '" style="background:#1f6feb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Open PFLX</a></p>' +
    '</div>' +
    '<p style="color:#888;font-size:11px;margin:12px 4px">You get this because you are a PFLX player. <a href="' + escapeHtml(unsubUrl) + '" style="color:#888">Stop these emails</a></p></div>';
}

export function buildTaskEmail(o) {
  var name = String(o.name || 'Player').slice(0, 60);
  var title = String(o.title || 'your task').slice(0, 160);
  var xc = Number(o.xc) > 0 ? Number(o.xc) : 0;
  var subject = 'Task approved: ' + title;
  var text = 'Hi ' + name + ',\n\nYour task "' + title + '" was approved.' +
    (xc ? '\nTask reward: ' + xc.toLocaleString('en-US') + ' XC' : '') +
    '\n\nOpen PFLX: ' + SITE_URL + '\n\nTo stop these emails: ' + o.unsubUrl + '\n\n- PFLX';
  var html = shell('<p style="margin:0 0 10px">Hi ' + escapeHtml(name) + ',</p>' +
    '<p style="margin:0 0 6px;font-size:18px;font-weight:bold">&#9989; Task approved</p>' +
    '<p style="margin:0 0 6px">' + escapeHtml(title) + '</p>' +
    (xc ? '<p style="margin:0;color:#b8860b;font-weight:bold">' + xc.toLocaleString('en-US') + ' XC reward</p>' : ''), o.unsubUrl);
  return { subject: subject, text: text, html: html };
}

export function buildCoinEmail(o) {
  var name = String(o.name || 'Player').slice(0, 60);
  var coin = String(o.badgeName || 'Digital Coin').slice(0, 120);
  var xc = Number(o.xc) > 0 ? Number(o.xc) : 0;
  var many = Number(o.endorsements) > 1;
  var subject = 'You earned a digital coin: ' + coin;
  var text = 'Hi ' + name + ',\n\nYou earned a digital coin: ' + coin + (many ? ' (x' + o.endorsements + ')' : '') + '.' +
    (xc ? '\nCoin value: ' + xc.toLocaleString('en-US') + ' XC' : '') +
    '\n\nOpen PFLX: ' + SITE_URL + '\n\nTo stop these emails: ' + o.unsubUrl + '\n\n- PFLX';
  var html = shell('<p style="margin:0 0 10px">Hi ' + escapeHtml(name) + ',</p>' +
    '<p style="margin:0 0 6px;font-size:18px;font-weight:bold">&#129689; New digital coin</p>' +
    '<p style="margin:0 0 6px">' + escapeHtml(coin) + (many ? ' &times;' + escapeHtml(o.endorsements) : '') + '</p>' +
    (xc ? '<p style="margin:0;color:#b8860b;font-weight:bold">' + xc.toLocaleString('en-US') + ' XC value</p>' : ''), o.unsubUrl);
  return { subject: subject, text: text, html: html };
}
