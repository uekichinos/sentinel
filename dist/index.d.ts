type TtlInput = number | `${number}s` | `${number}m` | `${number}h` | `${number}d`;
type NotifyOptions = {
    /** URL to POST to when the user goes idle */
    url: string;
    /** HTTP method — defaults to 'POST' */
    method?: string;
    /**
     * Headers to include in the request.
     * Pass a function to evaluate headers at call time — useful for dynamic tokens.
     */
    headers?: Record<string, string> | (() => Record<string, string>);
    /** Optional request body — serialised to JSON */
    body?: unknown;
};
type SentinelOptions = {
    /** How long before the user is considered idle */
    timeout: TtlInput;
    /** DOM events that count as user activity (default: mousemove, keydown, scroll, click, touchstart) */
    events?: string[];
    /** Minimum ms between activity handler calls — prevents hammering on mousemove (default: 500) */
    throttle?: number;
    /** Pause the idle countdown while the tab is hidden (default: true) */
    watchVisibility?: boolean;
    /** Fire a fetch request when the user goes idle */
    notify?: NotifyOptions;
    /** Called when the user transitions from active → idle */
    onIdle?: () => void;
    /** Called when the user transitions from idle → active */
    onActive?: () => void;
};
type SentinelInstance = {
    /** Start listening for activity and begin the idle countdown */
    start(): void;
    /** Stop all listeners and cancel the countdown */
    stop(): void;
    /** Reset the idle countdown (and transition idle → active if currently idle) */
    reset(): void;
    /** Returns true if the user is currently idle */
    isIdle(): boolean;
};

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
declare function createSentinel(options: SentinelOptions): SentinelInstance;

export { type NotifyOptions, type SentinelInstance, type SentinelOptions, type TtlInput, createSentinel };
