# Security hardening autopilot state

## Control point
- Repository: `brasilia736211600-netizen/Noranuim`
- Protected known-good backup: `backup/working-state-2026-09-14`
- Protected backup commit: `bdef69715577b50f4ef10079cfeb5b5a073a74d2`
- Active hardening branch: `security/hardening-from-working-state`
- Staging PR: `#5`
- Tracking issue: `#9`

## Rule
The protected backup branch is never modified by this operation. `main` is not a target for direct security edits. All hardening and verification proceeds on the security branch in resumable checkpoints.

## Checkpoint ledger

### CP0 — baseline secured
Status: COMPLETE
Evidence: security branch created directly from the known-good working commit; protected backup remains separate.

### CP1 — initial hardening
Status: COMPLETE
Evidence commits include removal of proxy credentials/PAC URL from cloud settings sync, preservation of those fields on remote merge, Android cleartext disabled, standalone FLAG_SECURE, and explicit standalone permission allowlisting.

### CP2 — profile fail-closed
Status: IMPLEMENTATION COMPLETE / VALIDATION REQUIRED
Evidence:
- `98d4ba6...`: non-default `NoraCookies` access no longer falls back to global CookieManager.
- `93288ae...`: `getCookies` and `clearHostData` use exact non-default ProfileStore profiles or fail closed.
- `ee19e167...`: Native WebView profile setup records isolation readiness; unsupported/failed non-default profile navigation is blocked; non-default popups fail closed.
- `ad05da1...`: standalone profile changes cannot reuse existing WebView instances and unsupported/failed profile setup terminates the standalone window.
Validation gate: Android runtime proof remains required.

### CP3 — storage/permission isolation coverage
Status: IMPLEMENTATION COMPLETE / CI VALIDATION REQUIRED
Evidence:
- `security/profile-isolation.test.ts`: static regression guards.
- `modules/nora-view/android/src/androidTest/.../ProfileIsolationInstrumentedTest.kt`: runtime Cookies/DOM-storage/profile-object coverage.
- `.github/workflows/security-profile-runtime.yml`: emulator instrumentation gate.
- `security/android-profile-isolation-runtime.sh`: standalone profile-transition smoke gate.
CI findings:
- Initial runtime attempt failed because the emulator action executed the script outside the checkout working directory.
- Follow-up attempt confirmed the generated Gradle wrapper exists before emulator launch, but the action still used its own working context despite the absolute workspace path.
Remediation: configure the emulator action's documented `working-directory: ./android` input and invoke `./gradlew` directly from that directory.
Latest remediation commit: `4f0dbcfb4dcad8e3b692f3b8c226924434d2e5ba`.
Remaining functional gap: dedicated cache API, IndexedDB content, service-worker registration/content, and runtime permission-state separation probes.

### CP4 — security regression suite
Status: PENDING
Goal: unit tests + Android smoke/isolation validation + static review. No merge before green evidence.

### CP5 — final review
Status: PENDING
Goal: CodeRabbit/review, reconcile diff against backup baseline, update PR and project state.

## Important correction made during execution
An intermediate WebView edit accidentally removed unrelated comments and changed an unrelated locale assignment. The locale assignment was restored in `ddb02d33...`. The branch was reset away from the unsafe `b905996...` commit before continuing.

## Current branch head
- latest CI working-directory fix: `4f0dbcfb4dcad8e3b692f3b8c226924434d2e5ba`

## Resume protocol after interruption
1. Read this file first.
2. Verify the active branch and latest commit.
3. Verify `backup/working-state-2026-09-14` still points to `bdef69715577b50f4ef10079cfeb5b5a073a74d2`.
4. Continue from the first non-COMPLETE checkpoint; never repeat or overwrite completed security commits without evidence.
5. Before any broad file replacement, compare the target diff to the backup baseline and reject unrelated deletions.

## Current highest-priority invariant
A request for Profile X must resolve to exactly Profile X or fail closed. It must never silently reuse the global/default CookieManager or another profile's Chromium storage.
