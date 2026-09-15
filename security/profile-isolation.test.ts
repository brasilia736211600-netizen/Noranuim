import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const root = join(import.meta.dir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('security boundary invariants', () => {
  test('never falls back from a non-default profile to the global cookie manager', () => {
    const cookies = read('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraCookies.kt')
    const module = read('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraViewModule.kt')
    const view = read('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt')

    expect(cookies).toContain('if (profile == "default")')
    expect(cookies).toContain('ProfileStore.getInstance().getProfile(profile)?.cookieManager')
    expect(cookies).toContain('null')
    expect(cookies).not.toContain('else {\n      CookieManager.getInstance()')

    expect(module).toContain('ProfileStore.getInstance().getProfile(profile)?.cookieManager')
    expect(module).not.toContain('ProfileStore.getInstance().getProfile(profile)?.cookieManager\n              ?: CookieManager.getInstance()')
    expect(module).toContain('if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))')

    expect(view).toContain('profileIsolationReady')
    expect(view).toContain('MULTI_PROFILE unsupported; failing closed')
    expect(view).toContain('blocked popup: multi-profile isolation unsupported')
  })

  test('standalone activities never reuse a WebView across profile changes', () => {
    const activity = read('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraStandaloneActivity.kt')
    expect(activity).toContain('configuredProfile')
    expect(activity).toContain('profileIsolationReady')
    expect(activity).toContain('if (nextProfile != configuredProfile)')
    expect(activity).toContain('finishAndRemoveTask()')
    expect(activity).toContain('putExtras(intent)')
    expect(activity).toContain('WebViewCompat.setProfile(webView, profile)')
  })

  test('profile secrets stay out of cloud settings payload construction', () => {
    const sync = read('lib/supabase/sync/settings.ts')
    expect(sync).toContain('proxyUsername')
    expect(sync).toContain('proxyPassword')
    expect(sync).toContain('proxyPacUrl')
    expect(sync).toContain('stripProfileSecrets')
  })

  test('Android cleartext traffic remains disabled by default', () => {
    const config = read('app.config.ts')
    expect(config).toContain('usesCleartextTraffic: false')
  })
})
