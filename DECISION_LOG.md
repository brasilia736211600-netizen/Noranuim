# Decision Log — Nora Android Audit Mission

Branch: `hermes/autopilot/2026-09-28-android-audit`

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
