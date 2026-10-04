import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const root = join(import.meta.dir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

// Strip comments and whitespace so an assertion describes STRUCTURE, not
// formatting. The literal-string assertions below stay as a readable summary,
// but a regression that is merely re-indented or re-wrapped must still fail:
// the fail-closed invariant is "no branch reachable from a non-default profile
// ever yields the global CookieManager", and that holds regardless of layout.
//
// Comment stripping MUST be string-aware. A naive /\/\/[^\n]*/ eats the rest of
// the line for any URL inside a literal ("https://..."), and a naive
// /\/\*[\s\S]*?\*\// finds its opening '/*' inside `else "*/*"` in NoraView.kt
// and then pairs it with a far later '*/', swallowing ~12KB of real code --
// silently turning every assertion into a pass. NoraView.kt is the file that
// carries the profileIsolation gate, so being blind there is the expensive
// failure mode. This walks the source, skipping over literals untouched.
const stripComments = (src: string): string => {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    // String / char literals: copy verbatim, escapes included, so that '//',
    // '/*' and quotes inside a literal never look like comment delimiters.
    if (c === '"' || c === "'") {
      const triple = c.repeat(3)
      if (src.startsWith(triple, i)) {
        const end = src.indexOf(triple, i + 3)
        const stop = end === -1 ? n : end + 3
        out += src.slice(i, stop)
        i = stop
        continue
      }
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === c) { j += 1; break }
        j += 1
      }
      out += src.slice(i, Math.min(j, n))
      i = Math.min(j, n)
      continue
    }
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? n : nl
      continue
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

const code = (path: string) => stripComments(read(path)).replace(/\s+/g, '')

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

  test('profile isolation fails closed when MULTI_PROFILE is unavailable', () => {
    // NoraView.kt is the file carrying the profile gate, and it is also the one
    // whose `else "*/*"` literal breaks naive comment strippers -- so asserting
    // against it is what proves stripComments is not going blind.
    const view = code('modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt')

    // The gate exists and is consulted before navigation is allowed through.
    expect(view).toContain('privatevarprofileIsolationReady=true')
    expect(view).toContain('if(profileName!="default"&&!profileIsolationReady)')

    // Rejecting a profile must clear the flag, not leave it stale from a
    // previously working profile: a failed setProfile for profile B must not
    // let B navigate on the strength of A's success.
    expect(view).toContain('profileIsolationReady=false')
    // The assertion above alone is weak: `profileIsolationReady = false` also
    // appears in the catch-path, so a regression that removed it from the
    // unsupported-profile branch would still leave that substring on screen.
    // Pin the assignment to the branch that must fail closed.
    expect(view).toContain(
      'if(!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)){profileIsolationReady=false',
    )
    // ...and to the branch's ordering, so a reordering that clears the flag
    // only after profileSet = true cannot slip through.
    expect(view).toContain('profileIsolationReady=falseprofileSet=true')

    // Both reject paths report and stop, rather than continuing on.
    expect(view).toContain('MULTI_PROFILEunsupported;failingclosed')
    expect(view).toContain('profile$profilerejected')
    expect(view).toContain('blockednavigation:profileisolationunavailable')

    // The deny is real: the global CookieManager is not reachable here.
    expect(view).not.toContain('else{CookieManager.getInstance()}')
    expect(view).not.toContain('?:CookieManager.getInstance()')

    // And the string literal that defeats a naive stripper is still present --
    // if this ever changes, the stripper's blind spot changes with it.
    expect(view).toContain('else"*/*"')
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
