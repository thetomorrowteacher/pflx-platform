import re, sys

path = "preview.html"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

orig = src

# 1) Version bump
old_ver = "window.PFLX_PATCH   = 258;"
new_ver = "window.PFLX_PATCH   = 259;"
assert src.count(old_ver) == 1, "version anchor not found/not unique"
src = src.replace(old_ver, new_ver, 1)

# 2) Insert the new "Join X-Live Now" IIFE right after the Next-Show-Countdown
#    IIFE's closing console.log + })(); and before the Rank-Gated App Access
#    feature block.
anchor = "          console.log('[PFLX] Next X-Live Show Countdown loaded');\n        })();\n"
assert src.count(anchor) == 1, "insertion anchor not found/not unique"

new_block = anchor + r'''
        /* ═══════════════════════════════════════════════════════════════════
           FEATURE: "Join X-Live Now" popup (Task F part 2 of 5, Oct 1)
           Ennis: "If a player's cohort is currently launched into an X-Live
           session then upon login players should see a large join X-Live
           now popup notification/button. When clicked the player should be
           launched directly into the launched X-Live session."
           Confirmed scope (AskUserQuestion, Task F scoping): a dismissible
           modal shown right after the login intro -- NOT a hard gate
           blocking Home. Reuses the SAME xb-1 pflxXBotLoadSessions()
           bridge the Next-Show-Countdown badge above and the PATCH
           PLATFORM v213 host-push PiP pull-in both already use, and ports
           the SAME cohort-match math X-Live's own xlSessionForCohorts()/
           xlCohortsOf() use (x-live-check/index.html ~8880-8916) so the
           Console and X-Live can never disagree on "does this active
           session apply to me". JOIN NOW reuses the SAME pip-xlive PIP
           widget + ?pip=1&session=<id> deep link the v213 host-push flow
           already proved out (not pflxXlivePipOpen() itself, which assumes
           a s.push object this not-yet-joined case doesn't have) -- the
           player lands directly in that session's live view, where the
           existing in-X-Live JOIN button (liveJoinSession) does the real
           join + attendance award, so this patch adds zero new join/reward
           logic of its own.
           ═══════════════════════════════════════════════════════════════════ */
        (function () {
          'use strict';

          function jnNorm(c) { return String(c == null ? '' : c).trim().toLowerCase(); }

          // Pure, ported from x-live-check's xlCohortsOf(entry) -- works on
          // either a player object (cohort/cohorts) or anything cohort-shaped.
          window.pflxJoinNowCohortsOf = function (entry) {
            var out = [];
            if (!entry) return out;
            var raw = [].concat(entry.cohort != null ? [entry.cohort] : [], Array.isArray(entry.cohorts) ? entry.cohorts : []);
            raw.forEach(function (c) {
              String(c == null ? '' : c).split(/[,;]/).forEach(function (p) {
                p = jnNorm(p); if (p && out.indexOf(p) === -1) out.push(p);
              });
            });
            return out;
          };

          // Pure, ported from x-live-check's xlSessionForCohorts(s, mine).
          window.pflxJoinNowSessionApplies = function (s, mine) {
            if (!s || s.status !== 'active') return false;
            if (s.allCohorts || !s.cohorts || !s.cohorts.length) return true;
            var theirs = s.cohorts.map(jnNorm);
            return (mine || []).some(function (c) { return theirs.indexOf(c) !== -1; });
          };

          // Pure: which active, in-scope, NOT-YET-JOINED session (if any)
          // should the popup offer? A player already joined doesn't need
          // the popup again -- they're already in the show (or can get
          // back in via the existing v213 push-pull PiP / X-Live itself).
          window.pflxJoinNowPick = function (sessions, mine, myId) {
            if (!Array.isArray(sessions) || !mine) return null;
            var list = sessions.filter(function (s) {
              if (!window.pflxJoinNowSessionApplies(s, mine)) return false;
              var joined = (s.liveParticipants || []).some(function (p) { return p && p.id === myId; });
              return !joined;
            });
            if (!list.length) return null;
            list.sort(function (a, b) { return (b.liveStartedAt || 0) - (a.liveStartedAt || 0); });
            return list[0];
          };

          function jnSeenKey(id) { return 'pflx_joinnow_dismissed_' + id; }
          function jnWasDismissed(id) {
            try { return sessionStorage.getItem(jnSeenKey(id)) === '1'; } catch (e) { return false; }
          }
          function jnMarkDismissed(id) {
            try { sessionStorage.setItem(jnSeenKey(id), '1'); } catch (e) {}
          }

          var _jnCurrent = null;

          function jnEnsureModal() {
            var el = document.getElementById('pflx-joinnow-modal');
            if (el) return el;
            el = document.createElement('div');
            el.id = 'pflx-joinnow-modal';
            el.style.cssText = 'position:fixed;inset:0;z-index:100050;display:none;align-items:center;' +
              'justify-content:center;background:rgba(4,6,14,0.72);backdrop-filter:blur(3px);' +
              'font-family:"Rajdhani",sans-serif;';
            el.innerHTML =
              '<div style="width:min(420px,88vw);background:linear-gradient(180deg,#0c0f1e,#070912);' +
              'border:1px solid rgba(0,240,255,0.4);border-radius:18px;padding:28px 26px;text-align:center;' +
              'box-shadow:0 0 40px rgba(0,240,255,0.18);">' +
              '<div style="font-size:11px;letter-spacing:0.14em;color:#ff5d7a;font-family:Audiowide;margin-bottom:10px;">🔴 LIVE NOW</div>' +
              '<div id="pflx-joinnow-title" style="font-size:20px;font-weight:800;color:#f0f2ff;margin-bottom:8px;"></div>' +
              '<div style="font-size:13px;color:#8a93b8;margin-bottom:22px;">Your class is live on X-Live right now.</div>' +
              '<button class="bigbtn gold" style="width:100%;padding:14px;font-size:14px;margin-bottom:10px;" onclick="window.pflxJoinNowGo()">📡 JOIN X-LIVE NOW</button>' +
              '<button class="bigbtn ghost" style="width:100%;padding:10px;font-size:11px;" onclick="window.pflxJoinNowDismiss()">Not now</button>' +
              '</div>';
            document.body.appendChild(el);
            return el;
          }

          function jnHide() {
            var el = document.getElementById('pflx-joinnow-modal');
            if (el) el.style.display = 'none';
          }

          window.pflxJoinNowGo = function () {
            var s = _jnCurrent;
            jnHide();
            if (!s) return;
            try {
              var frame = document.getElementById('pip-xlive-frame');
              var title = document.getElementById('pip-xlive-title');
              if (frame && typeof window.pflxPipOpen === 'function') {
                var base = (typeof buildAppURL === 'function') ? buildAppURL('lite') : 'https://thetomorrowteacher.github.io/x-live';
                frame.src = base + (base.indexOf('?') === -1 ? '?' : '&') + 'pip=1&session=' + encodeURIComponent(s.id);
                frame.dataset.session = s.id;
                if (title) title.textContent = '🔴 ' + String(s.title || 'X-LIVE').toUpperCase().slice(0, 40);
                window.pflxPipOpen('pip-xlive');
                if (typeof window.pflxPipApplyPreset === 'function') window.pflxPipApplyPreset('pip-xlive', 'large');
              }
            } catch (e) { console.warn('[joinnow] open failed', e); }
          };

          window.pflxJoinNowDismiss = function () {
            if (_jnCurrent) jnMarkDismissed(_jnCurrent.id);
            jnHide();
          };

          // Idempotent-ish: safe to call once per login. Fails safe at
          // every step -- a missing bridge, a failed load, or no match
          // simply means no popup, never a thrown error blocking login.
          window.pflxJoinNowCheck = async function () {
            try {
              if (typeof window.pflxXBotLoadSessions !== 'function') return;
              var s0 = window.activeSession; if (!s0 || !s0.id) return;
              // Hosts run the show -- not offered the player join-now
              // popup, UNLESS they're currently previewing as a player
              // (pflxRole === 'player'), matching how every other
              // player-facing surface in PFLX treats that toggle.
              var role = String(s0.role || '').toLowerCase();
              var isRealHost = !!(role === 'admin' || role === 'host' || role === 'teacher' || role === 'instructor' || s0.hostTier);
              if (isRealHost && window.pflxRole !== 'player') return;
              var mine = window.pflxJoinNowCohortsOf(s0);
              if (!mine.length) return;
              var sessions = await window.pflxXBotLoadSessions();
              var pick = window.pflxJoinNowPick(sessions, mine, s0.id);
              if (!pick) return;
              if (jnWasDismissed(pick.id)) return;
              _jnCurrent = pick;
              jnEnsureModal();
              var titleEl = document.getElementById('pflx-joinnow-title');
              if (titleEl) titleEl.textContent = pick.title || 'Live Session';
              var modalEl = document.getElementById('pflx-joinnow-modal');
              if (modalEl) modalEl.style.display = 'flex';
            } catch (e) { console.warn('[joinnow] check failed', e); }
          };

          console.log('[PFLX] Join X-Live Now popup loaded');
        })();

'''

src = src.replace(anchor, new_block, 1)

# 3) Wire the post-login choke point, right after the v258 countdown start call.
old_hook = "                    try { if (typeof window.pflxNextShowStart === 'function') window.pflxNextShowStart(); } catch (e) {} // PATCH PLATFORM v258\n"
new_hook = old_hook + "                    try { if (typeof window.pflxJoinNowCheck === 'function') window.pflxJoinNowCheck(); } catch (e) {} // PATCH PLATFORM v259\n"
assert src.count(old_hook) == 1, "post-login hook anchor not found/not unique"
src = src.replace(old_hook, new_hook, 1)

assert src != orig
with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK: patch applied")
