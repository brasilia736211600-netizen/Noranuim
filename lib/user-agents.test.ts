import { describe, expect, it } from "bun:test"
import { buildUserAgent, USER_AGENTS, resolveProfileUserAgent } from './user-agents'

describe('User Agent Builder', () => {
  it('should have a valid dataset', () => {
    expect(USER_AGENTS).toBeDefined()
    expect(USER_AGENTS.android.versions.length).toBeGreaterThan(0)
    expect(USER_AGENTS.ios.brands.apple).toBeDefined()
  })

  it('should build a valid Android Chrome user agent', () => {
    const ua = buildUserAgent('android', '14', 'google', 'Pixel 8', 'chrome')
    expect(ua).toContain('Android 14')
    expect(ua).toContain('Pixel 8')
    expect(ua).toContain('Chrome')
    expect(ua).toContain('Mobile')
  })

  it('should resolve the correct user agent based on profile settings', () => {
    const defaultUA = resolveProfileUserAgent(undefined, false, 'android')
    expect(defaultUA).not.toContain('Custom')

    const customProfile: any = { userAgentMode: 'custom', customUserAgent: 'My Custom UA 1.0' }
    const customUA = resolveProfileUserAgent(customProfile, false, 'android')
    expect(customUA).toBe('My Custom UA 1.0')

    const builderProfile: any = { userAgentMode: 'builder', uaBuilderState: { os: 'ios', osVersion: '17_5', browser: 'safari' } }
    const builderUA = resolveProfileUserAgent(builderProfile, false, 'android')
    expect(builderUA).toContain('iPhone')
    expect(builderUA).toContain('Safari')
  })
})
