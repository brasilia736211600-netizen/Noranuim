import { describe, expect, it } from 'bun:test'
import { resolveProfileUserAgent } from '@/lib/user-agents'

describe('User Agent Resolver', () => {
  it('should resolve default when mode is default', () => {
    const profile = { userAgentMode: 'default' }
    const ua = resolveProfileUserAgent(profile, false, 'android')
    expect(ua).toBeDefined()
  })

  it('should resolve custom when mode is custom', () => {
    const profile = { userAgentMode: 'custom', customUserAgent: 'My UA' }
    const ua = resolveProfileUserAgent(profile, false, 'android')
    expect(ua).toBe('My UA')
  })

  it('should resolve builder when mode is builder', () => {
    const profile = { userAgentMode: 'builder', uaBuilderState: { os: 'ios' } }
    const ua = resolveProfileUserAgent(profile, false, 'android')
    expect(ua).toContain('iPhone')
  })
})
