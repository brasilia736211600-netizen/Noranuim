import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const root = join(import.meta.dir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const code = (path: string) => {
  const src = read(path)
  // Strip comments (string-aware)
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
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
  return out.replace(/\s+/g, '')
}

describe('user script execution consent invariant', () => {
  test('user script runner checks profile userScriptExecutionConsent before executing', () => {
    const noraTab = read('components/tab/NoraTab.tsx')

    // buildUserScriptRunner must check consent before returning scripts
    expect(noraTab).toContain('buildUserScriptRunner = (host: string, profileId: string, nonce?: string)')
    expect(noraTab).toContain('profile?.userScriptExecutionConsent')
    expect(noraTab).toContain('return \'\'')

    // Call site must pass the profile ID
    expect(noraTab).toContain('buildUserScriptRunner(currentHost, tab.profile || \'default\', nonce)')
  })

  test('Profile interface includes userScriptExecutionConsent', () => {
    const settings = read('states/settings.ts')

    expect(settings).toContain('userScriptExecutionConsent?: boolean')
  })

  test('Profile default includes userScriptExecutionConsent: false', () => {
    const settings = read('states/settings.ts')

    expect(settings).toContain('userScriptExecutionConsent: false')
  })

  test('Profile creation includes userScriptExecutionConsent: false', () => {
    const settings = read('states/settings.ts')

    expect(settings).toContain("userScriptExecutionConsent: false,")
  })

  test('Profile edit modal includes userScriptExecutionConsent toggle', () => {
    const profileEdit = read('components/modal/ProfileEditModal.tsx')

    expect(profileEdit).toContain('userScriptExecutionConsent')
    expect(profileEdit).toContain('setUserScriptExecutionConsent')
    expect(profileEdit).toContain("t('settings.userScriptExecutionConsent')")
  })

  test('Global settings includes userScriptExecutionConsent', () => {
    const settings = read('states/settings.ts')

    expect(settings).toContain('userScriptExecutionConsent: boolean')
    expect(settings).toContain('userScriptExecutionConsent: false')
  })

  test('Settings modal includes userScriptExecutionConsent toggle', () => {
    const settingsModal = read('components/modal/SettingsModalTabSettings.tsx')

    expect(settingsModal).toContain("t('settings.userScriptExecutionConsent')")
    expect(settingsModal).toContain('userScriptExecutionConsent')
    expect(settingsModal).toContain('settings$.userScriptExecutionConsent.toggle()')
  })

  test('English locale includes userScriptExecutionConsent label', () => {
    const locale = read('locales/en.json')

    expect(locale).toContain('userScriptExecutionConsent')
    expect(locale).toContain('Allow custom user scripts to execute on pages')
  })
})