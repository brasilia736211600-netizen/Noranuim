import { getUserAgent } from './useragent'

export const USER_AGENTS = {
  android: {
    name: 'Android',
    versions: ['16', '15', '14', '13', '12', '11'],
    brands: {
      samsung: {
        name: 'Samsung',
        models: ['SM-S928B', 'SM-S918B', 'SM-G998B', 'SM-F946B', 'SM-F731B'],
      },
      google: {
        name: 'Google Pixel',
        models: ['Pixel 9 Pro', 'Pixel 8 Pro', 'Pixel 7 Pro', 'Pixel 6a'],
      },
      xiaomi: {
        name: 'Xiaomi',
        models: ['23127PN0CG', '2210132G', '2201122G'],
      }
    },
    browsers: ['chrome', 'firefox', 'edge']
  },
  ios: {
    name: 'iOS',
    versions: ['18_0', '17_5', '16_6', '15_7'],
    brands: {
      apple: {
        name: 'Apple iPhone',
        models: ['iPhone', 'iPad'],
      }
    },
    browsers: ['safari', 'chrome', 'firefox']
  },
  windows: {
    name: 'Windows',
    versions: ['11', '10'],
    brands: {
      pc: {
        name: 'PC',
        models: ['Desktop']
      }
    },
    browsers: ['chrome', 'edge', 'firefox']
  },
  macos: {
    name: 'macOS',
    versions: ['14_5', '13_6', '12_7', '11_7'],
    brands: {
      mac: {
        name: 'Mac',
        models: ['Macintosh']
      }
    },
    browsers: ['safari', 'chrome', 'firefox']
  },
  linux: {
    name: 'Linux',
    versions: ['x86_64', 'i686'],
    brands: {
      pc: {
        name: 'PC',
        models: ['Desktop']
      }
    },
    browsers: ['chrome', 'firefox']
  }
}

export function buildUserAgent(os: string, version: string, brand: string, model: string, browser: string): string {
  if (os === 'android') {
    const v = version || '14'
    const m = model || 'Pixel 8'
    if (browser === 'firefox') return `Mozilla/5.0 (Android ${v}; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0`
    return `Mozilla/5.0 (Linux; Android ${v}; ${m}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36`
  }
  if (os === 'ios') {
    const v = (version || '17_5').replace(/_/g, '.')
    if (browser === 'chrome') return `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/127.0.6533.77 Mobile/15E148 Safari/604.1`
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Mobile/15E148 Safari/604.1`
  }
  if (os === 'windows') {
    const v = version === '11' ? '10.0' : '10.0'
    if (browser === 'firefox') return `Mozilla/5.0 (Windows NT ${v}; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0`
    if (browser === 'edge') return `Mozilla/5.0 (Windows NT ${v}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0`
    return `Mozilla/5.0 (Windows NT ${v}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36`
  }
  if (os === 'macos') {
    if (browser === 'chrome') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36`
    if (browser === 'firefox') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0`
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15`
  }
  if (os === 'linux') {
    if (browser === 'firefox') return `Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0`
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36`
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
}

export function resolveProfileUserAgent(profile: any, isDesktopMode: boolean, platformFallback: string): string {
  if (!profile || !profile.userAgentMode || profile.userAgentMode === 'default') {
    return getUserAgent(platformFallback, isDesktopMode)
  }
  if (profile.userAgentMode === 'custom' && profile.customUserAgent) {
    return profile.customUserAgent
  }
  if (profile.userAgentMode === 'builder' && profile.uaBuilderState) {
    const s = profile.uaBuilderState
    return buildUserAgent(s.os || '', s.osVersion || '', '', s.model || '', s.browser || '')
  }
  return getUserAgent(platformFallback, isDesktopMode)
}
