import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSentinel } from '../index'

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
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.body.innerHTML = ''
})

// --- 1. prompt phase ---

describe('createSentinel — promptBeforeIdle', () => {
  it('fires onPrompt before onIdle', () => {
    const onPrompt = vi.fn()
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, promptBeforeIdle: 300, onPrompt, onIdle })
    s.start()

    vi.advanceTimersByTime(700)
    expect(onPrompt).toHaveBeenCalledOnce()
    expect(onIdle).not.toHaveBeenCalled()
    expect(s.isPrompted()).toBe(true)
    expect(s.isIdle()).toBe(false)

    vi.advanceTimersByTime(300)
    expect(onIdle).toHaveBeenCalledOnce()
    expect(s.isPrompted()).toBe(false)
    expect(s.isIdle()).toBe(true)
  })

  it('getRemainingMs still counts down to idle during the prompt phase', () => {
    const s = makeSentinel({ timeout: 1000, promptBeforeIdle: 300 })
    s.start()
    vi.advanceTimersByTime(800)
    expect(s.isPrompted()).toBe(true)
    const remaining = s.getRemainingMs()
    expect(remaining).toBeGreaterThan(190)
    expect(remaining).toBeLessThanOrEqual(200)
  })

  it('activity during the prompt phase returns to active', () => {
    const onPrompt = vi.fn()
    const onActive = vi.fn()
    const onIdle = vi.fn()
    const s = makeSentinel({
      timeout: 1000,
      promptBeforeIdle: 300,
      throttle: 0,
      onPrompt,
      onActive,
      onIdle,
    })
    s.start()

    vi.advanceTimersByTime(800) // prompted
    expect(s.isPrompted()).toBe(true)

    document.dispatchEvent(new Event('click'))
    expect(onActive).toHaveBeenCalledOnce()
    expect(s.isPrompted()).toBe(false)

    // the full countdown restarts — prompt re-fires at +700ms, idle at +1000ms
    vi.advanceTimersByTime(699)
    expect(onPrompt).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    expect(onPrompt).toHaveBeenCalledTimes(2)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('throws when promptBeforeIdle is not shorter than timeout', () => {
    expect(() => createSentinel({ timeout: 1000, promptBeforeIdle: 1000 })).toThrow()
    expect(() => createSentinel({ timeout: '1m', promptBeforeIdle: '2m' })).toThrow()
  })

  it('throws for an invalid promptBeforeIdle', () => {
    expect(() => createSentinel({ timeout: '1m', promptBeforeIdle: '0s' })).toThrow()
    expect(() => createSentinel({ timeout: '1m', promptBeforeIdle: 'nope' as never })).toThrow()
  })
})

// --- 2. pause / resume ---

describe('createSentinel — pause and resume', () => {
  it('pause() freezes the countdown and preserves remaining time', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, onIdle })
    s.start()
    vi.advanceTimersByTime(400)
    s.pause()

    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
    expect(s.getRemainingMs()).toBe(600)
  })

  it('resume() continues from where it left off', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, onIdle })
    s.start()
    vi.advanceTimersByTime(400)
    s.pause()
    vi.advanceTimersByTime(5000)
    s.resume()

    vi.advanceTimersByTime(599)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('ignores activity while paused', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, onIdle, throttle: 0 })
    s.start()
    vi.advanceTimersByTime(400)
    s.pause()
    document.dispatchEvent(new Event('click'))
    s.resume()

    // resumed with 600ms remaining, not reset to the full 1000ms
    vi.advanceTimersByTime(599)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('stays paused across tab visibility changes', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, onIdle })
    s.start()
    vi.advanceTimersByTime(400)
    s.pause()

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()

    s.resume()
    vi.advanceTimersByTime(601)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('pause() and resume() are no-ops in the wrong state', () => {
    const s = makeSentinel({ timeout: 1000 })
    expect(() => s.pause()).not.toThrow() // not started
    expect(() => s.resume()).not.toThrow()
    s.start()
    expect(() => s.resume()).not.toThrow() // not paused
  })
})

// --- 3. onActivity ---

describe('createSentinel — onActivity', () => {
  it('fires on every accepted activity, not just transitions', () => {
    const onActivity = vi.fn()
    const s = makeSentinel({ timeout: 10_000, onActivity, throttle: 0 })
    s.start()
    document.dispatchEvent(new Event('mousemove'))
    document.dispatchEvent(new Event('keydown'))
    expect(onActivity).toHaveBeenCalledTimes(2)
  })

  it('respects throttle', () => {
    const onActivity = vi.fn()
    const s = makeSentinel({ timeout: 10_000, onActivity, throttle: 500 })
    s.start()
    for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('mousemove'))
    expect(onActivity).toHaveBeenCalledTimes(0) // all inside the throttle window of start()

    vi.advanceTimersByTime(600)
    document.dispatchEvent(new Event('mousemove'))
    expect(onActivity).toHaveBeenCalledTimes(1)
  })

  it('passes the DOM event through', () => {
    const onActivity = vi.fn()
    const s = makeSentinel({ timeout: 10_000, onActivity, throttle: 0 })
    s.start()
    const evt = new Event('click')
    document.dispatchEvent(evt)
    expect(onActivity).toHaveBeenCalledWith(evt)
  })
})

// --- 4. immediateEvents ---

describe('createSentinel — immediateEvents', () => {
  it('sends the user straight to idle, bypassing the countdown', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 60_000, immediateEvents: ['session-end'], onIdle })
    s.start()
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(new Event('session-end'))
    expect(onIdle).toHaveBeenCalledOnce()
    expect(s.isIdle()).toBe(true)
  })

  it('fires notify', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const s = makeSentinel({
      timeout: 60_000,
      immediateEvents: ['blur'],
      notify: { url: '/api/idle' },
    })
    s.start()
    document.dispatchEvent(new Event('blur'))
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('is a no-op when already idle', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, immediateEvents: ['blur'], onIdle })
    s.start()
    vi.advanceTimersByTime(1000) // already idle via timeout
    document.dispatchEvent(new Event('blur'))
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('removes its listeners on stop()', () => {
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 60_000, immediateEvents: ['blur'], onIdle })
    s.start()
    s.stop()
    document.dispatchEvent(new Event('blur'))
    expect(onIdle).not.toHaveBeenCalled()
  })
})

// --- 5. getLastActiveTime / getElapsedTime ---

describe('createSentinel — activity timestamps', () => {
  it('getElapsedTime grows over time and resets on activity', () => {
    const s = makeSentinel({ timeout: 60_000, throttle: 0 })
    s.start()
    vi.advanceTimersByTime(3000)
    expect(s.getElapsedTime()).toBeGreaterThanOrEqual(3000)

    document.dispatchEvent(new Event('click'))
    expect(s.getElapsedTime()).toBeLessThan(50)
  })

  it('getLastActiveTime returns an epoch timestamp while running', () => {
    const s = makeSentinel({ timeout: 60_000 })
    s.start()
    expect(s.getLastActiveTime()).toBeGreaterThan(0)
    expect(Math.abs(s.getLastActiveTime() - Date.now())).toBeLessThan(50)
  })

  it('both return 0 before start and after stop', () => {
    const s = makeSentinel({ timeout: 60_000 })
    expect(s.getLastActiveTime()).toBe(0)
    expect(s.getElapsedTime()).toBe(0)
    s.start()
    s.stop()
    expect(s.getLastActiveTime()).toBe(0)
    expect(s.getElapsedTime()).toBe(0)
  })

  it('updates the timestamp even for throttled events', () => {
    const s = makeSentinel({ timeout: 60_000, throttle: 5000 })
    s.start()
    vi.advanceTimersByTime(2000)
    document.dispatchEvent(new Event('mousemove')) // throttled — no reschedule
    expect(s.getElapsedTime()).toBeLessThan(50)
  })
})

// --- 6. element scoping ---

describe('createSentinel — element scoping', () => {
  it('only counts activity inside the given element', () => {
    const onIdle = vi.fn()
    const box = document.createElement('div')
    document.body.appendChild(box)
    const s = makeSentinel({ timeout: 1000, throttle: 0, element: box, onIdle })
    s.start()

    vi.advanceTimersByTime(900)
    document.dispatchEvent(new Event('click')) // outside the scoped element
    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('resets on activity inside the scoped element', () => {
    const onIdle = vi.fn()
    const box = document.createElement('div')
    document.body.appendChild(box)
    const s = makeSentinel({ timeout: 1000, throttle: 0, element: box, onIdle })
    s.start()

    vi.advanceTimersByTime(900)
    box.dispatchEvent(new Event('click'))
    vi.advanceTimersByTime(900)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('removes scoped listeners on stop()', () => {
    const onIdle = vi.fn()
    const box = document.createElement('div')
    document.body.appendChild(box)
    const s = makeSentinel({ timeout: 1000, throttle: 0, element: box, onIdle })
    s.start()
    s.stop()
    box.dispatchEvent(new Event('click'))
    vi.advanceTimersByTime(1000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})

// --- 7. autoStart ---

describe('createSentinel — autoStart', () => {
  it('begins the countdown without an explicit start() call', () => {
    const onIdle = vi.fn()
    makeSentinel({ timeout: 1000, autoStart: true, onIdle })
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('defaults to off', () => {
    const onIdle = vi.fn()
    makeSentinel({ timeout: 1000, onIdle })
    vi.advanceTimersByTime(1000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})

// --- SSR safety ---

describe('createSentinel — SSR construction', () => {
  it('does not touch document until start() is called', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
    // simulate a server environment where `document` is undefined
    // @ts-expect-error — deliberately removing the global for the test
    delete globalThis.document

    try {
      expect(() => createSentinel({ timeout: '15m', onIdle: () => {} })).not.toThrow()
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, 'document', originalDescriptor)
    }
  })
})

// --- cross-tab sync ---

// happy-dom has no BroadcastChannel — provide a synchronous in-memory stand-in
// so cross-tab behaviour is deterministic under fake timers.
class MockBroadcastChannel {
  static registry = new Map<string, Set<MockBroadcastChannel>>()
  onmessage: ((ev: { data: unknown }) => void) | null = null
  private closed = false

  constructor(public name: string) {
    if (!MockBroadcastChannel.registry.has(name)) {
      MockBroadcastChannel.registry.set(name, new Set())
    }
    MockBroadcastChannel.registry.get(name)!.add(this)
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('channel closed')
    const clone = JSON.parse(JSON.stringify(data))
    for (const peer of MockBroadcastChannel.registry.get(this.name) ?? []) {
      if (peer === this || peer.closed) continue
      peer.onmessage?.({ data: clone })
    }
  }

  close(): void {
    this.closed = true
    MockBroadcastChannel.registry.get(this.name)?.delete(this)
  }

  static reset(): void {
    MockBroadcastChannel.registry.clear()
  }
}

describe('createSentinel — crossTab', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset()
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  })

  function twoTabs(opts: Partial<Parameters<typeof createSentinel>[0]> = {}) {
    const d1 = document.createElement('div')
    const d2 = document.createElement('div')
    document.body.append(d1, d2)
    const base = { timeout: 1000, throttle: 0, crossTab: true, ...opts } as Parameters<
      typeof createSentinel
    >[0]
    const s1 = makeSentinel({ ...base, element: d1 })
    const s2 = makeSentinel({ ...base, element: d2 })
    return { s1, s2, d1, d2 }
  }

  it('activity in one tab keeps the other tab alive', () => {
    const onIdle1 = vi.fn()
    const onIdle2 = vi.fn()
    const { s1, s2, d1 } = twoTabs()
    s1.start()
    s2.start()

    vi.advanceTimersByTime(900)
    d1.dispatchEvent(new Event('click')) // resets s1 locally and s2 over the channel

    vi.advanceTimersByTime(900)
    expect(onIdle1).not.toHaveBeenCalled()
    expect(onIdle2).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(s1.isIdle()).toBe(true)
    expect(s2.isIdle()).toBe(true)
    void onIdle1
    void onIdle2
  })

  it('idle in one tab makes the other tab idle', () => {
    const onIdle2 = vi.fn()
    const d1 = document.createElement('div')
    const d2 = document.createElement('div')
    document.body.append(d1, d2)
    const s1 = makeSentinel({ timeout: 1000, crossTab: true, element: d1 })
    const s2 = makeSentinel({ timeout: 5000, crossTab: true, element: d2, onIdle: onIdle2 })
    s1.start()
    s2.start()

    vi.advanceTimersByTime(1000) // s1 idles first, s2 would not idle until 5s
    expect(s1.isIdle()).toBe(true)
    expect(s2.isIdle()).toBe(true)
    expect(onIdle2).toHaveBeenCalledOnce()
  })

  it('without crossTab the tabs are independent', () => {
    const onIdle2 = vi.fn()
    const d1 = document.createElement('div')
    const d2 = document.createElement('div')
    document.body.append(d1, d2)
    const s1 = makeSentinel({ timeout: 1000, throttle: 0, element: d1 })
    const s2 = makeSentinel({ timeout: 1000, throttle: 0, element: d2, onIdle: onIdle2 })
    s1.start()
    s2.start()

    vi.advanceTimersByTime(900)
    d1.dispatchEvent(new Event('click'))
    vi.advanceTimersByTime(200)
    expect(onIdle2).toHaveBeenCalledOnce() // s2 was not reset
  })

  it('notifies once across tabs without leaderElection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { s1, s2 } = twoTabs({ notify: { url: '/api/idle' } })
    s1.start()
    s2.start()

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('only the leader notifies with leaderElection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { s1, s2 } = twoTabs({ leaderElection: true, notify: { url: '/api/idle' } })
    s1.start()
    s2.start()

    expect([s1.isLeader(), s2.isLeader()].filter(Boolean)).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('isLeader() is true when crossTab is off', () => {
    const s = makeSentinel({ timeout: 1000 })
    s.start()
    expect(s.isLeader()).toBe(true)
  })

  it('getTabId() is stable and unique per instance', () => {
    const { s1, s2 } = twoTabs()
    s1.start()
    s2.start()
    expect(s1.getTabId()).toBe(s1.getTabId())
    expect(s1.getTabId()).not.toBe(s2.getTabId())
  })

  it('silently no-ops when BroadcastChannel is unavailable', () => {
    vi.unstubAllGlobals()
    const onIdle = vi.fn()
    const s = makeSentinel({ timeout: 1000, crossTab: true, onIdle })
    expect(() => s.start()).not.toThrow()
    expect(s.isLeader()).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledOnce()
  })
})
