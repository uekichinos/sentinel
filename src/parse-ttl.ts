import type { TtlInput } from './types'

const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

/**
 * Converts a TTL value to milliseconds.
 * Returns `null` for invalid or zero input.
 */
export function parseTtl(ttl: TtlInput): number | null {
  if (typeof ttl === 'number') {
    return ttl > 0 ? ttl : null
  }

  const match = ttl.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/)
  if (!match) return null

  const value = parseFloat(match[1])
  const unit = match[2]

  return value > 0 ? value * UNITS[unit] : null
}
