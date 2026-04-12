"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createSentinel: () => createSentinel
});
module.exports = __toCommonJS(index_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSentinel
});
//# sourceMappingURL=index.cjs.map