# PFLX Architecture v2 — Console + Experience Apps

**Date:** 2026-05-06
**Status:** Decided
**Supersedes:** `PFLX_ARCHITECTURE.md` (which described the original four-iframe model)

---

## The model

PFLX is a **platform + ecosystem**, not a four-app suite.

### The Console (one codebase, one deploy)

`pflx-platform` → `prototypeflx.com`. The operating system. Owns identity, economy UI, daily-use surfaces, and admin.

**The Console contains:**
- **Identity & Auth** — single source of truth for who is who; signs identity tokens for everything else
- **Mission Control** — tasks, projects, cohorts, internships, partner programs
- **X-Coin (UI)** — wallet, transactions, badges display, store. Console renders the X-Coin views; the X-Coin BACKEND stays separate (see below)
- **Portfolio** — public player pages
- **Master Settings** — host controls, profile management, Evolution Rankings, X-Bot

The Console is the only place a player ever logs in. It is the only place Master Hosts manage rosters, ranks, badges, and access. It hosts the iframe slots for the Experience Apps.

### The Experience Apps (independent deploys)

Each is its own Vercel deployment, free to choose its own stack. Each consumes a **signed identity token** from the Console (Option B SSO). None has its own login UI. None has its own roster of real names.

| App | Repo | Role | Stack freedom |
| --- | --- | --- | --- |
| **Core Pathways** | `pflx-pathway-portal` | Open-world skill galaxy | Three.js now; Unity / Unreal WebGL later |
| **Battle Arena** | `pflx-battle-arena` | Competitive game runtime | Free to evolve into a full game engine |
| **DarkCampus** | `pflx-darkcampus` | Social network | Mobile-first; native iOS/Android client coming in next 3 months |

### The X-Coin backend (data service, not a UI)

`pflx-xcoin-app` becomes a **headless data service** for the entire platform's economy.

**It owns and serves:**
- XC balances per player
- Digital badges per player (graphics, name, type, XC value, awarded timestamp)
- Badge catalog (the universe of available badges, not the per-player awards)
- Transaction history

**Its public API is consumed by:**
- The Console (renders the wallet UI, badge gallery, store, etc.)
- The Experience Apps (e.g., DarkCampus shows a player's earned badges on their profile)
- The Native Mobile DarkCampus client (when it ships)

The X-Coin Vercel app's UI (login, dashboard, etc.) goes away. The X-Coin Vercel deployment becomes purely an API endpoint.

---

## The identity token spec (Option B SSO)

Every cross-origin call into an Experience App carries a signed identity token. Sub-apps verify it server-side before rendering anything.

### Payload

```json
{
  "v": 1,
  "playerId": "player-1",
  "brand": "PixelProphet",
  "role": "player",
  "cohort": "Cohort 2",
  "xcBalance": 1850,
  "rankId": "rank-1",
  "audience": "web",
  "iat": 1730000000,
  "exp": 1730003600,
  "iss": "console.prototypeflx.com",
  "sig": "<HMAC-SHA256 over the rest>"
}
```

### Field rules

| Field | Notes |
| --- | --- |
| `v` | Spec version. Always `1` for now. Bump on breaking changes. |
| `playerId` | Stable internal ID. Sub-apps use this when querying X-Coin API. |
| `brand` | The ONLY player-readable identity. Real name NEVER appears. |
| `role` | `player` \| `instructor` \| `host` \| `master-host`. |
| `cohort` | Primary cohort string. (Multi-cohort players send a separate `cohorts` array if needed by the consumer.) |
| `xcBalance` | Snapshot at issue time. Sub-apps refresh from X-Coin API for live values. |
| `rankId` | Resolved rank (honoring any rankOverride). Sub-apps look up display data from a rank catalog API. |
| `audience` | `web` (1-hour exp) or `native` (longer; see Mobile section). |
| `iat` / `exp` | Standard issued-at and expiration. |
| `iss` | The Console's hostname. |
| `sig` | HMAC-SHA256 of the canonical JSON of all other fields, using a shared secret only the Console and the verifying app know. (RS256 with public-key verification is the future-proof option; HMAC is fine to start.) |

### What is NOT in the token (deliberately)

- **No real name.** Real names live in the Console's roster. Sub-apps don't need them.
- **No email.** Same reason.
- **No PIN.** Auth happens once at the Console; sub-apps trust the token.
- **No badge list.** Could grow large. Sub-apps fetch from X-Coin API when they need to display.
- **No image / avatar URL.** Optional add later if sub-apps need to render avatars without a roundtrip.

---

## Mobile: the DarkCampus native client (next 3 months)

DarkCampus on iOS/Android needs a longer-lived token model. The web spec extends cleanly:

- **Audience flag**: `audience: "native"` tokens are issued with longer `exp` (e.g., 30 days).
- **Refresh tokens**: native client gets a separate, opaque refresh token (random 256-bit string), stored in iOS Keychain or Android Keystore. Used to mint new access tokens via `/api/oauth/refresh`.
- **Initial auth flow**: native app opens a Console-hosted web view → user signs in → Console returns a refresh token via custom URL scheme (`pflx-darkcampus://auth?refresh=...`). Same OAuth pattern Slack and Discord use.
- **Revocation**: the Console keeps a list of revoked refresh tokens (per-user, host can force-revoke from Settings).

The web access tokens (1-hour exp) and native access tokens (audience-flagged, longer exp) share the same verification logic. Sub-apps don't need different code paths for web vs. native.

---

## Migration plan

Phased so each step ships independently and fixes a specific user-visible problem.

### Phase 0 — Privacy hot-fix (immediate)
**Effort: ~1 hour**
**Why first: real names leaking is a today problem.**

- Sanitize the brand-select dropdowns in Battle Arena's `preview.html` and Core Pathways' login UI to show **brand only**, not "Brand — Real Name".
- Same for any player list a non-host might see.
- This is a stopgap. Phase 1+ replaces this with the token spec.

### Phase 1 — Token spec + signing service (Console)
**Effort: ~3 days**

- Document the spec in `docs/PFLX_TOKEN_SPEC.md` (we already have most of it above).
- Add `/api/auth/sign` endpoint in the Console: takes the active session, returns a signed token. Calls go through `next-auth` or a hand-rolled HMAC implementation.
- Add `/api/auth/refresh` endpoint (no-op for `web` audience for now; reserved for native).
- Update `buildAppURL(appKey)` in the Console to include a fresh token in the iframe URL: `?token=<jwt>` or as an `Authorization` header in subsequent requests.

### Phase 2 — X-Coin backend becomes headless API
**Effort: ~2-3 days**

- Add public endpoints to the X-Coin Vercel app:
  - `GET /api/v1/players/:playerId/xc` → current balance
  - `GET /api/v1/players/:playerId/badges` → list of earned badges with image URLs, names, XC values, types, awarded timestamps
  - `GET /api/v1/badges` → full catalog (for store/admin views)
  - `GET /api/v1/badges/:badgeId` → single badge details
  - `POST /api/v1/players/:playerId/xc` → award/deduct (host-only via token)
  - `POST /api/v1/players/:playerId/badges` → award (host-only via token)
- All endpoints validate the identity token. Mutating endpoints require host/admin role.
- The X-Coin Vercel app's UI routes (`/admin`, `/player`, etc.) get retained for now but are flagged for removal in Phase 5.

### Phase 3 — Experience Apps adopt the token (Pathways, Arena, DarkCampus)
**Effort: ~2 days per app, in parallel if you have help**

For each: replace the current iframe-guard + postMessage SSO bridge with token verification on first paint. No more login screens at all (already mostly true after recent pushes; this finishes it). No more brand-select dropdowns showing other players. Each app fetches the player's badges from X-Coin API when displaying a profile.

### Phase 4 — Migrate X-Coin UI into Console
**Effort: ~1 week**

- Port the X-Coin player wallet view to a Console route at `/xcoin`.
- Port the badge gallery, store, transaction history.
- All views fetch from the X-Coin API (which we built in Phase 2).
- Console toolbar's X-Coin link points at the new local route, not the iframe.
- The `pflx-xcoin-app` Vercel UI routes get a deprecation banner.

### Phase 5 — Sunset X-Coin's UI deployment
**Effort: ~1 day**

- Remove UI routes from `pflx-xcoin-app`. The Vercel app stays — it's now purely the API service.
- Update any old links/bookmarks to point at the Console's `/xcoin` route.

### Phase 6 — Portfolio polish
**Effort: ~2-3 days**

- Confirm Portfolio renders only brand + earned badges + projects (no real names).
- Public-facing route `/p/:brand` so portfolios are shareable outside the platform.
- Pulls badges from X-Coin API.

### Phase 7 — DarkCampus native mobile (~3 months)
**Effort: separate track, multi-week**

- iOS + Android clients consume the same token spec via the OAuth-like refresh flow described above.
- Same signing service in the Console handles native tokens.

---

## What stays the same

- **The four core sub-apps' actual experience logic.** Pathways' skill graph, Arena's match engine, DarkCampus' chat — all unchanged. Only the auth/identity surface changes.
- **The Console's UI.** Master Hosts and players keep using the same Console screens.
- **Vercel as the deployment target.** All four sub-apps + Console keep deploying to Vercel.

---

## What this means for the user

- **No more whack-a-mole on login screens.** They simply don't exist in sub-apps after Phase 1.
- **Real names never leak.** The token spec doesn't carry them.
- **One identity, one wallet, one rank.** Always.
- **The four sub-apps stay specialized.** Pathways can grow into Unity/Unreal. Arena can grow into a full game engine. DarkCampus can ship native apps. None of that touches the Console.
- **Partners and third parties get a clean SDK.** Sign up for a token, render in an iframe, you're a PFLX experience.

---

## Open questions for the future (not blocking now)

1. **JWT library or custom HMAC?** Custom HMAC is simpler and has zero deps. JWT brings standard tooling. I'd start with custom HMAC and revisit if we need standard interop.
2. **RS256 (public-key) vs HS256 (shared-secret)?** HS256 is fine for now since all sub-apps are first-party and we control deploy keys. RS256 becomes important when third-party partners join (they verify with a public key but can't mint tokens themselves).
3. **Where does session state live for revocation?** Probably Supabase or Vercel KV. Not blocking until we ship the native client.
