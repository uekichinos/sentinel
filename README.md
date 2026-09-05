# @uekichinos/sentinel

[![Socket Badge](https://badge.socket.dev/npm/package/@uekichinos/sentinel/0.2.0)](https://socket.dev/npm/package/@uekichinos/sentinel/overview/0.2.0)

Lightweight idle detection for the browser. Fires callbacks and optionally notifies a backend when the user goes inactive. Zero dependencies.

- **Prompt phase** — warn the user before logging them out, no hand-rolled timer
- **Cross-tab sync** — activity in one tab keeps every tab alive; idle fires everywhere at once
- **Pause / resume** — freeze the countdown without losing the time remaining
- **Backend notify** — fire a `fetch` when idle, with dynamic headers/body

```js
const sentinel = createSentinel({
  timeout: '15m',
  promptBeforeIdle: '1m',
  onPrompt: () => showLogoutWarning(),
  onIdle: () => logout(),
  onActive: () => hideLogoutWarning(),
})

sentinel.start()
```

---

## Installation

```bash
npm install @uekichinos/sentinel
```

---

## Quick start

```js
import { createSentinel } from '@uekichinos/sentinel'

const sentinel = createSentinel({
  timeout: '15m',
  onIdle: () => console.log('User is idle'),
  onActive: () => console.log('User is back'),
})

sentinel.start()
```

---

## API

### `createSentinel(options)`

Returns a `SentinelInstance`.

```ts
createSentinel(options: SentinelOptions): SentinelInstance
```

### `sentinel.start()`

Begins listening for user activity and starts the idle countdown. Safe to call multiple times — idempotent. Pass `autoStart: true` to skip this call.

### `sentinel.stop()`

Removes all event listeners and cancels the countdown. Resets internal state so `start()` can be called again.

### `sentinel.reset()`

Restarts the idle countdown from zero. If currently idle or in the prompt phase, transitions back to active and fires `onActive`.

### `sentinel.pause()` / `sentinel.resume()`

`pause()` freezes the countdown, keeping the time remaining. `resume()` continues from exactly where it left off. Unlike `stop()` (which resets), this is for temporary suspensions — a long upload, a modal you don't want counted as activity. Activity fired while paused is ignored.

```js
sentinel.pause()   // countdown frozen at, say, 4m 12s remaining
// ...later...
sentinel.resume()  // continues from 4m 12s
```

### `sentinel.isIdle()` / `sentinel.isPrompted()`

`isIdle()` returns `true` once the user is idle. `isPrompted()` returns `true` during the warning phase — after `onPrompt`, before `onIdle`.

### `sentinel.getRemainingMs()`

Returns the number of milliseconds remaining until the user is considered idle. Returns `0` when already idle, paused-and-expired, or when the sentinel has not been started.

Useful for building countdown indicators or progress bars:

```js
setInterval(() => {
  progressBar.style.width = `${(sentinel.getRemainingMs() / timeoutMs) * 100}%`
}, 100)
```

### `sentinel.getLastActiveTime()` / `sentinel.getElapsedTime()`

`getLastActiveTime()` is the epoch-ms timestamp of the last observed activity; `getElapsedTime()` is the milliseconds since. Both return `0` when not started.

```js
if (sentinel.getElapsedTime() > 5 * 60_000) showAwayBadge()
```

### `sentinel.isLeader()` / `sentinel.getTabId()`

With `crossTab` + `leaderElection`, `isLeader()` tells you whether this tab is the elected leader (the only one that runs `notify`). `getTabId()` is this tab's stable id. `isLeader()` is always `true` when cross-tab is off.

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `TtlInput` | — | How long before the user is considered idle |
| `promptBeforeIdle` | `TtlInput` | — | Fire `onPrompt` this long before idle. Must be shorter than `timeout` |
| `onIdle` | `() => void` | — | Called when the user transitions active → idle |
| `onActive` | `() => void` | — | Called when the user transitions idle (or prompted) → active |
| `onPrompt` | `() => void` | — | Called `promptBeforeIdle` before idle (requires `promptBeforeIdle`) |
| `onActivity` | `(event?: Event) => void` | — | Called on every throttled activity, not just transitions |
| `notify` | `NotifyOptions` | — | Fetch a backend endpoint when idle (see below) |
| `events` | `string[]` | see below | DOM events that count as activity |
| `immediateEvents` | `string[]` | `[]` | Events that send the user straight to idle, bypassing the countdown |
| `element` | `Document \| HTMLElement` | `document` | Element to attach activity listeners to |
| `throttle` | `number` | `500` | Min ms between activity handler calls |
| `watchVisibility` | `boolean` | `true` | Pause countdown when the tab is hidden |
| `crossTab` | `boolean` | `false` | Sync idle state across tabs via BroadcastChannel |
| `leaderElection` | `boolean` | `false` | With `crossTab`, only the leader tab runs `notify` |
| `name` | `string` | `'default'` | Channel name suffix for multiple independent cross-tab sentinels |
| `autoStart` | `boolean` | `false` | Call `start()` automatically on creation |

**Default events:** `mousemove`, `keydown`, `scroll`, `click`, `touchstart`

---

## TTL formats

| Format | Duration |
|--------|----------|
| `'30s'` | 30 seconds |
| `'5m'` | 5 minutes |
| `'15m'` | 15 minutes |
| `'1h'` | 1 hour |
| `5000` | 5000 milliseconds |

`promptBeforeIdle` and `immediateEvents` timings use the same formats.

---

## Prompt phase

Set `promptBeforeIdle` to get a warning callback a fixed time before the user is
considered idle. The timeline becomes **active → prompted → idle**.

```js
const sentinel = createSentinel({
  timeout: '15m',
  promptBeforeIdle: '1m',
  onPrompt: () => showDialog('You will be logged out in 1 minute'),
  onIdle: () => logout(),
  onActive: () => hideDialog(),   // fires if the user moves during the prompt
})

sentinel.start()
```

`getRemainingMs()` keeps counting down to idle throughout the prompt phase, so it
drives a countdown in the dialog directly. Any activity during the prompt
transitions back to active, fires `onActive`, and restarts the full countdown.

---

## Cross-tab sync

With `crossTab: true`, all tabs of the same origin share one idle state over a
`BroadcastChannel`:

- activity in **any** tab resets **every** tab's countdown
- idle (and the prompt phase) fire in every tab at once

```js
const sentinel = createSentinel({
  timeout: '15m',
  crossTab: true,
  leaderElection: true,   // only the leader tab runs `notify`
  onIdle: () => logout(),
})

sentinel.start()
```

Without `leaderElection`, each tab that detects idle locally may fire `notify`;
with it, exactly one tab (the leader) does. Cross-tab sync no-ops gracefully in
environments without `BroadcastChannel` — the sentinel still works per-tab.

---

## Immediate events

`immediateEvents` lists events that skip the countdown and mark the user idle
right away — useful for `blur` or a custom sign-out event.

```js
createSentinel({ timeout: '15m', immediateEvents: ['blur'] })
```

---

## `notify` — backend notification

Fire a fetch request automatically when the user goes idle. Useful for invalidating server-side sessions or logging inactivity.

```js
const sentinel = createSentinel({
  timeout: '15m',
  notify: {
    url: '/api/session/idle',
    method: 'POST',                          // default
    headers: () => ({                        // function — evaluated at idle time
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    }),
    body: { reason: 'idle' },
  },
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | Endpoint to call |
| `method` | `string` | `'POST'` | HTTP method |
| `headers` | `Record<string, string> \| () => Record<string, string> \| Promise<Record<string, string>>` | — | Static or dynamic headers (sync or async) |
| `body` | `unknown \| () => unknown` | — | Request body — serialised to JSON, or a factory evaluated at idle time |

**Headers as a function** — the function is called at the moment idle fires, not at init. Supports both sync and async functions. This ensures you always send a fresh token rather than one captured when the page loaded.

```js
// Token captured at init — may be stale after a refresh
headers: { Authorization: `Bearer ${getToken()}` }

// Token evaluated at idle time — always fresh (sync)
headers: () => ({ Authorization: `Bearer ${getToken()}` })

// Async token refresh — awaited before the request fires
headers: async () => ({ Authorization: `Bearer ${await refreshToken()}` })
```

**Body as a function** — like headers, a body factory is evaluated at idle time rather than at init. Useful for capturing dynamic state:

```js
body: () => ({ userId: store.user.id, sessionId: store.session.id })
```

The notify request fails silently on network error — `onIdle` always fires regardless.

---

## Examples

### Auto-logout with session warning

```js
const sentinel = createSentinel({
  timeout: '15m',
  promptBeforeIdle: '1m',
  crossTab: true,          // one logout across every tab
  leaderElection: true,    // ping the backend once, not per tab
  onPrompt: () => showWarning('You will be logged out in 1 minute'),
  onActive: () => hideWarning(),
  onIdle: () => logout(),
  notify: {
    url: '/api/session/end',
    headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  },
})

sentinel.start()
```

### Pause API polling when idle

```js
let pollInterval

const sentinel = createSentinel({
  timeout: '5m',
  onIdle: () => {
    clearInterval(pollInterval)
  },
  onActive: () => {
    pollInterval = setInterval(fetchData, 5000)
  },
})

pollInterval = setInterval(fetchData, 5000)
sentinel.start()
```

### Suspend the countdown during a long task

```js
sentinel.start()

async function uploadLargeFile(file) {
  sentinel.pause()          // don't log the user out mid-upload
  try {
    await upload(file)
  } finally {
    sentinel.resume()       // continue from the time that was remaining
  }
}
```

### Countdown indicator

```js
const TIMEOUT_MS = 15 * 60 * 1000 // 15m in ms

const sentinel = createSentinel({ timeout: TIMEOUT_MS })
sentinel.start()

setInterval(() => {
  const pct = (sentinel.getRemainingMs() / TIMEOUT_MS) * 100
  progressBar.style.width = `${pct}%`
}, 200)
```

### Stop on page unload

```js
sentinel.start()
window.addEventListener('beforeunload', () => sentinel.stop())
```

---

## Via `<script>` tag (no bundler)

```html
<script src="https://unpkg.com/@uekichinos/sentinel/dist/index.global.js"></script>
<script>
  const sentinel = Sentinel.createSentinel({
    timeout: '15m',
    onIdle: () => console.log('idle'),
  })
  sentinel.start()
</script>
```

---

## License

MIT © [uekichinos](https://www.npmjs.com/~uekichinos)
