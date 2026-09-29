# Noranuim — Project State — 2026-09-14

## Known-good baseline

The Android application was manually confirmed to start successfully, and the corresponding Android Smoke CI job completed successfully.

- Main baseline commit: `bdef69715577b50f4ef10079cfeb5b5a073a74d2`
- Parent application-fix commit: `c1f574c829f6c3c2bed6dc051eba00e15377059a`
- Verified Smoke job: `103793639662`
- Backup branch: `backup/working-state-2026-09-14`
- Backup branch intentionally points exactly at `bdef69715577b50f4ef10079cfeb5b5a073a74d2`.

## What is validated

- The previous Reanimated 4 `useAnimatedGestureHandler` startup crash was removed from `FloatingSwitcher`.
- The Android Smoke harness was hardened for slow emulator activity startup.
- The Android Smoke job completed all artifact, emulator, startup, relaunch, diagnostics, and summary steps successfully.
- The application was also confirmed by the developer on a real device to start and run.

## Preservation rule

Treat `backup/working-state-2026-09-14` as the recovery baseline. Future cleanup or feature work must not rewrite, force-push, or repoint this branch without an explicit decision to replace the preserved baseline.

## Cleanup policy

The repository should be cleaned conservatively. Do not delete source, configuration, tests, assets, or CI files merely for appearance. Remove only demonstrably generated or obsolete material after verifying that it is not referenced by build, test, packaging, or release workflows.

## Next work

Continue from `main` with small, independently verified changes. Keep the preserved backup branch untouched.
