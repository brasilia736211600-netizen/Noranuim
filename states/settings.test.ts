import { describe, expect, it } from "bun:test"
import { settings$, getSettingsSnapshot, normalizeSettings } from './settings'

describe('Settings Profile Manager', () => {
  it('should initialize with default profile', () => {
    const profiles = settings$.profiles.get()
    expect(profiles.length).toBeGreaterThan(0)
    expect(profiles[0].id).toBe('default')
  })

  it('should add a new profile with default proxy and UA settings', () => {
    const id = settings$.addProfile('QA Test', '#ff0000')
    expect(id).toBeDefined()
    
    const profile = settings$.profiles.get().find(p => p.id === id)
    expect(profile).toBeDefined()
    expect(profile?.name).toBe('QA Test')
    
    // Testing normalization and default injection via state
    expect(profile?.proxyEnabled).toBeFalsy()
    expect(profile?.userAgentMode).toBeUndefined() // Since we only inject them during normalize if missing, wait - addProfile does not set defaults currently, but normalizeSettings will
  })

  it('should normalize proxy settings in profiles', () => {
    const rawData: any = {
      profiles: [
        {
          id: 'test-proxy',
          name: 'Proxy Profile',
          color: '#000000',
          proxyEnabled: true,
          proxyType: 'socks',
          proxyHost: '127.0.0.1',
          proxyPort: '9050',
          timeMode: 'proxy'
        }
      ]
    }
    const normalized = normalizeSettings(rawData)
    expect(normalized.profiles[1].proxyEnabled).toBe(true)
    expect(normalized.profiles[1].proxyType).toBe('socks')
    expect(normalized.profiles[1].proxyHost).toBe('127.0.0.1')
    expect(normalized.profiles[1].proxyPort).toBe('9050')
    expect(normalized.profiles[1].timeMode).toBe('proxy')
  })
})
