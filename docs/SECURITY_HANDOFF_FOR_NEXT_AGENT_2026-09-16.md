# Noranuim Security Hardening — Handoff for Next Agent

Date: 2026-09-16
Repository: `brasilia736211600-netizen/Noranuim`

## 1. Mission

We are hardening Noranuim against profile-storage isolation failures and sensitive-state leakage. The work is deliberately isolated from the known-good backup and is being executed as resumable checkpoints with GitHub as the source of truth.

Primary invariant:

> A request for Profile X must resolve to exactly Profile X or fail closed. It must never silently reuse the global/default CookieManager or another profile's Chromium storage.

Do not merge this work until runtime evidence and regression/review gates are green.

## 2. Protected baseline and branch topology

Known-good protected backup:
- Branch: `backup/working-state-2026-09-14`
- Commit: `bdef69715577b50f4ef10079cfeb5b5a073a74d2`
- Rule: never modify this branch.

Security branch:
- `security/hardening-from-working-state`
- PR: #5, draft, base `main`
- Tracking issue: #9
- Latest branch HEAD verified from GitHub: `13ab6b178cc0418648a7d5283d713187e0575362`

Important: `13ab6...` is a documentation-only follow-up that records the CI working-directory remediation. The state ledger should continue to track the actual code commits below.

## 3. What was fixed before security hardening

Historical repair work on the known-good working state included:
- restored missing `clsx` dependency;
- resolved Bun lock/install issue;
- restored deleted `NoraTab.tsx`;
- added `lib/alert.ts`;
- fixed YouTube test harness location;
- 196 unit/component tests across 32 files had previously passed;
- fixed optional R8 `javax.xml.stream.XMLResolver` issue using `plugins/withR8OptionalClasses.ts`;
- fixed Android signing;
- produced Full/FOSS signed APK artifacts;
- added x86_64 CI/emulator support via `NORANUIM_CI_X86=1`;
- diagnosed an Android startup crash caused by Reanimated 4 removing `useAnimatedGestureHandler`; replaced the old `PanGestureHandler` path with Gesture API / `GestureDetector` in commit `c1f574c829f6c3c2bed6dc051eba00e15377059a`;
- Android Smoke later stopped reproducing that crash; an observed smoke timeout was instead dominated by hosted-emulator / Google-service instability.

Do not reopen these historical issues unless new CI evidence directly implicates them.

## 4. Security hardening already implemented

### Sensitive settings / cloud sync
File: `lib/supabase/sync/settings.ts`

Implemented:
- `proxyUsername`, `proxyPassword`, and `proxyPacUrl` are stripped from the cloud payload.
- Incoming remote settings preserve the locally stored proxy credential fields by profile ID.

Security intent: proxy credentials and PAC URL remain device-local and are not uploaded through settings sync.

### Android network security
File: `app.config.ts`

Changed:
- `usesCleartextTraffic: true` → `false`

HTTPS is the secure default. Any intentional HTTP behavior must be explicit and user-controlled.

### Standalone screenshot exposure
File: `modules/nora-view/android/src/main/java/expo/modules/noraview/NoraStandaloneActivity.kt`

Added `FLAG_SECURE` to reduce screenshot / recent-task exposure.

### Permission allowlisting
Standalone permission requests now reject unknown resource types rather than granting arbitrary resources. The main WebView permission handling also rejects empty/unknown resource requests and only considers explicit audio/video resources before runtime permission flow.

### Cookie/profile fail-closed
File: `modules/nora-view/android/src/main/java/expo/modules/noraview/NoraCookies.kt`

For `default`: use global `CookieManager`.

For non-default profiles:
- if `MULTI_PROFILE` unsupported → return `null`;
- if supported → resolve exactly with `ProfileStore.getInstance().getProfile(profile)?.cookieManager`;
- never fall back to global CookieManager.

Relevant implementation commit: `98d4ba6...`.

### Main WebView profile handling
File: `modules/nora-view/android/src/main/java/expo/modules/noraview/NoraViewModule.kt`

`getCookies` and `clearHostData` now:
- use global storage only for `default`;
- for non-default profiles require `MULTI_PROFILE`;
- require the exact requested `ProfileStore` profile;
- return/fail closed when unsupported or missing.

Relevant implementation commit: `93288ae...` plus locale-assignment correction `ddb02d33...`.

### Main `NoraView` profile handling
File: `modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt`

Added `profileIsolationReady` state.

Non-default profile behavior:
- unsupported `MULTI_PROFILE` → fail closed;
- profile setup exception → fail closed;
- navigation under a rejected profile is blocked;
- non-default popup creation is blocked if profile isolation is unavailable or setup fails.

Relevant implementation commit: `ee19e167...`.

### Standalone activity profile switching
File: `NoraStandaloneActivity.kt`

Added:
- `configuredProfile`;
- `profileIsolationReady`;
- exact profile setup using `WebViewCompat.setProfile`;
- terminate the standalone task on unsupported/failed non-default profile configuration;
- when `onNewIntent` requests a different profile, terminate the current task and start a fresh standalone activity with the incoming extras instead of reusing the old WebView instance.

Relevant implementation commit: `ad05da1...`.

## 5. Static regression coverage

File: `security/profile-isolation.test.ts`

Static guards verify:
- no non-default → global CookieManager fallback;
- exact ProfileStore usage;
- fail-closed `NoraView` / standalone behavior;
- standalone profile-change recreation path;
- proxy secret exclusion from sync payload construction;
- cleartext traffic disabled.

Relevant commit: `db327fa...`.

Static tests are not runtime proof.

## 6. Runtime isolation test work

Added Android instrumentation:
`modules/nora-view/android/src/androidTest/java/expo/modules/noraview/ProfileIsolationInstrumentedTest.kt`

Current test creates two distinct real WebView profiles and checks:
- distinct profile cookies;
- distinct DOM storage values;
- profile-scoped WebStorage objects;
- profile-scoped ServiceWorkerController objects.

This is intended as the first real runtime proof of profile separation.

Added workflow:
`.github/workflows/security-profile-runtime.yml`

Current workflow:
- builds the generated Android project from source;
- verifies `android/gradlew` exists;
- launches API 34 x86_64 Google APIs emulator;
- uses `working-directory: ./android`;
- runs `./gradlew connectedFullDebugAndroidTest --stacktrace --no-daemon -PreactNativeArchitectures=x86_64`.

## 7. Important CI findings and current status

Two classes of CI failures occurred before the current fix.

### Failure A — emulator action working-directory
Run `35023322697` / the earlier runtime attempt failed before tests because the emulator action invoked `./gradlew` outside the repository Android working directory.

The concrete log failure was:
`/bin/sh: ./gradlew: No such file or directory`

The emulator itself did boot successfully; this was not evidence of application/profile failure.

### Remediation
The workflow was changed to:
- explicitly verify `$GITHUB_WORKSPACE/android/gradlew`;
- configure `working-directory: ./android` on `reactivecircus/android-emulator-runner`;
- invoke `./gradlew` from that directory.

Documented on commit `13ab6b178cc0418648a7d5283d713187e0575362`; the workflow contains the actual working-directory fix and is the source to inspect.

### Full/FOSS + unit validation
Run `35023322710` (`Noranuim Repair Validation`) completed successfully.

Verified jobs:
- Unit and component tests: PASS.
- Android full release validation: PASS.
- Android FOSS release validation: PASS.

Run `35023297704` also completed successfully with the same three validation jobs passing.

### Security Profile Runtime
The initial runtime run `35023322697` failed only at runner script invocation, not test logic. A prior runtime run `35018949614` failed for the same infrastructure/working-directory class.

The next required runtime result is a fresh run after the `working-directory` fix. Do not mark profile isolation complete until the instrumentation test itself executes and passes.

## 8. What remains — exact priority order

### CP3: runtime isolation proof
Highest priority.

Need real Android evidence for all relevant state classes:
1. Cookies
2. WebStorage
3. IndexedDB content
4. Service worker registration and stored/content state
5. Cache API contents
6. Permissions / permission-state separation
7. repeated profile switching
8. app/activity restart and restoration while maintaining profile boundaries
9. no cross-profile popup inheritance
10. fail-closed behavior on unsupported/missing/invalid profiles

Current instrumentation covers only the first portion (Cookies, DOM storage, profile-scoped objects). The remaining items must not be inferred merely from object identity.

### CP4: consolidated regression suite
After runtime isolation passes:
- all existing JS/unit/component tests;
- Full and FOSS Android release validation;
- Android runtime isolation validation;
- static security checks;
- inspect the complete PR diff against the protected baseline;
- reject accidental unrelated deletions/rewrites.

### CP5: final security review
- run CodeRabbit / substantive code review after implementation stabilizes;
- resolve actionable findings;
- verify no credentials/secrets were introduced into committed files or logs;
- verify cleartext policy;
- verify explicit permission allowlists;
- verify profile fail-closed invariant across every native entry point;
- update state ledger and PR body;
- only then consider merging.

## 9. Known implementation risk to watch

`NoraView.kt` suffered one accidental broad reconstruction during an earlier edit, producing an unsafe diff with many unrelated comment removals. The bad commit `b905996...` was removed from reachable branch history by force-reset. The locale regression was separately restored in `ddb02d33...`.

Therefore:
- prefer surgical edits;
- before any broad replacement, compare against `backup/working-state-2026-09-14`;
- do not remove unrelated comments or semantics just to make a security change easier.

## 10. Files to inspect first

1. `docs/SECURITY_AUTOPILOT_STATE.md`
2. `docs/SECURITY_HARDENING_2026-09-15.md`
3. this handoff file
4. `security/profile-isolation.test.ts`
5. `modules/nora-view/android/src/androidTest/java/expo/modules/noraview/ProfileIsolationInstrumentedTest.kt`
6. `.github/workflows/security-profile-runtime.yml`
7. `NoraCookies.kt`
8. `NoraViewModule.kt`
9. `NoraView.kt`
10. `NoraStandaloneActivity.kt`
11. `lib/supabase/sync/settings.ts`
12. `app.config.ts`

## 11. Resume protocol

At every restart:
1. read the security ledger first;
2. verify security branch HEAD;
3. verify `backup/working-state-2026-09-14` still points to `bdef69715577b50f4ef10079cfeb5b5a073a74d2`;
4. inspect latest CI before changing code;
5. continue from the first non-complete checkpoint;
6. make the smallest evidence-driven change;
7. run tests/CI;
8. record the result in the durable state file;
9. only after implementation stabilizes, perform final diff review and CodeRabbit review.

## 12. Current factual state

The security branch contains meaningful hardening against profile fallback and sensitive-state sync leakage. Unit/component and Full/FOSS Android build validation are green in the cited runs. The remaining acceptance blocker is **runtime proof of Chromium profile isolation across all required storage/state surfaces plus final regression/review**.

The protected backup remains separate and must not be altered.
