export type TtlInput = number | `${number}s` | `${number}m` | `${number}h` | `${number}d`

export type NotifyOptions = {
  /** URL to POST to when the user goes idle */
  url: string
  /** HTTP method — defaults to 'POST' */
  method?: string
  /**
   * Headers to include in the request.
   * Pass a function (sync or async) to evaluate headers at call time — useful for dynamic or refreshed tokens.
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /**
   * Optional request body — serialised to JSON.
   * Pass a function to evaluate the body at idle time — useful for capturing dynamic state.
   */
  body?: unknown | (() => unknown)
}

export type SentinelOptions = {
  /** How long before the user is considered idle */
  timeout: TtlInput
  /**
   * Fire `onPrompt` this long *before* the idle timeout is reached — a warning
   * phase (e.g. "you'll be logged out in 1 minute") without a hand-rolled timer.
   * Must be shorter than `timeout`.
   */
  promptBeforeIdle?: TtlInput
  /** DOM events that count as user activity (default: mousemove, keydown, scroll, click, touchstart) */
  events?: string[]
  /**
   * Events that send the user *straight* to idle, bypassing the countdown —
   * e.g. `'blur'`, or a custom logout event. Default: none.
   */
  immediateEvents?: string[]
  /**
   * Element to attach activity listeners to. Default: `document`.
   * Scope to a container to only count interaction inside a widget or embed.
   */
  element?: Document | HTMLElement
  /** Minimum ms between activity handler calls — prevents hammering on mousemove (default: 500) */
  throttle?: number
  /** Pause the idle countdown while the tab is hidden (default: true) */
  watchVisibility?: boolean
  /**
   * Synchronise idle state across tabs of the same origin via BroadcastChannel.
   * Activity in any tab resets every tab's countdown; idle fires everywhere at
   * once. No-ops gracefully where BroadcastChannel is unavailable. Default: false.
   */
  crossTab?: boolean
  /**
   * With `crossTab`, elect a single leader tab. Only the leader runs `notify`,
   * so a backend is pinged once rather than once per tab. Check with
   * `sentinel.isLeader()`. Default: false.
   */
  leaderElection?: boolean
  /**
   * Channel name suffix — set when running multiple independent cross-tab
   * sentinels on the same origin. Default: `'default'`.
   */
  name?: string
  /** Call `start()` automatically as soon as the sentinel is created. Default: false. */
  autoStart?: boolean
  /** Fire a fetch request when the user goes idle */
  notify?: NotifyOptions
  /** Called when the user transitions from active → idle */
  onIdle?: () => void
  /** Called when the user transitions from idle (or prompted) → active */
  onActive?: () => void
  /** Called `promptBeforeIdle` before idle fires. Requires `promptBeforeIdle`. */
  onPrompt?: () => void
  /** Called on every (throttled) user activity on this tab — not just transitions. */
  onActivity?: (event?: Event) => void
}

export type SentinelInstance = {
  /** Start listening for activity and begin the idle countdown */
  start(): void
  /** Stop all listeners and cancel the countdown */
  stop(): void
  /** Reset the idle countdown (and transition prompted/idle → active if needed) */
  reset(): void
  /** Freeze the countdown, preserving the time remaining. No-op if not started. */
  pause(): void
  /** Resume a paused countdown from where it left off. No-op if not paused. */
  resume(): void
  /** Returns true if the user is currently idle */
  isIdle(): boolean
  /** Returns true while in the warning phase — after `onPrompt`, before `onIdle` */
  isPrompted(): boolean
  /** Returns milliseconds remaining until idle. Returns 0 when already idle or not started. */
  getRemainingMs(): number
  /** Epoch ms of the last observed activity. Returns 0 when not started. */
  getLastActiveTime(): number
  /** Milliseconds since the last observed activity. Returns 0 when not started. */
  getElapsedTime(): number
  /** With `leaderElection`, whether this tab is the leader. Always true when cross-tab is off. */
  isLeader(): boolean
  /** This tab's cross-tab id — stable for the life of the instance. */
  getTabId(): number
}
