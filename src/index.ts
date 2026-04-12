import { parseTtl } from './parse-ttl'
import type { NotifyOptions, SentinelInstance, SentinelOptions } from './types'

export type { SentinelOptions, SentinelInstance, NotifyOptions, TtlInput } from './types'

const DEFAULT_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']
const DEFAULT_THROTTLE = 500

function resolveHeaders(headers: NotifyOptions['headers']): Record<string, string> {
  if (!headers) return {}
  return typeof headers === 'function' ? headers() : headers
}

async function fireNotify(notify: NotifyOptions): Promise<void> {
  const headers = resolveHeaders(notify.headers)
  const hasBody = notify.body !== undefined

  try {
    await fetch(notify.url, {
      method: notify.method ?? 'POST',
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(hasBody ? { body: JSON.stringify(notify.body) } : {}),
    })
  } catch {
    // fail silently — never block the idle callback
  }
}

/**
 * Creates an idle detector that fires callbacks and optionally notifies a
 * backend endpoint when the user stops interacting with the page.
 *
 * @example
 * const sentinel = createSentinel({
 *   timeout: '15m',
 *   notify: {
 *     url: '/api/session/idle',
 *     headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 *   },
 *   onIdle: () => showLogoutWarning(),
 *   onActive: () => hideLogoutWarning(),
 * })
 *
 * sentinel.start()
 */
export function createSentinel(options: SentinelOptions): SentinelInstance {
  const parsedTimeout = parseTtl(options.timeout)
  if (!parsedTimeout) throw new Error(`@uekichinos/sentinel: invalid timeout "${options.timeout}"`)
  const timeoutMs: number = parsedTimeout

  const events = options.events ?? DEFAULT_EVENTS
  const throttleMs = options.throttle ?? DEFAULT_THROTTLE
  const watchVisibility = options.watchVisibility ?? true

  let timer: ReturnType<typeof setTimeout> | null = null
  let idle = false
  let started = false
  let lastActivity = 0

  function scheduleIdle(): void {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      idle = true
      options.onIdle?.()
      if (options.notify) fireNotify(options.notify)
    }, timeoutMs)
  }

  function handleActivity(): void {
    const now = Date.now()
    if (now - lastActivity < throttleMs) return
    lastActivity = now

    if (idle) {
      idle = false
      options.onActive?.()
    }

    scheduleIdle()
  }

  function handleVisibility(): void {
    if (document.hidden) {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    } else {
      handleActivity()
    }
  }

  return {
    start(): void {
      if (started) return
      started = true
      idle = false
      lastActivity = Date.now()

      for (const event of events) {
        document.addEventListener(event, handleActivity, { passive: true })
      }

      if (watchVisibility) {
        document.addEventListener('visibilitychange', handleVisibility)
      }

      scheduleIdle()
    },

    stop(): void {
      if (!started) return
      started = false

      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }

      for (const event of events) {
        document.removeEventListener(event, handleActivity)
      }

      if (watchVisibility) {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    },

    reset(): void {
      if (!started) return

      if (idle) {
        idle = false
        options.onActive?.()
      }

      lastActivity = Date.now()
      scheduleIdle()
    },

    isIdle(): boolean {
      return idle
    },
  }
}
