# @uekichinos/sentinel

[![Socket Badge](https://badge.socket.dev/npm/package/@uekichinos/sentinel/0.1.0)](https://socket.dev/npm/package/@uekichinos/sentinel/overview/0.1.0)

Lightweight idle detection for the browser. Fires callbacks and optionally notifies a backend when the user goes inactive. Zero dependencies.

```js
const sentinel = createSentinel({
  timeout: '15m',
  onIdle: () => showLogoutWarning(),
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

Begins listening for user activity and starts the idle countdown. Safe to call multiple times — idempotent.

### `sentinel.stop()`

Removes all event listeners and cancels the countdown. Resets internal state so `start()` can be called again.

### `sentinel.reset()`

Restarts the idle countdown from zero. If currently idle, transitions back to active and fires `onActive`.

### `sentinel.isIdle()`

Returns `true` if the user is currently idle.

### `sentinel.getRemainingMs()`

Returns the number of milliseconds remaining until the user is considered idle. Returns `0` when already idle or when the sentinel has not been started.

Useful for building countdown indicators or progress bars:

```js
setInterval(() => {
  progressBar.style.width = `${(sentinel.getRemainingMs() / timeoutMs) * 100}%`
}, 100)
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `TtlInput` | — | How long before the user is considered idle |
| `onIdle` | `() => void` | — | Called when the user transitions active → idle |
| `onActive` | `() => void` | — | Called when the user transitions idle → active |
| `notify` | `NotifyOptions` | — | Fetch a backend endpoint when idle (see below) |
| `events` | `string[]` | see below | DOM events that count as activity |
| `throttle` | `number` | `500` | Min ms between activity handler calls |
| `watchVisibility` | `boolean` | `true` | Pause countdown when the tab is hidden |

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
let warningTimer

const sentinel = createSentinel({
  timeout: '14m',
  onIdle: () => {
    showWarning('You will be logged out in 1 minute')
    warningTimer = setTimeout(() => logout(), 60_000)
  },
  onActive: () => {
    hideWarning()
    clearTimeout(warningTimer)
  },
  notify: {
    url: '/api/session/extend',
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
