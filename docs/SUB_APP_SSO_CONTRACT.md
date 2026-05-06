# PFLX Sub-app SSO Contract

**Audience:** anyone building X-Coin, Battle Arena, DarkCampus, Pathways, or any new sub-app that runs inside the PFLX Platform iframe shell.

**Last updated:** 2026-05-06

---

## The problem this fixes

Each sub-app used to maintain its own profile in its own `localStorage`. When a player logged into the Platform as `MotionMaster`, then opened X-Coin, the X-Coin app might still be showing data for whoever logged into X-Coin **directly** last — they were two different identities, with two different X-Coin balances.

That's wrong. PFLX has **one** profile per player; sub-apps must adopt the Platform's identity, not maintain their own.

---

## Message contract

All cross-frame communication is `window.postMessage(JSON.stringify({...}), '*')`. The Platform (parent window) and each sub-app iframe both speak this protocol.

### Messages the Platform sends to sub-apps

| `type` | When | Payload | What sub-app must do |
| --- | --- | --- | --- |
| `pflx_identity_broadcast` | On login, role change, mimic enter/exit, every iframe `load` event | `{ user, role, onboardingComplete, forceSync? }` | Replace local cache with `user`. **Do not** keep your own copy of who's logged in. |
| `pflx_force_identity_sync` | Rare — requested by Platform when it knows a sub-app's cache is stale | (none) | Wipe your local identity cache, then send `pflx_identity_request` to get fresh state. |
| `pflx_xc_update` | Whenever the player's X-Coin balance changes anywhere in the platform | `{ xc, reason }` | Update the displayed balance immediately. Do not write back unless the user actually transacts. |
| `pflx_role_changed` | Host toggles to player view (or back), or master-host enters/exits Mimic Player | `{ role: 'player' \| 'host' }` | Hide host-only UI when `role === 'player'`. |

### Messages sub-apps send to the Platform

| `type` | When | Payload | What Platform does |
| --- | --- | --- | --- |
| `pflx_identity_request` | On your sub-app's first paint, before showing any player data | (none) | Replies with `pflx_identity_response` containing the active session. |
| `pflx_identity_request_sync` | Same as above but explicit: "force re-broadcast to me" | (none) | Re-broadcasts identity to all iframes. |
| `pflx_xc_changed` | Player did a transaction in your sub-app (store purchase, transfer, etc.) | `{ xc, reason }` | Updates the Platform's cached `activeSession.xc`, persists it, re-broadcasts to other sub-apps + the toolbar. |
| `pflx_saved_to_cloud` / `pflx_cloud_save_ack` | After a cloud-save you initiated | `{ ackId, label?, message? }` | Shows a "Saved to Cloud ✓" toast in the Platform shell. |

---

## What every sub-app MUST do

### 1. On first paint — request identity, don't trust local cache

```js
function requestIdentity() {
  if (window.parent === window) return; // running standalone, not in iframe
  window.parent.postMessage(JSON.stringify({ type: 'pflx_identity_request' }), '*');
}
requestIdentity();
```

### 2. Listen for identity broadcasts and replace local state

```js
window.addEventListener('message', (ev) => {
  let msg;
  try { msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; }
  catch { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'pflx_identity_broadcast' || msg.type === 'pflx_identity_response') {
    if (msg.user && msg.user.brand) adoptIdentity(msg.user, msg.role);
  }
  if (msg.type === 'pflx_force_identity_sync') {
    clearLocalIdentity(); requestIdentity();
  }
  if (msg.type === 'pflx_xc_update' && typeof msg.xc === 'number') {
    setDisplayedXC(msg.xc);
  }
  if (msg.type === 'pflx_role_changed') {
    document.body.classList.toggle('pflx-as-player', msg.role === 'player');
  }
});
```

### 3. Adopt identity = overwrite, don't merge

```js
function adoptIdentity(user, role) {
  const profile = {
    id: user.id, name: user.name, brand: user.brand, cohort: user.cohort, role: user.role,
    xc: user.xc || 0, totalXcoin: user.totalXcoin || 0,
    digitalBadges: user.digitalBadges || 0, image: user.image || ''
  };
  myApp.currentUser = profile;
  localStorage.setItem('pflx_user', JSON.stringify(profile));
  myApp.role = role;
  myApp.rerender();
}
```

### 4. When XC changes locally — broadcast back UP to Platform

```js
function awardXC(amount, reason) {
  const newBalance = (myApp.currentUser.xc || 0) + amount;
  myApp.currentUser.xc = newBalance;
  myApp.rerender();
  window.parent.postMessage(JSON.stringify({
    type: 'pflx_xc_changed', xc: newBalance, reason: reason
  }), '*');
}
```

The Platform will then re-broadcast `pflx_xc_update` so sibling iframes also update.

---

## What every sub-app MUST NOT do

- **Do not** maintain your own login/signup form. The Platform handles identity.
- **Do not** keep a separate user list. If you need players, pull from `mcPlayers` via the Platform.
- **Do not** persist a different `pflx_user` shape in localStorage than what the Platform sends.
- **Do not** ignore `pflx_force_identity_sync`. Clear and re-request.
- **Do not** debounce or rate-limit `pflx_xc_changed`. Send every legitimate change.

---

## Test plan

1. Log into the Platform as a host/admin.
2. Open every sub-app. Confirm each shows the host's brand, cohort, and XC.
3. Use the **Mimic Player** feature in X-Bot Host tab to swap to a different player. Confirm every sub-app updates within 1 second.
4. Exit Mimic. Confirm every sub-app reverts.
5. In X-Coin, do a transaction that changes XC. Toolbar XC updates immediately, every other open sub-app shows the new XC, refresh of any sub-app still shows the new XC (cloud-save took).
6. In Mission Control, complete a task that awards XC. Same checks as #5.

---

## Platform side (already shipped)

The Platform already:
- Broadcasts `pflx_identity_broadcast` on login, role change, mimic enter/exit, **and on every iframe `load` event**.
- Listens for `pflx_identity_request` and replies with `pflx_identity_response`.
- Listens for `pflx_xc_changed` and re-broadcasts `pflx_xc_update` to all siblings.
- Persists the canonical profile to `localStorage['pflx_user']` and auto-restores it on next page load.
- Exposes `window.pflxBroadcastXC(newBalance, { reason })` for in-platform code (Mission Control, Pathways) to call when awarding XC.

The burden is almost entirely on each sub-app to **honor the inbound broadcasts** and **send `pflx_xc_changed` whenever it touches XC**.
