# Changelog

All notable changes to `@uekichinos/sentinel` are documented here.

## [0.3.0] - 2026-09-06
### Added
- **Prompt phase** — `promptBeforeIdle` + `onPrompt` fire a warning callback a set time before idle, so "you'll be logged out in 1 minute" no longer needs a hand-rolled `setTimeout`. `sentinel.isPrompted()` reports the warning state
- **Cross-tab sync** — `crossTab: true` synchronises idle state across tabs of the same origin via BroadcastChannel; activity in any tab resets every tab's countdown and idle fires everywhere at once. No-ops gracefully where BroadcastChannel is unavailable
- **`leaderElection`** — with `crossTab`, elects a single leader tab so `notify` pings the backend once rather than once per tab. `sentinel.isLeader()` / `sentinel.getTabId()` expose the election state
- **`sentinel.pause()` / `sentinel.resume()`** — freeze the countdown preserving the time remaining, then continue from where it left off (distinct from `stop()`, which resets)
- **`onActivity`** — called on every throttled user activity, not just active↔idle transitions; receives the DOM event
- **`immediateEvents`** — a list of events (e.g. `'blur'`, a custom logout event) that send the user straight to idle, bypassing the countdown
- **`sentinel.getLastActiveTime()` / `sentinel.getElapsedTime()`** — epoch ms of, and elapsed ms since, the last observed activity
- **`element`** — scope activity listeners to a container instead of `document`
- **`autoStart`** — call `start()` automatically when the sentinel is created
- 34 new tests covering the above additions (79 total)

## [0.2.0] - 2026-04-12
### Added
- `sentinel.getRemainingMs()` — returns milliseconds until idle; useful for countdown indicators and progress bars
- `notify.body` factory function — `body` can now be `() => unknown`, evaluated at idle time rather than at init; useful for capturing dynamic state (e.g. current user ID or session ID)
- Async `notify.headers` support — `headers` function can now return `Promise<Record<string, string>>`, enabling async token refresh before the idle request fires
- 17 new tests covering the above additions (45 total)

## [0.1.0] - 2026-04-12
### Added
- Initial release
- `createSentinel(options)` — create an idle detector instance
- `sentinel.start()` — begin listening for activity
- `sentinel.stop()` — remove all listeners and cancel the countdown
- `sentinel.reset()` — restart the countdown, transitions idle → active if needed
- `sentinel.isIdle()` — returns current idle state
- TTL timeout strings: `'30s'`, `'5m'`, `'15m'`, `'1h'` and ms numbers
- `onIdle` / `onActive` callbacks
- `notify` option — fires a `fetch` request to a backend endpoint when idle
- Dynamic `headers` function — evaluated at idle time for fresh tokens
- `watchVisibility` — pauses countdown when the tab is hidden (default: true)
- `throttle` — minimum ms between activity handler calls (default: 500)
- `events` — configurable list of DOM events that count as activity
- Fails silently on notify network errors — never blocks callbacks
- ESM, CJS, and IIFE builds
- Zero dependencies
- 28 tests
