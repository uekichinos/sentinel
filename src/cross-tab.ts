/**
 * Minimal BroadcastChannel wrapper used by `crossTab` mode.
 *
 * Kept dependency-free and defensive: every browser API touched here can be
 * absent (SSR, older browsers, locked-down environments), in which case
 * `createChannel` returns `null` and cross-tab sync silently no-ops.
 */

export type CrossTabMessage =
  /** A tab announced itself — existing tabs reply with `presence`. */
  | { t: 'join'; id: number }
  /** Reply to `join` so the newcomer learns about existing tabs. */
  | { t: 'presence'; id: number }
  /** A tab is going away (page hide / `stop()`). */
  | { t: 'leave'; id: number }
  /** A tab saw real user activity — other tabs reset their countdown. */
  | { t: 'activity'; id: number }
  /** A tab entered the warning phase — other tabs follow. */
  | { t: 'prompt'; id: number }
  /** A tab went idle — other tabs follow. */
  | { t: 'idle'; id: number }

export interface CrossTabChannel {
  post(msg: CrossTabMessage): void
  close(): void
}

const CHANNEL_PREFIX = '@uekichinos/sentinel'

/**
 * Opens a BroadcastChannel for the given name and wires `onMessage` to it.
 * Returns `null` when BroadcastChannel is unavailable.
 */
export function createChannel(
  name: string,
  onMessage: (msg: CrossTabMessage) => void,
): CrossTabChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null

  let bc: BroadcastChannel
  try {
    bc = new BroadcastChannel(`${CHANNEL_PREFIX}:${name}`)
  } catch {
    return null
  }

  bc.onmessage = (event: MessageEvent<CrossTabMessage>) => {
    if (event.data && typeof event.data.t === 'string') onMessage(event.data)
  }

  return {
    post(msg) {
      try {
        bc.postMessage(msg)
      } catch {
        // channel closed or payload not cloneable — ignore
      }
    },
    close() {
      try {
        bc.close()
      } catch {
        // already closed
      }
    },
  }
}
