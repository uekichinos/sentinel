import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSentinel } from '../index'

// Track all sentinels created per test so we can stop them in afterEach,
// preventing event listener leakage between tests.
let sentinels: ReturnType<typeof createSentinel>[] = []

function makeSentinel(options: Parameters<typeof createSentinel>[0]) {
  const s = createSentinel(options)
  sentinels.push(s)
  return s
}

beforeEach(() => {
  vi.useFakeTimers()
  sentinels = []
})

afterEach(() => {
  sentinels.forEach((s) => s.stop())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  // Restore document.hidden if it was patched
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

// Helper to set document.hidden without losing dispatchEvent
function setHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { value, configurable: true })
}

// --- basic idle / active ---

describe('createSentinel — idle detection', () => {
  it('is not idle immediately after start', () => {
    const sentinel = makeSentinel({ timeout: '1m' })
    sentinel.start()
    expect(sentinel.isIdle()).toBe(false)
  })

  it('becomes idle after timeout elapses', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle })
    sentinel.start()
    vi.advanceTimersByTime(60_000)
    expect(sentinel.isIdle()).toBe(true)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('does not fire onIdle before timeout', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle })
    sentinel.start()
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('accepts ms number as timeout', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 5000, onIdle })
    sentinel.start()
    vi.advanceTimersByTime(5000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('throws for invalid timeout', () => {
    expect(() => createSentinel({ timeout: 0 })).toThrow()
    expect(() => createSentinel({ timeout: '0m' })).toThrow()
  })
})

// --- activity resets timer ---

describe('createSentinel — activity', () => {
  it('resets timer when activity fires', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle, throttle: 0 })
    sentinel.start()
    vi.advanceTimersByTime(59_000)
    document.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('fires onActive when activity resumes after idle', () => {
    const onActive = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onActive, throttle: 0 })
    sentinel.start()
    vi.advanceTimersByTime(60_000) // go idle
    document.dispatchEvent(new Event('click'))
    expect(onActive).toHaveBeenCalledOnce()
    expect(sentinel.isIdle()).toBe(false)
  })

  it('does not fire onActive when already active', () => {
    const onActive = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onActive, throttle: 0 })
    sentinel.start()
    document.dispatchEvent(new Event('click'))
    expect(onActive).not.toHaveBeenCalled()
  })

  it('respects throttle — ignores rapid activity', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, throttle: 500 })
    sentinel.start()
    // fire 10 events rapidly — only the first should reset the timer
    for (let i = 0; i < 10; i++) {
      document.dispatchEvent(new Event('mousemove'))
    }
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('listens to all default events', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, throttle: 0 })
    sentinel.start()
    const defaultEvents = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']
    for (const event of defaultEvents) {
      vi.advanceTimersByTime(900)
      document.dispatchEvent(new Event(event))
    }
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('respects custom events list', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, throttle: 0, events: ['keydown'] })
    sentinel.start()
    // mousemove should NOT reset the timer since it's not in the custom list
    vi.advanceTimersByTime(900)
    document.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledOnce()
  })
})

// --- stop / reset ---

describe('createSentinel — stop and reset', () => {
  it('stop() cancels the idle timer', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle })
    sentinel.start()
    sentinel.stop()
    vi.advanceTimersByTime(60_000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('stop() removes event listeners', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, throttle: 0 })
    sentinel.start()
    sentinel.stop()
    document.dispatchEvent(new Event('click'))
    vi.advanceTimersByTime(1000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('start() is idempotent — calling twice does not double-register', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle })
    sentinel.start()
    sentinel.start()
    vi.advanceTimersByTime(60_000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('reset() restarts the countdown', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle })
    sentinel.start()
    vi.advanceTimersByTime(59_000)
    sentinel.reset()
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('reset() transitions idle → active', () => {
    const onActive = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onActive })
    sentinel.start()
    vi.advanceTimersByTime(60_000) // go idle
    sentinel.reset()
    expect(sentinel.isIdle()).toBe(false)
    expect(onActive).toHaveBeenCalledOnce()
  })

  it('reset() does nothing when not started', () => {
    const onActive = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onActive })
    expect(() => sentinel.reset()).not.toThrow()
    expect(onActive).not.toHaveBeenCalled()
  })
})

// --- tab visibility ---

describe('createSentinel — watchVisibility', () => {
  it('pauses countdown when tab is hidden', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: '1m', onIdle, watchVisibility: true })
    sentinel.start()
    vi.advanceTimersByTime(30_000)
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000) // would have expired, but timer was cleared
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('resumes countdown when tab becomes visible', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, throttle: 0, watchVisibility: true })
    sentinel.start()
    // hide tab — clears timer
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
    // show tab — restarts timer
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('does not register visibilitychange when watchVisibility: false', () => {
    const onIdle = vi.fn()
    const sentinel = makeSentinel({ timeout: 1000, onIdle, watchVisibility: false })
    sentinel.start()
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(1001)
    // timer was NOT paused, so onIdle fires
    expect(onIdle).toHaveBeenCalledOnce()
  })
})

// --- notify ---

describe('createSentinel — notify', () => {
  it('calls fetch with correct url and method when idle', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({ timeout: 1000, notify: { url: '/api/session/idle' } })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/session/idle')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })

  it('includes static headers in request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: {
        url: '/api/session/idle',
        headers: { Authorization: 'Bearer token123' },
      },
    })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer token123',
    })
  })

  it('calls headers function at idle time — not at init', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    let token = 'initial-token'
    const headersFn = vi.fn(() => ({ Authorization: `Bearer ${token}` }))

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: { url: '/api/session/idle', headers: headersFn },
    })
    sentinel.start()
    token = 'refreshed-token' // token changes before idle fires
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(headersFn).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer refreshed-token',
    })
  })

  it('sends body as JSON with Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: {
        url: '/api/session/idle',
        body: { reason: 'idle', userId: 42 },
      },
    })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    const call = fetchMock.mock.calls[0][1]
    expect(call.body).toBe(JSON.stringify({ reason: 'idle', userId: 42 }))
    expect(call.headers['Content-Type']).toBe('application/json')
  })

  it('omits Content-Type when no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({ timeout: 1000, notify: { url: '/api/session/idle' } })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()
  })

  it('fails silently on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const onIdle = vi.fn()

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: { url: '/api/session/idle' },
      onIdle,
    })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('uses custom HTTP method', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: { url: '/api/session/idle', method: 'PATCH' },
    })
    sentinel.start()
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })

  it('notify fires once per idle period', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sentinel = makeSentinel({
      timeout: 1000,
      notify: { url: '/api/session/idle' },
      throttle: 0,
    })
    sentinel.start()
    vi.advanceTimersByTime(1000) // go idle — notify fires (1)
    await vi.runAllTimersAsync()
    sentinel.reset()             // go active, restart countdown
    vi.advanceTimersByTime(1000) // go idle again — notify fires (2)
    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
