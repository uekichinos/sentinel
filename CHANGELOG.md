# Changelog

All notable changes to `@uekichinos/sentinel` are documented here.

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
