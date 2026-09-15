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
Evidence: security branch created from the known-good working commit; protected backup remains separate.

### CP1 — initial hardening
Status: COMPLETE
Changes: exclude proxy username/password/PAC URL from cloud settings sync; preserve them locally on remote merge; disable Android cleartext traffic; add FLAG_SECURE to standalone activity; deny unknown standalone WebView permission resources.

### CP2 — profile fail-closed
Status: IN PROGRESS
Goal: requested non-default profile must never fall back to global/default CookieManager or another profile; unsupported/missing profile must fail closed; popup creation must obey the same rule.

### CP3 — storage/permission isolation coverage
Status: PENDING
Goal: add automated tests for profile selection and runtime isolation expectations across cookies, WebStorage, IndexedDB, service workers, cache and permissions.

### CP4 — security regression suite
Status: PENDING
Goal: unit tests + Android smoke/isolation validation + static review. No merge before green evidence.

### CP5 — final review
Status: PENDING
Goal: CodeRabbit/review, reconcile diff against backup baseline, update PR and project state.

## Resume protocol after interruption
1. Read this file first.
2. Verify the active branch and latest commit.
3. Verify `backup/working-state-2026-09-14` still points to `bdef69715577b50f4ef10079cfeb5b5a073a74d2`.
4. Continue from the first non-COMPLETE checkpoint; never repeat or overwrite completed security commits without evidence.

## Current finding carried forward
The highest-priority defect is fail-open profile handling in the Native WebView/cookie APIs. The required invariant is exact-profile-or-fail, never exact-profile-or-global-fallback.
