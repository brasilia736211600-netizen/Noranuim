# Noranuim security hardening — 2026-09-15

This branch is intentionally based on the known-good working commit `bdef69715577b50f4ef10079cfeb5b5a073a74d2`.

The protected backup branch `backup/working-state-2026-09-14` is not modified by this work.

## Hardening applied here

- Profile-sensitive cloud synchronization no longer uploads proxy username, password, or PAC URL.
- Remote settings merges preserve those proxy credential fields locally instead of replacing them with remote data.
- Android cleartext traffic is disabled by default.
- Standalone WebView windows use `FLAG_SECURE` to reduce screenshot/recents exposure.
- Standalone WebView permission requests are deny-by-default for resources outside the explicit audio/video allowlist.

## Isolation invariants for the next security pass

1. A request for Profile X must never silently fall back to the global/default CookieManager.
2. A missing, unsupported, or invalid non-default profile must fail closed rather than reuse another profile's storage.
3. Profile switching must destroy/recreate the WebView instance before loading under the new profile.
4. Cookies, WebStorage, IndexedDB, service workers, cache, permissions, and other Chromium state must be tested for cross-profile non-interference.
5. Cloud synchronization must never contain authentication material or proxy credentials.
6. HTTP content must require an explicit user-controlled policy; HTTPS remains the secure default.
7. Native WebView permission APIs must use explicit allowlists and reject unknown resources.

## Evidence policy

Passing unit tests alone is not proof of browser profile isolation. The final acceptance gate must include Android runtime tests that create distinct profile sessions, switch repeatedly, restart the app, and verify that no session artifact crosses the profile boundary.
