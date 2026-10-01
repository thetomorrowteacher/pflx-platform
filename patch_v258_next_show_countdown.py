import re

path = "preview.html"
with open(path) as f:
    text = f.read()

def replace_once(text, old, new, label):
    c = text.count(old)
    if c != 1:
        raise AssertionError("anchor not unique (%d): %s" % (c, label))
    return text.replace(old, new, 1)

# 1) PFLX_PATCH bump + build month.
old1 = """      window.PFLX_VERSION = '1.0.0';
      window.PFLX_PATCH   = 257;
      window.PFLX_BUILD   = '2026.09';"""
new1 = """      window.PFLX_VERSION = '1.0.0';
      window.PFLX_PATCH   = 258;
      window.PFLX_BUILD   = '2026.10';"""
text = replace_once(text, old1, new1, "PFLX_PATCH bump")

# 2) New IIFE: platform-wide Next-Show countdown badge. Reads the SAME
#    cfg.nextShowAt/cfg.nextShowLabel fields X-Live's PATCH X-LIVE v0.76
#    just added to the shared pflx_lite_config row, via the EXISTING xb-2
#    pflxXBotLoadCfg() bridge -- zero new cross-app plumbing. The countdown
#    math (pflxNextShowCountdownText) is a direct, byte-for-byte port of
#    X-Live's own pure formatter of the same name, not a reinvention, so
#    the two apps can never show a different number for the same target.
old2 = """          console.log('[PFLX] X-Bot Contextual Briefings loaded');
        })();
"""
new2 = old2 + """
        /* ═══════════════════════════════════════════════════════════════════
           FEATURE: Next X-Live Show Countdown (platform-wide badge)
           Task F part 1 of 5 (Ennis, Oct 1): "There should be an active
           counter for all users till the next X-Live show." Settings for
           this live in X-Live's own Live Theater tab (PATCH X-LIVE v0.76);
           this half just displays the SAME cfg.nextShowAt/nextShowLabel
           fields platform-wide, for every logged-in user, via the existing
           xb-2 pflxXBotLoadCfg() bridge (reads the same pflx_lite_config
           Supabase row X-Live's Setup tab already owns -- no new storage,
           no new cross-app message channel).
           ═══════════════════════════════════════════════════════════════════ */
        (function () {
          'use strict';

          // Byte-for-byte port of x-live-check/index.html's own
          // pflxNextShowCountdownText -- same math, same return shape, so
          // the Console and X-Live can never disagree on the same target.
          // nowMs is injectable for testing.
          window.pflxNextShowCountdownText = function (nextShowAtIso, nowMs) {
            if (!nextShowAtIso) return null;
            var target = new Date(nextShowAtIso).getTime();
            if (isNaN(target)) return null;
            var now = nowMs || Date.now();
            var diff = target - now;
            if (diff <= 0) return null;
            var totalMin = Math.floor(diff / 60000);
            var days = Math.floor(totalMin / 1440);
            var hours = Math.floor((totalMin % 1440) / 60);
            var mins = totalMin % 60;
            var secs = Math.floor((diff % 60000) / 1000);
            var label;
            if (days > 0) label = days + 'd ' + hours + 'h ' + mins + 'm';
            else if (hours > 0) label = hours + 'h ' + mins + 'm';
            else label = mins + 'm ' + secs + 's';
            return { label: label, imminent: diff <= 15 * 60000 };
          };

          function escNs(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
              return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
          }

          function ensureBadgeEl() {
            var el = document.getElementById('pflx-nextshow-badge');
            if (el) return el;
            el = document.createElement('div');
            el.id = 'pflx-nextshow-badge';
            el.style.cssText = 'position:fixed;top:14px;right:16px;z-index:9500;display:none;' +
              'align-items:center;gap:8px;padding:8px 14px;border-radius:999px;' +
              'background:rgba(8,6,16,0.9);border:1px solid rgba(0,240,255,0.35);' +
              'font-family:"Rajdhani",sans-serif;font-size:12px;color:#e6ebff;' +
              'box-shadow:0 0 16px rgba(0,0,0,0.4);white-space:nowrap;pointer-events:none';
            el.innerHTML = '<span style="font-size:10px;letter-spacing:0.06em;color:#8a93b8;text-transform:uppercase">⏱ Next X-Live</span>' +
              '<b id="pflx-nextshow-val" style="font-family:\\'Orbitron\\',sans-serif;color:#5ef2ff"></b>';
            document.body.appendChild(el);
            return el;
          }

          var _nsPollIv = null, _nsTickIv = null;
          window._pflxNextShowState = { nextShowAt: '', nextShowLabel: '' };

          function drawNextShow() {
            var el = document.getElementById('pflx-nextshow-badge');
            var val = document.getElementById('pflx-nextshow-val');
            if (!el || !val) return;
            var st = window._pflxNextShowState || {};
            var info = window.pflxNextShowCountdownText(st.nextShowAt, Date.now());
            if (!info) { el.style.display = 'none'; return; }
            el.style.display = 'flex';
            val.textContent = info.label + (st.nextShowLabel ? '  ·  ' + st.nextShowLabel : '');
            val.style.color = info.imminent ? '#ffd166' : '#5ef2ff';
            el.style.borderColor = info.imminent ? 'rgba(255,209,102,0.55)' : 'rgba(0,240,255,0.35)';
          }

          window.pflxNextShowPoll = async function () {
            try {
              if (typeof window.pflxXBotLoadCfg !== 'function') return;
              var cfg = await window.pflxXBotLoadCfg();
              window._pflxNextShowState = {
                nextShowAt: (cfg && cfg.nextShowAt) || '',
                nextShowLabel: (cfg && cfg.nextShowLabel) || ''
              };
            } catch (e) { console.warn('[nextshow] poll failed', e); }
            ensureBadgeEl();
            drawNextShow();
          };

          // Idempotent -- safe to call from every login (manual or
          // tryAutoLogin's restore path), won't stack a second pair of
          // intervals on repeated calls within the same page load.
          window.pflxNextShowStart = function () {
            if (_nsPollIv) return;
            window.pflxNextShowPoll();
            _nsPollIv = setInterval(window.pflxNextShowPoll, 60000);
            _nsTickIv = setInterval(drawNextShow, 1000);
          };

          console.log('[PFLX] Next X-Live Show Countdown loaded');
        })();
"""
text = replace_once(text, old2, new2, "next-show countdown IIFE")

# 3) Hook into the SAME post-login choke point the daily briefing/X-Bot
#    auto-open already use (covers manual login AND tryAutoLogin's
#    persisted-session restore path, per that function's own comment).
old3 = "                    try { if (typeof window.pflxXBotDailyBriefingCheck === 'function') window.pflxXBotDailyBriefingCheck(); } catch (e) {}\n"
new3 = old3 + "                    try { if (typeof window.pflxNextShowStart === 'function') window.pflxNextShowStart(); } catch (e) {} // PATCH PLATFORM v258\n"
text = replace_once(text, old3, new3, "post-login hook")

with open(path, "w") as f:
    f.write(text)

print("PATCH v258 applied OK -- all 3 anchors verified unique")
