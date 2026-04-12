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
| `headers` | `Record<string, string> \| () => Record<string, string>` | — | Static or dynamic headers |
| `body` | `unknown` | — | Request body — serialised to JSON |

**Headers as a function** — the function is called at the moment idle fires, not at init. This ensures you always send a fresh token rather than one captured when the page loaded.

```js
// Token captured at init — may be stale after a refresh
headers: { Authorization: `Bearer ${getToken()}` }

// Token evaluated at idle time — always fresh
headers: () => ({ Authorization: `Bearer ${getToken()}` })
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
