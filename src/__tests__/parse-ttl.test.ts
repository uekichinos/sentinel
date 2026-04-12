import { describe, expect, it } from 'vitest'
import { parseTtl } from '../parse-ttl'

describe('parseTtl', () => {
  it('returns number as-is when positive', () => {
    expect(parseTtl(5000)).toBe(5000)
  })

  it('returns null for zero ms', () => {
    expect(parseTtl(0)).toBeNull()
  })

  it('returns null for negative ms', () => {
    expect(parseTtl(-1000)).toBeNull()
  })

  it('parses seconds', () => {
    expect(parseTtl('30s')).toBe(30_000)
  })

  it('parses minutes', () => {
    expect(parseTtl('15m')).toBe(900_000)
  })

  it('parses hours', () => {
    expect(parseTtl('1h')).toBe(3_600_000)
  })

  it('parses days', () => {
    expect(parseTtl('1d')).toBe(86_400_000)
  })

  it('returns null for zero value string', () => {
    expect(parseTtl('0m')).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(parseTtl('abc' as never)).toBeNull()
    expect(parseTtl('1x' as never)).toBeNull()
  })
})
