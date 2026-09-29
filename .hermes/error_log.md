# Error Log — Deterministic Failures & Lessons Learned

**Purpose:** Every deterministic failure encountered during this mission (and previous agents) is recorded here with its signature, root cause, fix, and recurrence status. Before proposing any fix, the agent MUST search this log. If the same error appeared before, the previous fix is reused or the approach is changed.

---

## 2026-09-28 — Current Mission (nora-android-audit-2026-09-28)

### E-001: `npx tsc` fetches wrong package (deprecated `tsc@2.0.4` stub)
- **Context:** Attempted local TypeScript typecheck without `node_modules`
- **Error:** `This is not the tsc command you are looking for` + `Package no longer supported`
- **Root Cause:** `npx` without local install fetches a namesake stub package instead of TypeScript
- **Fix:** Never run `npx <tool>` in a repo without `node_modules`. Defer lint/tsc/tests to CI.
- **Recorded in:** `work_journal.md` Blocker #1, `autopilot-repo-missions` Pitfall #1
- **Recurrence:** NO — rule now enforced

### E-002: `npx expo lint` fails with `Cannot find module 'eslint'`
- **Context:** Attempted local lint without dependencies
- **Error:** Module resolution failure for eslint in npx cache
- **Root Cause:** Expo CLI's lint command requires local `node_modules` with eslint peer deps
- **Fix:** Same as E-001 — defer to CI
- **Recurrence:** NO — rule now enforced

### E-003: Kotlin audit subagent fabricated 37 findings (~100% fake)
- **Context:** Delegated native Android code review to subagent
- **Error:** Claimed nonexistent `executeShellCommand` RCE, nonexistent SSL bypass, nonexistent file-access toggles, wrong file paths (read stale `~/Nora/` clone)
- **Root Cause:** Subagent read wrong directory, hallucinated findings without grep verification
- **Fix:** 
  - Rule D-001: Every subagent finding MUST be grep-verified against working tree before backlog entry
  - Give subagents absolute paths, not relative
  - Independent reviewer subagent for critical changes
- **Recorded in:** `DECISION_LOG.md` D-001, `work_journal.md` Rule #1
- **Recurrence:** NO — verification now mandatory

### E-004: Subagent read stale clone at `~/Nora/` instead of working tree
- **Context:** First Kotlin audit subagent
- **Error:** Reported findings for files that don't exist in actual repo
- **Root Cause:** Subagent CWD was different; relative paths resolved to wrong location
- **Fix:** Always give subagents absolute paths in `context`. Recorded in `autopilot-repo-missions` Pitfall #2
- **Recurrence:** NO — absolute paths now mandatory

### E-005: Subagent free-form report impossible to merge
- **Context:** First security audit subagent returned unstructured text
- **Error:** Hard to consolidate, no line numbers, no severity classification
- **Root Cause:** No `output_schema` provided to subagent
- **Fix:** Every analysis subagent gets a JSON schema (findings[] + summary). Recorded in `autopilot-repo-missions` Pitfall #3
- **Recurrence:** NO — schemas now mandatory

### E-006: Independent reviewer found 5 critical issues in commit `de07e23`
- **Context:** Review of security fix for WebView permission flow
- **Issues Found:**
  1. **Compile error:** `NoraView.kt:590` — `PermissionResource` passed to `IntArray.getOrNull` (type mismatch)
  2. **Compile error:** `NoraViewModule.kt:133` — `OnRequestPermissionsResult` DSL doesn't exist in expo-modules-core@56.0.13
  3. **Crash path:** `onShowFileChooser` no-Activity branch invoked callback + returned false → Chromium throws `IllegalStateException('Duplicate showFileChooser result')`
  4. **Logic bug:** GrantResults index mapping used `PermissionResource.entries` order but `requestPermissions()` was called with page's requested order → camera-only requests always denied after user grants
  5. **Test failure:** `preservesThePagesRequestedOrder` test failed because `resolveWebRtcPermissionGrant` iterated declaration order
- **Root Cause:** Original fix written without compiler verification; assumed Expo DSL had permission result hook; didn't trace Chromium's callback contract
- **Fix (commit `9010393`):**
  1. `filterIndexed` with proper type
  2. Replace DSL with `ActivityEventListener` in `onCreate`
  3. No-Activity path: `setFileChooserCallback(null)` + return false (don't invoke)
  4. Map grantResults by page's requested order (index alignment)
  5. `resolveWebRtcPermissionGrant` reorders to match page's requested order
- **Recurrence:** NO — independent reviewer now mandatory for security changes

### E-007: Build APK workflow only triggers on `main` branch and tags
- **Context:** Pushed feature branch `hermes/autopilot/2026-09-28-android-audit`, expected CI to run
- **Error:** No workflow runs appeared for the branch
- **Root Cause:** `.github/workflows/build.yml` has `push: branches: [main]` only
- **Fix:** APK builds on merge to main; smoke test workflow downloads artifacts from main builds. Feature branches don't trigger builds — this is by design.
- **Recurrence:** NO — documented in `REPOSITORY_ANALYSIS.md` Section 7

---

## Previous Agent Sessions (Recovered from Context)

### E-100: Local Gradle/expo builds attempted on device
- **Context:** Earlier mission attempts
- **Error:** Resource exhaustion, build failures, bandwidth consumption
- **Root Cause:** Building on weak phone instead of GitHub-hosted runners
- **Fix:** All builds in CI — hard rule in `autopilot-repo-missions`
- **Recurrence:** NO

### E-101: Heavy dependency installs on device (`npm install`, Android SDK)
- **Context:** Trying to unblock local lint/tsc
- **Error:** Storage full, battery drain, network saturation
- **Fix:** Defer to CI; read-only static review locally
- **Recurrence:** NO

### E-102: Model hardcoding in delegation calls
- **Context:** Subagents dispatched with hardcoded model names
- **Error:** Model became unavailable, rotation failed silently
- **Fix:** Data-driven model catalog (`model_catalog.json`) + background scout
- **Recurrence:** NO — catalog now in place

---

## Search Protocol

Before any fix attempt:
```bash
# Search error log for similar patterns
grep -i "<error keywords>" /data/data/com.termux/files/home/Noranuim/.hermes/error_log.md

# Search work journal for related decisions
grep -i "<keywords>" /data/data/com.termux/files/home/Noranuim/.hermes/work_journal.md
```

If match found → reuse previous fix or change approach. Never repeat a failed approach.