import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Permission declaration contract (regression memory for the permission
 * audit finding PERM-UNDECLARED-CAMERA).
 *
 * Nora's WebView asks Android for runtime permissions on behalf of pages
 * (`NoraView.onPermissionRequest` -> `askForPermissions`, and the standalone
 * activity's check-then-grant). Android DENIES a permission that is not in the
 * manifest WITHOUT ever showing a prompt — so when CAMERA went undeclared, the
 * video half of getUserMedia could not be granted by anyone, silently, while
 * the code that asked for it kept looking correct.
 *
 * This test pins the cross-artifact invariant that prevents that class from
 * returning: every permission the native code checks or asks for must be
 * declared in app.config.ts. It is a relation between two artifacts, not a
 * snapshot of either list, so normal permission work does not churn it.
 */

// import.meta.dir is this file's own directory (<repo>/lib), so the repo root
// is ONE level up. Going two levels up lands outside the repository and every
// readFileSync below throws ENOENT — this exact bug failed CI on first push.
const repoRoot = join(import.meta.dir, '..')
if (!existsSync(join(repoRoot, 'app.config.ts'))) {
  throw new Error(`permission-declaration.test.ts: repo root unresolved at ${repoRoot}`)
}

function ktSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      ktSources(path, out)
    } else if (entry.endsWith('.kt')) {
      out.push(path)
    }
  }
  return out
}

const declared = new Set(
  (readFileSync(join(repoRoot, 'app.config.ts'), 'utf8').match(/permissions:\s*\[([^\]]*)\]/s)?.[1] ?? '')
    .split(',')
    .map((entry: string) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean),
)

const asked = new Map<string, string>()
for (const file of ktSources(join(repoRoot, 'modules', 'nora-view', 'android', 'src'))) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/android\.Manifest\.permission\.([A-Z_]+)/g)) {
    asked.set(match[1], relative(repoRoot, file))
  }
}

describe('permission declaration contract', () => {
  it('parses a non-empty declaration list', () => {
    expect(declared.size).toBeGreaterThan(0)
  })

  it('finds the native permission references it is meant to guard', () => {
    // Guards the test itself: if the scan ever silently finds nothing, the
    // contract below would pass vacuously. CAMERA and RECORD_AUDIO are stable
    // fixtures of this module, not a list of everything declared.
    expect(asked.has('RECORD_AUDIO')).toBe(true)
    expect(asked.has('CAMERA')).toBe(true)
  })

  it('declares every permission the native code checks or asks for', () => {
    const undeclared = [...asked]
      .filter(([permission]) => !declared.has(permission))
      .map(([permission, file]) => `${permission} (used in ${file})`)

    expect(undeclared).toEqual([])
  })
})
