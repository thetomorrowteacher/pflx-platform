# PFLX Data Bus — v1

The canonical message protocol that connects the Console (PFLX Platform) with
every sub-app (X-Coin, Core Pathways, Battle Arena, DarkCampus, Mission Control,
Player Management). Every player-data exchange across the suite uses this bus.

## Why this exists

Before the bus, every app held its own player records (X-Coin had `mockUsers`,
Pathways had `pflx_pathway_user`, etc.) and updates between them were ad-hoc.
The result was the contamination class of bugs we just shipped fixes for —
Player A's avatar showing up under Player B's brand, XC numbers diverging
between the Console toolbar and the X-Coin dashboard, badges granted in one
surface not reflecting in another.

The bus solves this by making the Console the single source of truth and
exposing one well-defined protocol that every sub-app speaks.

## Topology

```
                    ┌─────────────────────────────────┐
                    │       PFLX Platform (Console)    │
                    │   ─ owns PLAYERS[] (canonical)   │
                    │   ─ owns PflxDataBus (the hub)   │
                    │   ─ persists to Supabase via     │
                    │     X-Coin bridge                │
                    └────────────────┬────────────────┘
                                     │ postMessage
       ┌─────────┬───────────────────┼──────────────────┬──────────────┐
       ▼         ▼                   ▼                  ▼              ▼
   ┌────────┐ ┌────────┐        ┌─────────┐        ┌──────────┐  ┌──────────┐
   │ X-Coin │ │Pathways│        │  Arena  │        │ DarkCmp  │  │ Mimic UI │
   └────────┘ └────────┘        └─────────┘        └──────────┘  └──────────┘
```

Sub-apps never hold canonical player records. They ask Console for data and
send proposed changes back through the bus. Console applies the change once,
re-broadcasts the new authoritative record to every iframe, and everyone's
UI stays in sync.

## Message types

All messages are JSON strings sent via `postMessage` between an iframe and its
parent. The protocol version is implicit in the message type — bumping `v1` to
`v2` would mean introducing a new namespace like `pflx2_player_get`.

### `pflx_player_get` — sub → Console

> "Give me the full record for player X."

```json
{ "type": "pflx_player_get", "playerId": "player-1234", "ackId": "abc" }
```

| Field | Required | Description |
|---|---|---|
| `playerId` | yes | The id of the player to look up |
| `ackId` | no | Echoed back in the response so the sender can match request → reply |

Console responds with `pflx_player_data`.

### `pflx_player_data` — Console → sub

> Authoritative response for one player.

```json
{
  "type": "pflx_player_data",
  "playerId": "player-1234",
  "player": { ...full record... },
  "ackId": "abc"
}
```

`player` is null if the id wasn't found. Activity log is stripped.

### `pflx_player_update` — sub → Console

> "I'm proposing this partial update to player X."

```json
{
  "type": "pflx_player_update",
  "playerId": "player-1234",
  "changes": { "xc": 250, "totalXcoin": 250, "digitalBadges": 4 },
  "source": "xcoin",
  "ackId": "def"
}
```

| Field | Required | Description |
|---|---|---|
| `playerId` | yes | The id of the player to update |
| `changes` | yes | Partial player object — whitelisted fields only |
| `source` | no | The sub-app proposing the change ("xcoin", "arena", "pathways", etc.) — used for activity log + debugging |
| `ackId` | no | Echoed back in the resulting `pflx_player_data` |

#### Whitelisted fields

Sub-apps may only update these keys. Trying to change anything else is a no-op:

- `xc` — current X-Coin balance
- `totalXcoin` — lifetime X-Coin earned (kept monotonic by Console)
- `digitalBadges` — total badge count
- `badgeCounts` — `{ primary, premium, executive, signature }`
- `badges` — array of badge ids
- `slogan` — short bio line
- `image` — profile picture (data URI or URL)
- `interests` — array of strings
- `studioId` — startup studio assignment
- `pathway` — chosen pathway
- `diagnosticResult` — designer-type diagnostic outcome
- `level` — informational; the canonical rank tier comes from `rankOverride` + XC
- `rankOverride` — explicit rank id; takes precedence over XC-derived rank
- `activity` — appended-to activity log

**Not writable by sub-apps:** `id`, `name`, `brand`, `brandName`, `email`,
`pin`, `role`, `cohort`, `cohorts`, `joinedAt`, `claimed`. These belong to
Player Management.

After applying the update, Console broadcasts `pflx_player_changed` to every
iframe (including the sender — so the sender's UI converges with everyone else)
and replies to the sender with `pflx_player_data`.

### `pflx_player_changed` — Console → all subs

> "Player X's record changed. Here's the new authoritative version."

```json
{
  "type": "pflx_player_changed",
  "player": { ...full record... },
  "source": "console" | "xcoin" | "arena" | ...
}
```

Fired for EVERY player change — host edit in Player Management, mimic-mode
enter/exit, sub-app-proposed update, X-Coin task reward, badge grant, etc.

Sub-apps should:
1. If the changed player is the logged-in user, refresh local cache + UI.
2. If the sub-app maintains a roster view (leaderboard, mimic selector, feed
   authorship), update the matching row.

### `pflx_players_list_request` — sub → Console

> "Give me the roster."

```json
{
  "type": "pflx_players_list_request",
  "filter": { "role": "player", "cohort": "DD Studio 7" },
  "ackId": "ghi"
}
```

Both filter fields are optional. Omit `filter` for the full list.

### `pflx_players_list` — Console → sub

```json
{
  "type": "pflx_players_list",
  "players": [ ...records... ],
  "ackId": "ghi"
}
```

Activity logs are stripped to keep the payload small.

## Legacy types (still supported)

These predate the bus and remain wired so existing sub-app builds keep working.
New code should prefer the canonical types above.

- `pflx_identity_broadcast` — Console → sub: "active session changed". Now
  emitted in addition to `pflx_player_changed`, not instead of it.
- `pflx_identity_request` / `pflx_identity_response` — pull-style SSO. Use
  `pflx_player_get` for non-active-session lookups; this stays for the
  iframe-boot "who am I" handshake.
- `pflx_force_identity_sync` — Console → sub: "drop your identity cache and
  re-ask". Triggered when the active session switches to a different player.
- `pflx_xc_update` — Console → sub: shorthand for "the active player's XC
  changed to N". Equivalent to `pflx_player_changed` with only `xc` differing.

## Per-app status

| App | `pflx_player_changed` | `pflx_player_update` | Notes |
|---|---|---|---|
| Console | n/a (emits) | n/a (handles) | Owns `PflxDataBus`, `PLAYERS[]`, persistence |
| X-Coin | ✓ listens | ✓ via `updatePlayerStats` | `mockUsers` updated on every change |
| Pathways | ✓ listens | not yet | Player card re-renders on change |
| Battle Arena | ✓ listens | not yet | Re-adopts identity on change |
| DarkCampus | ✓ listens | not yet | Refreshes pflx_user for active player |

Sub-apps still pending `pflx_player_update` integration will continue to write
to their own local stores. Until they're wired, their state may diverge from
Console between full reloads — but the Console → sub-app direction is now
fully live.

## Code references

| File | What it does |
|---|---|
| `pflx-platform-check/preview.html` → `window.PflxDataBus` | The hub. `get`, `getAll`, `update`, `broadcastAll`, `broadcastTo`. |
| `pflx-platform-check/preview.html` → message listener around `pflx_player_get` | Routes incoming bus messages to the hub. |
| `pflx-platform-check/preview.html` → `broadcastPlayerChange` | Emits `pflx_player_changed` (in addition to legacy `pflx_identity_broadcast`). |
| `pflx-xcoin-check/app/components/PflxBridge.tsx` | Listens for `pflx_player_changed`, updates `mockUsers`, refreshes `pflx_user`. |
| `pflx-xcoin-check/app/lib/playerStats.ts` → `updatePlayerStats` | Posts `pflx_player_update` to Console after every stat change. |
| `pflx-pathway-portal/preview.html` | Listens for `pflx_player_changed`, updates `pflx_pathway_user`, re-renders the Player Card. |
| `pflx-arena-check/public/preview.html` | Listens for `pflx_player_changed`, re-adopts identity. |
| `pflx-darkcampus-check/src/app/components/PflxBridge.tsx` | Listens for `pflx_player_changed`, refreshes `pflx_user` if it's the active player. |

## Worked example — earning X-Coin in a sub-app

1. Player completes a task in X-Coin's Player Home.
2. X-Coin's `updatePlayerStats(playerId, { xcoin: 250, totalXcoin: 1250 })` runs.
3. `updatePlayerStats` posts `{ type: 'pflx_player_update', playerId, changes: { xc: 250, totalXcoin: 1250 }, source: 'xcoin' }` to Console.
4. Console's message router calls `PflxDataBus.update(playerId, changes, 'xcoin')`.
5. The Bus applies the change to `PLAYERS[idx]`, persists, then calls `broadcastPlayerChange(player)`.
6. `broadcastPlayerChange` updates `activeSession` if it's the logged-in player, refreshes the toolbar/hero, then emits `pflx_player_changed` to every iframe.
7. Each iframe's listener picks it up:
   - X-Coin updates `mockUsers[idx]` so leaderboards re-render with the new XC.
   - Pathways re-renders the Player Card (X-Coin pip + rank progress bar).
   - Battle Arena re-adopts identity so the lobby header shows the new XC.
   - DarkCampus refreshes the active-player `pflx_user`.
8. Activity log entry `data_bus_update` is appended to the player's record.

End state: every surface shows the same XC, badge counts, and rank within
one postMessage round-trip (~5ms).

## Future work

- **Push 3: round-out `pflx_player_update` integration** in Pathways (badges,
  pathway selection), Battle Arena (match wins → XC + badge), DarkCampus
  (post engagement → XC).
- **Phase 1 — signed tokens**: replace the implicit-trust postMessage protocol
  with HMAC-signed JWTs so a malicious page embedded in DarkCampus can't spoof
  `pflx_player_update` for another player.
- **Phase 2 — X-Coin as headless API**: lift `mockUsers` / `mockTransactions`
  out of sub-apps entirely. Sub-apps only call `pflx_player_get` / `_update`;
  there's no local copy of the roster to drift.
- **Phase 3 — Supabase realtime**: subscribe Console to Supabase changes so
  edits made from another browser/device propagate in real time, not just
  within a single browser session.
