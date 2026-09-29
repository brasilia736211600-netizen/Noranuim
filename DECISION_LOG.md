# Decision Log — Nora Android Audit Mission

Branch: `hermes/autopilot/2026-09-28-ios-parity` (current; created from `origin/main@82eb350`)
Previous: `hermes/autopilot/2026-09-28-android-audit` (merged via PR #15)

---

## D-001: Rejecting the delegated Kotlin audit (fabricated findings)

**Context:** Subagent `sa-0-be8b8657` returned 37 findings (6 "critical") on the native Android module.

**Decision:** Reject the report in full. Do not act on any of it.

**Verification performed:** Every claimed finding was grepped against the real source.

| Claimed finding | Claimed location | Reality |
|---|---|---|
| `executeShellCommand` → RCE | `NouJsInterface.kt:105` | **Does not exist.** The file is 19 lines with only `onMessage` and `setScrolledRegions`. |
| `setAllowFileAccess` / `setAllowUniversalAccessFromFileURLs` | `NoraView.kt:67,72` | **Does not exist.** WebView settings block sets neither. |
| `onReceivedSslError` → `handler.proceed()` | `NoraView.kt:125` | **Does not exist.** No SSL error override anywhere; the platform default (cancel) applies. |
| `MIXED_CONTENT_ALWAYS_ALLOW` | `NoraView.kt:89` | **Does not exist.** |
| `onGeolocationPermissionsShowPrompt` auto-grant | `NoraView.kt:931` | **Does not exist.** |
| `onKeyDown` / `KEYCODE_BACK` bug | `NoraView.kt:845` | **Does not exist.** Back handling lives in `NoraStandaloneActivity.onBackPressed`, which *does* check `canGoBack()` first. |
| `onConsoleMessage` logging | `NoraView.kt:245` | **Does not exist.** |
| Clipboard / device-info / screenshot / share bridge methods | `NouJsInterface.kt:34,58,82,128,156` | **Do not exist.** |
| `DownloadManager.startDownload` private API | `NoraView.kt:623` | **Does not exist.** |
| Test file in production source tree | `NormalizeFileNameTest.kt:1` | **False.** It correctly lives in `android/src/test/java/…`. |
| `NoraView.kt` is 1376 lines | — | **True**, but it is a *maintainability* note, not a security issue, and is not a regression (pre-existing). |

**Why this matters:** acting on the report would have meant either editing code that does not contain the alleged vulnerability, or "fixing" the SSL error path by *adding* an `onReceivedSslError` override that does not currently exist — introducing a certificate-validation bypass into a browser app. The mission's own rule (`do NOT trust sub-agent output without an independent reviewer verdict`) exists for exactly this case.

**Root cause of the failure:** the child also read a *different, stale clone* at `~/Nora/` (visible in its transcript: "File not found: /data/data/com.termux/files/home/Nora/…") and, when that path was missing, produced plausible-sounding findings anchored to line numbers it could not have read. Line numbers in the report (e.g. `NoraView.kt:931` in a file it could not fully load) are the tell.

**Correction applied to the workflow:** every subagent finding must now be grep-verified against the working tree before it enters the backlog. This becomes `REVIEW-01` and is a standing rule for the rest of the mission.

---

## D-002: Static analysis runs in CI, not on the device

**Context:** `node_modules` is absent. `npx tsc` resolved to the wrong package (`tsc@2.0.4`, a stub) and `npx expo lint` failed with `Cannot find module 'eslint'`.

**Decision:** Do not `npm install` locally. Run lint, typecheck, Kotlin unit tests, and APK builds on GitHub Actions (`ubuntu-latest`), which the repo already wires up in `.github/workflows/build.yml`.

**Rationale:** the user's device is resource-constrained; a full install of an Expo + React Native tree is a large download and several GB of writes for tooling that CI provides for free. Verification still happens — it just happens off-device.

---

## D-003: Real security findings (verified by direct source reading)

These are the issues the audit actually found. Each is confirmed present in the source.

### SEC-01 (high) — WebView grants camera/mic without checking the permission result
`modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt`, `onPermissionRequest`

```kotlin
activity.requestPermissions(permissionsToRequest.toTypedArray(), 101)
request.grant(resources)
```

`request.grant(resources)` runs unconditionally, in the same breath as the request, so the WebView is told the resource is available before Android has resolved the runtime permission. If the user denies, the page believes it holds the stream and mis-handles the failure; if the user never sees a prompt (permission already denied with "don't ask again"), the page still gets a granted verdict. The in-file comment concedes this is unfinished: *"In a real production app, we should handle the result of the permission request."*

**Fix:** hold the pending `PermissionRequest` and resolve it from `onRequestPermissionsResult` — grant the requested resources only when the matching runtime permission is actually `PERMISSION_GRANTED`, deny otherwise. `NoraStandaloneActivity.onPermissionRequest` already does the check-then-grant correctly and is the model to follow.

### SEC-02 (medium) — `onShowFileChooser` returns `true` when there is no Activity
`NoraView.kt`, `onShowFileChooser`

```kotlin
val activity = currentActivity
activity?.startActivityForResult(intent, 0)
return true
```

Returning `true` tells the WebView the chooser was launched, so the page's `<input type="file">` stays pending forever and its `onchange` never fires. With no Activity there is no chooser to return to. `NoraStandaloneActivity` handles this case correctly by returning `false`.

**Fix:** return `false` when `currentActivity` is null, and clear the stored callback so it is not left dangling.

### SEC-03 (low, pre-existing) — cleartext traffic enabled app-wide
`app.config.ts` sets `usesCleartextTraffic: true`, and `allowHttpWebsite` defaults to `true` in `states/settings.ts`.

This is a deliberate product decision (the app browses arbitrary sites, and blocks HTTP at the `shouldInterceptRequest` level when the user turns the setting off) rather than a defect. It is recorded, not changed — flipping either default would break plain-HTTP sites users can currently open, which the mission forbids without a documented migration path.

**Residual risk:** any HTTP page is loaded in cleartext regardless of per-site settings until the user disables the setting. Worth an in-app warning; out of scope for this branch.

---

## D-004: Bridge surface is appropriately narrow

`NouJsInterface` exposes exactly two `@JavascriptInterface` methods, and neither one is attacker-controllable in a dangerous way: `onMessage` forwards a string to a JS event, `setScrolledRegions` parses rectangles for pull-to-refresh. The bridge is added under a namespaced name (`"NoraI"`) and the page's own content scripts are the only callers.

The subagent's claims that this file contained clipboard, shell, device-info, screenshot, and share methods were entirely fabricated. Recorded here so a future reviewer does not have to re-derive it.

---

## D-005: Adopt `NoraniumPromptPlus.md` process rules before resuming repo work

**Context:** The user supplied `~/NoraniumPromptPlus.md` (1215 lines) and asked whether its rules should be applied before continuing repository tasks, or whether deferring them was safer.

**Decision:** Apply the process rules FIRST (ADOPT-NOMERGE-01, skills enrichment, model-catalog refresh, per-task reasoning effort, PR report format), then resume code work.

**Rationale:** The rules change *how deliverables are produced and reported*. Applying them after more code work would require re-doing or re-reporting that work in the new format — exactly the rework the user wanted to avoid. Applying them first costs one short phase; applying them late could cost whole PRs.

**What changed in practice:**
- New rule ADOPT-NOMERGE-01: this agent opens PRs but never merges them; human review merges. (PRs 15-24 were self-merged before this rule existed — recorded, not judged retroactively.)
- Reconciliation step (PromptPlus section 1) executed against GitHub: stale state entries for already-completed REM-SEC/PERF findings were corrected.
- Model hierarchy: strongest free model available (`nemotron-3-ultra-free`, T5) holds supervisor/decision roles; `model_catalog.json` refresh dispatched as a background scout.

**What did NOT change:** English-only output, CI-only builds, no local heavy tooling, 3-subagent concurrency ceiling, evidence-first verification, error-log learning loop — all standing constraints remain in force; PromptPlus is compatible with each of them.

## D-006: iOS clipboard parity — consent gate + non-blocking banner

**Context:** REM-SEC-HIGH-08 ("clipboard URL rewriting opt-in with notification") was merged for Android (PR #22: consent gate at `NoraViewModule.kt:117`, Toast at `:130`) but never landed on iOS. `modules/nora-view/ios/NoraViewModule.swift:onPasteboardChanged` rewrote the user's clipboard unconditionally, with no consent field, no Record entry, and no notification.

**Decision:** Mirror the Android design on iOS with three minimal changes:
1. `NouController.swift`: add `@Field var clipboardTrackingConsent: Bool = false` to `NoraSettings` (secure default: listener is a no-op until the user opts in; JS already sends this field from `app/index.tsx:72`).
2. `NoraViewModule.swift`: early-return in `onPasteboardChanged` when consent is false, before any URL inspection.
3. `NoraViewModule.swift`: show a self-dismissing banner after a rewrite, instead of the stashed WIP's modal `UIAlertController` (a modal on every copy would be hostile UX; Android uses a non-blocking Toast, so the banner is the parity choice).

**Rejected alternative (stash@{0} / scratch diff):** the old-branch WIP re-added the gate but also flipped `javaScriptCanOpenWindowsAutomatically` back to `true`, reverting the merged PR #17 security fix. It was used as reference only; the regression line was verified absent from the final diff (`git diff | grep javaScriptCanOpenWindowsAutomatically` over Swift files → empty, exit 1).

**Verification limits:** iOS is not built by any workflow in this repository (no `xcodebuild` job exists), so this diff cannot be compile-verified in CI. Mitigations applied: brace-balance check on all three files, symbol wiring grep (`setInspectable` defined + called, `clipboardTrackingConsent` declared + read), regression grep, and an independent reviewer subagent (required by PromptPlus section 32 before this can be called done).

## D-007: iOS `inspectable` prop re-added behind `#if DEBUG`

**Context:** Android gates `inspectable` behind `BuildConfig.DEBUG` (`NoraViewModule.kt:350`, introduced in PR #15 commit 9d706bf; PR #23 only added the empty `else` comment). iOS removed the prop entirely (PR #17). The JS side still passes `inspectable` to the native view at three call sites (`NoraTab.tsx:956,1085`, `DownloadVideoModal.tsx:201`), so on iOS the setting exists in the UI but does nothing.

**Decision:** Re-add `Prop("inspectable")` on iOS with the implementation wrapped in `#if DEBUG`, plus an `#available(iOS 16.4, *)` check (`WKWebView.isInspectable` is 16.4+) in `NoraView.setInspectable`.

**Rationale:** `#if DEBUG` is a *compile-time* gate — stronger than Android's runtime `BuildConfig.DEBUG` check, since release builds do not contain the code at all. This restores cross-platform behavior parity for a user-facing setting without widening the production attack surface.

**Residual risk:** a debug build has a tappable inspectable setting — same posture as Android debug builds, accepted platform parity.

## D-008: proxyUsername/proxyPassword NOT added to the iOS Record

**Context:** The stashed WIP added `proxyUsername`/`proxyPassword` to the iOS `NoraSettings` Record "for parity". Evidence check: Android *consumes* them (`NoraViewModule.kt:59,68-70` builds proxy auth headers); iOS `applyProxy()` uses `ProxyConfiguration(httpCONNECTProxy:)` with no credential usage anywhere in `modules/nora-view/ios/`.

**Decision:** Do not add them.

**Rationale:** YAGNI — fields that no iOS code path reads would imply proxy-auth support that does not exist, misleading future readers. iOS proxy auth remains a known functional gap (low priority: iOS HTTP proxy credential support would need `URLSession`-level auth handling), recorded here rather than papered over with unused fields.

## D-009: Permission specialist adopted; CAMERA declared; contract moved to docs/

**Context:** The owner's LatestNuraniumPrompt.md (§12-15) installs a permission
specialist as a standing role ("a permission specialist [will be] responsible
from now on", 2026-09-29). The first `/perm audit` run against this repository
produced evidence-based findings:

- `PERM-UNDECLARED-CAMERA` (HIGH): `NoraView.kt:964` builds `permissionsToAsk`
  from `runtimePermissionFor(videoCapture)` → `android.Manifest.permission.CAMERA`
  and calls `askForPermissions(...)`, and `NoraStandaloneActivity.kt:147` checks
  the same constant, but `CAMERA` appears in no manifest and not in
  `app.config.ts`. Android denies an undeclared permission without ever
  prompting, so WebView video capture could never be granted. Intent that video
  capture is *supposed* to work comes from SEC-01 (the deferred-grant fix that
  deliberately handles "a page asking for camera and microphone").
- `PERM-FEATURE-RECORD_AUDIO` (MEDIUM): declared hardware-backed permissions had
  no `uses-feature required="false"`, so Play treats camera/microphone as
  required and can filter Nora off hardware lacking them.
- `PERM-UNUSED-MODIFY_AUDIO_SETTINGS` (LOW): referenced nowhere in app code.

One candidate finding was *rejected after verification* (never fabricated into a
finding): `lib/mention-notifications.ts:516` calls `ensureEnabledRuntime()` at
module load, but that function reaches only channel creation + background-task
registration gated on the user's existing setting — no permission request is
reachable, so there is no "request without user intent" issue.

**Decision:**
1. Declare `CAMERA` in `app.config.ts` and document why `MODIFY_AUDIO_SETTINGS`
   is kept by review (WebView WebRTC call audio routing cannot be validated
   without device-side audio testing — removal is not safe to do blind).
2. Add `withOptionalHardwareFeatures` to `plugins/withAndroidPlugin.ts`
   declaring `android.hardware.camera` and `android.hardware.microphone` with
   `android:required="false"` (idempotent).
3. Pin the invariant with `lib/permission-declaration.test.ts`: every permission
   the Kotlin checks/asks for must be declared. This is a relation between two
   artifacts (not a snapshot), and the test also guards itself against finding
   zero references (vacuous pass).
4. The durable engineering contract (§5/§25) lands in
   `docs/ENGINEERING_CONTRACT.md` instead of `AGENTS.md` — the `AGENTS.md` path
   is a consent-gated agent-instruction file and the write was not approved
   (silence ≠ consent); no attempt was made to route around it.

**Rationale:** fix the whole class (undeclared-but-asked) rather than the one
symptom, with a regression test so it cannot return (§26); keep the specialist's
audit deterministic/offline/sub-second and its model selection dynamic (§14).

**Verification limits:** no local JS toolchain exists on the device (no
`bun`/`node`, `node_modules` absent), so the new test and the Expo config-plugin
change are validated only by GitHub Actions CI (unit tests + FOSS/full Android
validation), per the standing "builds only in CI" rule. The audit itself ran
locally: 0.28 s, findings HIGH=1 MEDIUM=1 LOW=1, report at
`~/.hermes/reports/perm-audit-*.json`.
