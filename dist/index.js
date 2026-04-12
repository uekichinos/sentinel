// src/parse-ttl.ts
var UNITS = {
  s: 1e3,
  m: 6e4,
  h: 36e5,
  d: 864e5
};
function parseTtl(ttl) {
  if (typeof ttl === "number") {
    return ttl > 0 ? ttl : null;
  }
  const match = ttl.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2];
  return value > 0 ? value * UNITS[unit] : null;
}

// src/index.ts
var DEFAULT_EVENTS = ["mousemove", "keydown", "scroll", "click", "touchstart"];
var DEFAULT_THROTTLE = 500;
function resolveHeaders(headers) {
  if (!headers) return {};
  return typeof headers === "function" ? headers() : headers;
}
async function fireNotify(notify) {
  const headers = resolveHeaders(notify.headers);
  const hasBody = notify.body !== void 0;
  try {
    await fetch(notify.url, {
      method: notify.method ?? "POST",
      headers: {
        ...hasBody ? { "Content-Type": "application/json" } : {},
        ...headers
      },
      ...hasBody ? { body: JSON.stringify(notify.body) } : {}
    });
  } catch {
  }
}
function createSentinel(options) {
  const parsedTimeout = parseTtl(options.timeout);
  if (!parsedTimeout) throw new Error(`@uekichinos/sentinel: invalid timeout "${options.timeout}"`);
  const timeoutMs = parsedTimeout;
  const events = options.events ?? DEFAULT_EVENTS;
  const throttleMs = options.throttle ?? DEFAULT_THROTTLE;
  const watchVisibility = options.watchVisibility ?? true;
  let timer = null;
  let idle = false;
  let started = false;
  let lastActivity = 0;
  function scheduleIdle() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      idle = true;
      options.onIdle?.();
      if (options.notify) fireNotify(options.notify);
    }, timeoutMs);
  }
  function handleActivity() {
    const now = Date.now();
    if (now - lastActivity < throttleMs) return;
    lastActivity = now;
    if (idle) {
      idle = false;
      options.onActive?.();
    }
    scheduleIdle();
  }
  function handleVisibility() {
    if (document.hidden) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    } else {
      handleActivity();
    }
  }
  return {
    start() {
      if (started) return;
      started = true;
      idle = false;
      lastActivity = Date.now();
      for (const event of events) {
        document.addEventListener(event, handleActivity, { passive: true });
      }
      if (watchVisibility) {
        document.addEventListener("visibilitychange", handleVisibility);
      }
      scheduleIdle();
    },
    stop() {
      if (!started) return;
      started = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      for (const event of events) {
        document.removeEventListener(event, handleActivity);
      }
      if (watchVisibility) {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    },
    reset() {
      if (!started) return;
      if (idle) {
        idle = false;
        options.onActive?.();
      }
      lastActivity = Date.now();
      scheduleIdle();
    },
    isIdle() {
      return idle;
    }
  };
}
export {
  createSentinel
};
//# sourceMappingURL=index.js.map