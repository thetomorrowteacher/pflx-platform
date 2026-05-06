# PFLX System Architecture

**Last updated:** 2026-05-06

This is the canonical statement of which app owns what in the PFLX universe. If two apps disagree about who owns a piece of state, this doc wins.

---

## The Platform Console — `pflx-platform`

**Lives at:** `https://www.prototypeflx.com/`
**Source of truth for:** player profiles, identity, role, cohort, current session.

The Console is the entry point. A player logs in here once. After that, every sub-app borrows the player's profile from the Console — no sub-app maintains its own login or its own copy of who's logged in.

**Console manages, in Platform Settings:**
- Player profiles (the master list — was previously in Mission Control, moved 2026-05-06)
- Cohorts and Studio assignments (host-only)
- Access tiers, moderation, briefing/TTS, organizations, embed hub, Google Connect
- Player Defaults (skin, sound, etc.)

**Console exposes (cross-app contract):**
- `pflx_identity_broadcast` — pushes the active session to every iframe
- `pflx_xc_update` — pushes XC balance changes to every iframe
- `pflx_force_identity_sync` — wipes a sub-app's stale identity cache
- `pflxBroadcastXC(newBalance, { reason })` — call from anywhere in the platform when XC moves

**Console listens for (from sub-apps):**
- `pflx_identity_request` — replies with `pflx_identity_response`
- `pflx_xc_changed` — re-broadcasts to siblings + persists

Full contract: `docs/SUB_APP_SSO_CONTRACT.md`.

---

## Mission Control (sub-app surface, lives inside the Console)

**What it is now:** the LMS / Project Management hub.
**What it is not:** the home of player profiles. (That's Platform Settings now.)

**MC owns:**
- **Checkpoints** — multi-step learning milestones
- **Tasks** — bite-sized to-dos
- **Job Board** — host-posted roles for players to claim
- **Projects** — multi-stage builds with scoring
- **Pitches** — player-submitted ideas
- **Studios** — the "company" structure players belong to
- **Cohort Groups** (host-only) — class/org groupings inside cohorts
- Live Stream / Broadcasts to the cohort

**MC does NOT own:**
- Who the player is — that's Platform.
- The currency — that's X-Coin.
- Skill content — that's Core Pathways.
- Competitive matches — that's Battle Arena.
- Social — that's DarkCampus.

**Future scope inside MC:**
- Internship programs
- Partner-built programs (third parties drop curricula and projects in here)
- Seasonal structures (S1, S2, etc.) and progression requirements

The MC sidebar's "Player Management" entry is now a shortcut that bounces to Platform Settings → Players.

---

## X-Coin — `pflx-xcoin-app`

**What it owns:** the digital currency, the digital badge system, and player value/certification.

This app is responsible for measuring and awarding XP-like value. Every transaction (give XC, fine, badge award) flows through here. It then notifies the Console so other apps and the toolbar update.

**Inputs from Console:** identity (who is the active player) via `pflx_identity_broadcast`.
**Outputs to Console:** `pflx_xc_changed` after any wallet operation; `pflx_saved_to_cloud` after persisting.

X-Coin should NOT have its own login screen visible when running inside the Platform iframe.

---

## Core Pathways — `pflx-pathway-portal`

**What it owns:** skill development through courses, projects, and challenges. The "skill galaxy" 3D experience. Pathway curricula and node graphs. Discovery/exploration mechanics.

**What it does:** gives players a way to build a content portfolio. Outputs of Core Pathways (completed projects, mastered nodes) feed Mission Control's Project view and X-Coin's badge system.

**Inputs from Console:** identity. Inputs from MC: which checkpoints/projects are assigned.
**Outputs to MC:** project completion. Outputs to X-Coin: XC awards from completing nodes/projects.

---

## Battle Arena — `pflx-battle-arena`

**What it owns:** eSports, competitive matches, tournaments. Quick interactions. Engagement loops separate from the LMS.

**Inputs from Console:** identity. Inputs from X-Coin: Battle Pass holders get tournaments.
**Outputs to X-Coin:** XC awards from match wins, tournament prizes.

---

## DarkCampus — `pflx-darkcampus`

**What it owns:** the professional social network. The platform's primary communication surface. Persistent campus where players hang out, attend live streams, run office hours, etc.

**Inputs from Console:** identity. Inputs from MC: live stream broadcasts.
**Outputs to Console:** none direct (DarkCampus is mostly read-only relative to identity). Players' social posts and reputation can feed into Portfolio.

---

## Portfolio (web view, served from Platform)

**What it is:** an auto-generated public-facing webpage for each player.

**What it shows:**
- Brand name, slogan, image
- Earned badges (from X-Coin)
- Completed projects (from MC + Core Pathways)
- Rank tier (from Console)
- Public posts (from DarkCampus, opt-in)

**What it doesn't do:** edit anything. It's a presentation layer over data the other apps own.

---

## The flow when a player logs in

1. Player visits `prototypeflx.com`. They land on the Console's login screen.
2. Player enters Brand + PIN. Console authenticates, builds `activeSession` (full profile).
3. Console persists `activeSession` to `localStorage['pflx_user']` and starts auto-login on next visit.
4. Console fires `pflx_identity_broadcast` to all iframes (X-Coin, Pathways, Arena, DarkCampus, MC views).
5. Each sub-app, on receiving the broadcast, replaces any local cached identity and renders for THIS player.
6. Player navigates between apps via the Platform toolbar. Each navigation just shows/hides iframes — identity stays consistent.

**Refresh:** auto-login re-runs the broadcast within ~60ms. Player never sees the login screen unless they explicitly sign out.

**XC awarded in MC:**
1. MC marks task as complete, computes new XC balance.
2. Calls `window.pflxBroadcastXC(newBalance, { reason: 'Task: <name>' })`.
3. Console updates `activeSession.xc`, persists, fires `pflx_xc_update` to all iframes.
4. X-Coin app sees its balance bump (without doing the math itself).
5. Toolbar status strip ticks up.
6. Toast: `+50 XC · Task: <name>` flashes briefly.

**Profile edited in Settings:**
1. Host edits player in Platform Settings → Players → row → Edit.
2. Console writes new profile, fires `pflx_force_identity_sync` to all iframes.
3. Each sub-app drops cache, re-requests identity, re-renders.

---

## Why this matters

Before this refactor:
- Each sub-app could potentially diverge — different "who is logged in" states across apps.
- XC could be different in X-Coin vs. the toolbar.
- A player completing onboarding then refreshing got dumped back to onboarding.

After:
- One profile. One source of truth. One login. Refresh-safe.
- XC moves through one channel and ends up consistent everywhere.
- Mission Control stops being a dumping ground for everything host-related and becomes the LMS it should be.
- Platform Settings is where you go to manage anything about who the players are.
