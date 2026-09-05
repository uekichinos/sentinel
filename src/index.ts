import { createChannel, type CrossTabChannel, type CrossTabMessage } from './cross-tab'
import { parseTtl } from './parse-ttl'
import type { NotifyOptions, SentinelInstance, SentinelOptions } from './types'

export type { SentinelOptions, SentinelInstance, NotifyOptions, TtlInput } from './types'

const DEFAULT_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']
const DEFAULT_THROTTLE = 500

async function resolveHeaders(headers: NotifyOptions['headers']): Promise<Record<string, string>> {
  if (!headers) return {}
  const result = typeof headers === 'function' ? headers() : headers
  return result instanceof Promise ? await result : result
}

function resolveBody(body: NotifyOptions['body']): unknown {
  return typeof body === 'function' ? (body as () => unknown)() : body
}

async function fireNotify(notify: NotifyOptions): Promise<void> {
  const headers = await resolveHeaders(notify.headers)
  const body = resolveBody(notify.body)
  const hasBody = body !== undefined

  try {
    await fetch(notify.url, {
      method: notify.method ?? 'POST',
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
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
 *   promptBeforeIdle: '1m',
 *   crossTab: true,
 *   leaderElection: true,
 *   onPrompt: () => showCountdownDialog(),
 *   onIdle: () => logout(),
 *   onActive: () => hideCountdownDialog(),
 * })
 *
 * sentinel.start()
 */
export function createSentinel(options: SentinelOptions): SentinelInstance {
  const parsedTimeout = parseTtl(options.timeout)
  if (!parsedTimeout) throw new Error(`@uekichinos/sentinel: invalid timeout "${options.timeout}"`)
  const timeoutMs: number = parsedTimeout

  let promptMs = 0
  if (options.promptBeforeIdle != null) {
    const parsedPrompt = parseTtl(options.promptBeforeIdle)
    if (!parsedPrompt) {
      throw new Error(
        `@uekichinos/sentinel: invalid promptBeforeIdle "${options.promptBeforeIdle}"`,
      )
    }
    if (parsedPrompt >= timeoutMs) {
      throw new Error('@uekichinos/sentinel: promptBeforeIdle must be shorter than timeout')
    }
    promptMs = parsedPrompt
  }

  const events = options.events ?? DEFAULT_EVENTS
  const immediateEvents = options.immediateEvents ?? []
  // Resolved lazily in start() so the sentinel can be constructed during SSR.
  let target: Document | HTMLElement | null = options.element ?? null
  const throttleMs = options.throttle ?? DEFAULT_THROTTLE
  const watchVisibility = options.watchVisibility ?? true
  const crossTab = options.crossTab ?? false
  const leaderElection = options.leaderElection ?? false
  const channelName = options.name ?? 'default'
  const tabId = Math.floor(Math.random() * 2 ** 31)

  let promptTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let idleTarget: number | null = null
  let idle = false
  let prompted = false
  let started = false
  let paused = false
  let pausedRemainingMs = 0
  let lastActivityAt = 0
  let lastHandledAt = 0

  let channel: CrossTabChannel | null = null
  const peers = new Set<number>()

  function isLeader(): boolean {
    if (!crossTab || !channel || !leaderElection) return true
    for (const peerId of peers) {
      if (peerId < tabId) return false
    }
    return true
  }

  function clearTimers(): void {
    if (promptTimer !== null) {
      clearTimeout(promptTimer)
      promptTimer = null
    }
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function goPrompt(fromRemote: boolean): void {
    if (prompted || idle || !started) return
    prompted = true
    options.onPrompt?.()
    if (!fromRemote && channel) channel.post({ t: 'prompt', id: tabId })
  }

  function goIdle(fromRemote: boolean): void {
    if (idle || !started) return
    clearTimers()
    idle = true
    prompted = false
    idleTarget = null
    options.onIdle?.()

    const mayNotify = !crossTab || (leaderElection ? isLeader() : !fromRemote)
    if (options.notify && mayNotify) fireNotify(options.notify)

    if (!fromRemote && channel) channel.post({ t: 'idle', id: tabId })
  }

  function goActive(): void {
    if (!idle && !prompted) return
    idle = false
    prompted = false
    options.onActive?.()
  }

  function scheduleTimers(remainingMs: number = timeoutMs): void {
    clearTimers()
    if (paused || !started) return
    if (watchVisibility && document.hidden) {
      idleTarget = null
      return
    }

    const now = Date.now()
    idleTarget = now + remainingMs

    if (promptMs > 0 && !prompted) {
      const promptDelay = remainingMs - promptMs
      if (promptDelay <= 0) {
        goPrompt(false)
      } else {
        promptTimer = setTimeout(() => {
          promptTimer = null
          goPrompt(false)
        }, promptDelay)
      }
    }

    idleTimer = setTimeout(() => {
      idleTimer = null
      goIdle(false)
    }, remainingMs)
  }

  function registerActivity(
    event: Event | undefined,
    opts: { broadcast: boolean; fromRemote: boolean },
  ): void {
    if (!started || paused) return

    const now = Date.now()
    lastActivityAt = now

    if (now - lastHandledAt < throttleMs) return
    lastHandledAt = now

    if (idle || prompted) goActive()
    if (!opts.fromRemote) options.onActivity?.(event)

    scheduleTimers()

    if (opts.broadcast && channel) channel.post({ t: 'activity', id: tabId })
  }

  function handleActivity(event: Event): void {
    registerActivity(event, { broadcast: true, fromRemote: false })
  }

  function handleImmediate(): void {
    if (!started || paused || idle) return
    goIdle(false)
  }

  function handleVisibility(): void {
    if (paused) return
    if (document.hidden) {
      clearTimers()
      idleTarget = null
    } else {
      // resume the countdown, but don't count returning to the tab as fresh
      // user activity or broadcast it to other tabs
      registerActivity(undefined, { broadcast: false, fromRemote: true })
    }
  }

  function handleChannelMessage(msg: CrossTabMessage): void {
    if (msg.id === tabId) return
    switch (msg.t) {
      case 'join':
        peers.add(msg.id)
        channel?.post({ t: 'presence', id: tabId })
        break
      case 'presence':
        peers.add(msg.id)
        break
      case 'leave':
        peers.delete(msg.id)
        break
      case 'activity':
        registerActivity(undefined, { broadcast: false, fromRemote: true })
        break
      case 'prompt':
        goPrompt(true)
        break
      case 'idle':
        goIdle(true)
        break
    }
  }

  function handlePageHide(): void {
    channel?.post({ t: 'leave', id: tabId })
  }

  const instance: SentinelInstance = {
    start(): void {
      if (started) return
      started = true
      idle = false
      prompted = false
      paused = false
      lastActivityAt = Date.now()
      lastHandledAt = Date.now()

      target = options.element ?? document

      for (const event of events) {
        target.addEventListener(event, handleActivity, { passive: true })
      }
      for (const event of immediateEvents) {
        target.addEventListener(event, handleImmediate, { passive: true })
      }
      if (watchVisibility) {
        document.addEventListener('visibilitychange', handleVisibility)
      }

      if (crossTab) {
        channel = createChannel(channelName, handleChannelMessage)
        if (channel) {
          channel.post({ t: 'join', id: tabId })
          if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', handlePageHide)
          }
        }
      }

      scheduleTimers()
    },

    stop(): void {
      if (!started) return
      started = false
      paused = false

      clearTimers()
      idleTarget = null

      for (const event of events) {
        target?.removeEventListener(event, handleActivity)
      }
      for (const event of immediateEvents) {
        target?.removeEventListener(event, handleImmediate)
      }
      if (watchVisibility) {
        document.removeEventListener('visibilitychange', handleVisibility)
      }

      if (channel) {
        channel.post({ t: 'leave', id: tabId })
        channel.close()
        channel = null
        if (typeof window !== 'undefined') {
          window.removeEventListener('pagehide', handlePageHide)
        }
      }
      peers.clear()
    },

    reset(): void {
      if (!started) return

      if (idle || prompted) goActive()
      paused = false
      lastActivityAt = Date.now()
      lastHandledAt = Date.now()
      scheduleTimers()

      if (channel) channel.post({ t: 'activity', id: tabId })
    },

    pause(): void {
      if (!started || paused) return
      pausedRemainingMs = idle || idleTarget === null ? 0 : Math.max(0, idleTarget - Date.now())
      paused = true
      clearTimers()
      idleTarget = null
    },

    resume(): void {
      if (!started || !paused) return
      paused = false
      if (idle) return
      lastHandledAt = Date.now()
      scheduleTimers(pausedRemainingMs > 0 ? pausedRemainingMs : timeoutMs)
    },

    isIdle(): boolean {
      return idle
    },

    isPrompted(): boolean {
      return prompted
    },

    getRemainingMs(): number {
      if (paused) return pausedRemainingMs
      if (idle || !started || idleTarget === null) return 0
      return Math.max(0, idleTarget - Date.now())
    },

    getLastActiveTime(): number {
      return started ? lastActivityAt : 0
    },

    getElapsedTime(): number {
      return started ? Math.max(0, Date.now() - lastActivityAt) : 0
    },

    isLeader,

    getTabId(): number {
      return tabId
    },
  }

  if (options.autoStart) instance.start()

  return instance
}
