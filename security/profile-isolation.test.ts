import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const root = join(import.meta.dir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

// Strip whitespace and line comments so an assertion describes STRUCTURE, not
// formatting. The literal-string assertions below stay as a readable summary,
// but a regression that is merely re-indented or re-wrapped must still fail:
// the fail-closed invariant is "no branch reachable from a non-default profile
// ever yields the global CookieManager", and that holds regardless of layout.
const code = (path: string) =>
  read(path)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')

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

  test('no non-default branch can resolve to the global cookie manager', () => {
    // Structure check, independent of indentation and line wrapping.
    const cookies = code('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraCookies.kt')
    // The global manager may appear ONLY as the body of the `profile == "default"`
    // test, never in an `else` arm of the same if/else-if/else chain.
    expect(cookies).toContain('if(profile=="default"){CookieManager.getInstance()}')
    expect(cookies).not.toContain('else{CookieManager.getInstance()}')
    expect(cookies).not.toContain('}else{CookieManager.getInstance()}')
    // And the non-default path must end in a fail-closed null, not a manager.
    expect(cookies).toContain('getProfile(profile)?.cookieManager}else{null}')

    const module = code('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraViewModule.kt')
    expect(module).not.toContain('?:CookieManager.getInstance()')
    expect(module).not.toContain('else{CookieManager.getInstance()}')
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
