# Nora SNS Browser - Repository Analysis & Reference Document

**Last Updated:** 2026-09-28
**Branch:** hermes/autopilot/2026-09-28-android-audit
**Commit:** 0c5b5ad
**Mission:** nora-android-audit-2026-09-28

---

## 1. Project Overview

**Nora SNS Browser** is a React Native/Expo application that wraps social network websites in WebViews, providing a unified browsing experience with ad-blocking, privacy features, and cross-platform support (Android, iOS, Desktop via Tauri).

### Core Value Proposition
- Single app for multiple social networks (Twitter/X, Mastodon, Bluesky, Reddit, etc.)
- Built-in ad/tracker blocking via filter lists (EasyList, EasyPrivacy, etc.)
- User scripts & custom CSS injection per host
- Privacy: proxy support, WebRTC IP leak protection, cookie management
- Cross-platform: Android (primary), iOS, Desktop (Tauri)

---

## 2. Architecture

```
Noranuim/
├── app/                    # Expo Router pages (file-based routing)
│   ├── (tabs)/            # Tab navigation screens
│   ├── settings/          # Settings screens
│   └── _layout.tsx        # Root layout
├── components/            # React components
│   ├── tab/               # Tab-related components
│   │   └── NoraTab.tsx    # MAIN WebView wrapper (1035 lines) - CRITICAL
│   ├── ui/                # UI primitives
│   └── ...
├── lib/                   # Core libraries
│   ├── blocklist/         # Ad-blocking engine
│   │   ├── parser.ts      # Filter list parsing
│   │   ├── service.ts     # Blocklist lifecycle (773 lines) - CRITICAL
│   │   ├── storage.ts     # Persistence (MMKV + file sync)
│   │   └── policy.ts      # Blocking rules
│   ├── supabase/          # Cloud sync (settings, bookmarks, styles)
│   ├── user-styles.ts     # Custom CSS injection (300+ lines)
│   ├── webrtc.ts          # WebRTC IP leak protection
│   ├── cookies.ts         # Cookie management
│   ├── cookie-export.ts   # Cookie export/sharing
│   └── search.ts          # Search engine integration
├── states/                # Global state (@legendapp/state + MMKV)
│   └── settings.ts        # Settings schema + persistence (500+ lines)
├── modules/nora-view/     # Native Android WebView module
│   └── android/src/main/java/expo/modules/noraview/
│       ├── NoraView.kt           # Main WebView (1485 lines) - CRITICAL
│       ├── NouJsInterface.kt     # JS bridge
│       ├── NouController.kt      # Settings/blocklist/i18n controller
│       ├── NoraViewModule.kt     # Expo module bridge
│       ├── NoraCookies.kt        # Cookie DB access (blocking I/O issues)
│       ├── NoraShortcuts.kt      # Touch icon generation
│       ├── NoraTranslation.kt    # Translation overlay
│       ├── NoraStandaloneActivity.kt
│       └── utils.kt
├── modules/nora-billing/  # In-app purchases (separate Expo module)
├── desktop/               # Tauri desktop app
│   └── src/main/index.ts  # Electron main process (security issues)
├── plugins/               # Expo config plugins
│   └── withAndroidPlugin.ts
├── .github/workflows/     # CI/CD (GitHub Actions)
│   ├── build.yml          # Main build
│   └── android-smoke.yml  # Android smoke test
└── app.config.ts          # Expo config (usesCleartextTraffic=true)
```

### Data Flow
```
User Action → NoraTab.tsx (WebView) → NouJsInterface.kt → NouController.kt
                ↓                    ↓                    ↓
         Blocklist check      Message handling      Settings/Blocklist
         User scripts         Cookie sync           Persistence (MMKV)
         CSS injection        Navigation            Supabase sync
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | React Native + Expo | 0.85.3 / SDK 56 |
| Routing | Expo Router | file-based |
| Styling | NativeWind (Tailwind) | v4 |
| State | @legendapp/state + MMKV | reactive, persistent |
| Networking | @supabase/supabase-js + TanStack Query | cloud sync |
| Native Android | Kotlin + Expo Modules API | WebView-based |
| Desktop | Tauri (Electron backend) | WebView-based |
| CI/CD | GitHub Actions (fastlane) | ubuntu-latest, macos-15 |
| Build | EAS Build / expo-run | cloud builders |

---

## 4. Critical Modules Deep-Dive

### 4.1 NoraTab.tsx (1035 lines) - **HIGHEST PRIORITY FOR REFACTOR**
**Responsibilities:** WebView lifecycle, message handling, settings application, user scripts runner, blocklist application, UI rendering, scroll handling, download handling, translation overlay, find-in-page, pull-to-refresh.

**Security Issues (Verified):**
- Line 369: `executeWebviewJavaScriptQuietly` runs arbitrary user JS without CSP/sandbox
- Line 701: `JSON.parse(payload)` without validation - prototype pollution risk
- Line 566: `loadUrl` retry uses stale `nativeRef.current`
- Line 633-634: `applyContentState` re-runs on every blocklist/navigation/settings change

**Performance Issues:**
- Monolithic component - should split into: WebViewManager, MessageHandler, SettingsApplier, UserScriptRunner, BlocklistApplier

### 4.2 lib/blocklist/service.ts (773 lines) - **HIGH PRIORITY**
**Responsibilities:** Fetching filter lists, parsing, storage, application, exclusions, cosmetic filters, platform-specific logic.

**Security Issues:**
- Line 603: Partial fetch failure aborts entire refresh
- Line 119 (parser.ts): Cosmetic filter validation incomplete

**Performance Issues:**
- Line 297-303: `getCosmeticCssForHost` re-parses all rules on every call
- Line 189: Uncancellable 8s worklet merge races duplicate fallback parse

### 4.3 modules/nora-view/android/.../NoraView.kt (1485 lines)
**Responsibilities:** WebView implementation, touch handling, script injection, downloads, popup handling, cookie management, blocklist interception, layout.

**Performance Issues (Verified):**
- Line 1206-1208: `requestLayout()` posts uncoalesced `layoutChildren()` per call
- Line 859: `Uri.parse(pageUrl)` + per-label host joins on every subresource request
- Line 327: InternalHosts set rebuilt per navigation
- Line 1034: Popup WebViews only destroyed on `onPageStarted`/`onCloseWindow` - leak if aborted
- Line 1373, 1440: Uncancelled `CoroutineScope(Dispatchers.IO)` capturing Activity/base64

### 4.4 modules/nora-view/android/.../NoraCookies.kt
**Performance Issues (Verified):**
- Line 47: `CookieManager.flush()` forced onto `Dispatchers.Main` - blocks UI thread
- Line 117: Full Cookies DB + sidecar copy per read
- Line 77: Full DB copy per probed directory

### 4.5 lib/blocklist/storage.ts
**Performance Issues (Verified):**
- Line 134: `textSync()` + `JSON.parse` multi-MB snapshot on RN JS thread
- Line 168: `JSON.stringify` + `write()` multi-MB snapshot on RN JS thread

### 4.6 modules/nora-view/android/.../NoraViewModule.kt
**Performance Issues (Verified):**
- Line 159: Synchronous `Function("setBlocklist")` - full host list decoded on JS thread

**Security Issues (Verified):**
- Line 339-340: `inspectable` user setting enables `WebView.setWebContentsDebuggingEnabled`

### 4.7 desktop/src/main/index.ts (Electron)
**Security Issues (Verified):**
- Line 121, 149, 155: `sandbox: false`, `nodeIntegrationInSubFrames: true`
- Line 161: CORP header stripped globally
- Line 181-183: Automatic notification permission grant
- Line 102 (NoraViewModule.kt): Clipboard monitoring rewrites URLs without consent

### 4.8 states/settings.ts
**Security Issues (Verified):**
- Line 37, 58: `proxyPassword` stored in plaintext MMKV (no encryption key found)
- Line 94: `inspectable` user setting

---

## 5. Security Posture (Verified Findings Summary)

### Critical (2) - **IMMEDIATE ACTION REQUIRED**
| # | Issue | File | Line |
|---|-------|------|------|
| 1 | User scripts execute unsandboxed (XSS risk) | NoraTab.tsx | 369 |
| 2 | Electron preload: sandbox=false, nodeIntegrationInSubFrames=true | desktop/src/main/index.ts | 121,149,155 |

### High (9)
| # | Issue | File | Line |
|---|-------|------|------|
| 3 | usesCleartextTraffic=true + allowHttpWebsite default true | app.config.ts / settings.ts | 70 / - |
| 4 | inspectable user setting enables Chrome DevTools | NoraViewModule.kt / NoraView.swift | 339 / 187 |
| 5 | proxyPassword in plaintext MMKV | settings.ts | 37, 58 |
| 6 | WebView message handler: JSON.parse without validation | NoraTab.tsx | 701 |
| 7 | Blocklist refresh: partial failure aborts all | service.ts | 603 |
| 8 | Electron: auto notification permission for all origins | desktop/src/main/index.ts | 181-183 |
| 9 | Electron: CORP header stripped globally | desktop/src/main/index.ts | 161 |
| 10 | iOS: javaScriptCanOpenWindowsAutomatically=true | NoraView.swift | 187 |
| 11 | Clipboard monitoring rewrites URLs without consent | NoraViewModule.kt | 102 |

### Medium (7) + Low (5) + Maintainability (5) - See work_journal.md for full list

---

## 6. Performance Posture (Verified Findings Summary)

### High (3) - **IMMEDIATE ACTION REQUIRED**
| # | Issue | File | Line |
|---|-------|------|------|
| 1 | CookieManager.flush() on Dispatchers.Main (blocks UI) | NoraCookies.kt | 47 |
| 2 | Sync blocklist snapshot read/write on RN JS thread | storage.ts | 134, 168 |
| 3 | Sync setBlocklist bridge - full decode on JS thread | NoraViewModule.kt | 159 |

### Medium (8)
- requestLayout() uncoalesced layout passes (NoraView.kt:1206)
- Full Cookies DB copy per read/probe (NoraCookies.kt:117,77)
- getCosmeticCssForHost re-parses all rules per call (service.ts:297)
- Uri.parse + host joins per subresource request (NoraView.kt:859)
- Uncancelled CoroutineScope capturing Activity (NoraView.kt:1373,1440)
- Popup WebView leak if navigation aborted (NoraView.kt:1034)
- InternalHosts set rebuilt per navigation (NoraView.kt:327)
- Uncancellable worklet merge races duplicate parse (service.ts:189)

### Low (3)
- Per-pixel getPixel() JNI calls (NoraShortcuts.kt:153)
- CSS concatenation no dedup/minify (user-styles.ts:300)
- MMKV write amplification (settings.ts:507)

---

## 7. Build & CI Configuration

### GitHub Actions Workflows
- **build.yml**: Main build (Android + iOS + Desktop) on ubuntu-latest / macos-15-intel
- **android-smoke.yml**: Android smoke test on emulator

### Key Constraints
- **NO LOCAL BUILDS** - User's device is weak; all builds run on GitHub-hosted runners
- **NO LOCAL npm install** - node_modules absent; defer lint/tsc/tests to CI
- **NO LOCAL kotlinc/Android SDK** - Native compilation only in CI

### Push Triggers
```bash
git push origin hermes/autopilot/2026-09-28-android-audit
# Triggers: lint → typecheck → Android build → (optionally) iOS/Desktop
```

---

## 8. Known Technical Debt

1. **NoraTab.tsx** - 1035 lines, 10+ responsibilities, needs decomposition
2. **Blocklist service** - 773 lines, complex state machine, needs split
3. **Platform duplication** - Android/iOS/Electron/Web each reimplement WebView/blocklist/cookies/proxy
4. **Settings schema** - Manual validation in `normalizeSettings` (85 lines), should use zod/valibot
5. **Error handling** - Inconsistent: try/catch/console.error, throw, silent swallow
6. **No CSP** - User scripts/styles injected without Content Security Policy
7. **No Subresource Integrity** - Bundled content scripts not integrity-verified

---

## 9. Resumability Framework (Use This to Continue)

### State Files (Always Current)
- `.hermes/state.json` - Machine-readable mission state + model tiers + resume_instructions
- `.hermes/work_journal.md` - Human-readable journal with all findings, decisions, rules
- `.hermes/model_catalog.json` - Model tier mappings for offline-first rotation
- `.hermes/model_scout_prompt.md` - Background model scout subagent prompt

### Resume Instructions (from state.json)
> "Read .hermes/state.json and .hermes/work_journal.md. Verify git status clean and HEAD matches last_commit. If subagents were in flight (check .hermes/cache/delegation/live/), read their transcripts and decide: wait for completion, re-dispatch, or absorb partial results. Then continue from current_phase. Check .hermes/model_catalog.json for model tier mappings; if stale (last_updated > 6h ago), dispatch model-scout subagent to refresh."

### Subagent Transcripts (Durable)
- `.hermes/cache/delegation/live/deleg_d3d7397f/task-0.log` - Security audit (28 findings)
- `.hermes/cache/delegation/live/deleg_b860c53e/task-0.log` - Performance audit (14 findings)
- `.hermes/cache/delegation/live/deleg_c7316771/task-0.log` - Independent review of de07e23

### Model Tiers (from state.json)
| Tier | Model | Use For |
|------|-------|---------|
| LOW | cline-free/deepseek-v4.1-flash | Recon, mechanical tasks |
| MEDIUM | cline-free/deepseek-v4.1 | Bugfix, architecture |
| HIGH | cline-free/qwen3-coder-plus | Complex fixes |
| XHIGH | freeflow/glm-4.5 | Security, crypto |

---

## 10. Standing Rules (Enforced)

1. **English only** - All artifacts, commits, logs, output
2. **Builds in CI only** - Never local Gradle/expo/native builds
3. **No heavy local installs** - Defer lint/tsc/tests to CI
4. **Conserve device resources** - No unbounded local processes
5. **Parallelize via subagents** - Up to 3 concurrent (remote, zero local cost)
6. **Exploit Hermes fully** - Never modify/update Hermes or install packages into it
7. **Every user constraint → rule** - Patch into skill or journal immediately
8. **Verify before trust** - Every subagent finding grep-verified before backlog entry
9. **Atomic checkpoints** - Every unit committed, branch pushed after each phase
10. **Model rotation data-driven** - Via model_catalog.json, refreshed by background scout

---

## 11. Next Actions Priority Order

### Immediate (Next Session)
1. **CI-01**: Monitor GitHub Actions (lint, typecheck, Android build) - already triggered by push
2. **REVIEW-01**: Await independent reviewer verdict on commit de07e23
3. **REMED-01**: Begin remediation - Priority order:
   - Security Critical: CSP for user scripts, Electron sandbox enable
   - Security High: Remove inspectable setting, encrypt proxyPassword, validate WebView messages
   - Performance High: Move CookieManager.flush() off Main thread, async blocklist I/O, async setBlocklist

### Short-term
4. Decompose NoraTab.tsx and blocklist service
5. Add CSP + Subresource Integrity for content scripts
6. Implement proper domain matching with Public Suffix List
7. Schema validation for settings (zod/valibot)

---

## 12. Quick Reference Commands

```bash
# Resume mission
cd /data/data/com.termux/files/home/Noranuim
cat .hermes/state.json | jq .resume_instructions

# Check CI status
# Visit: https://github.com/brasilia736211600-netizen/Noranuim/actions

# View latest findings
cat .hermes/cache/delegation/live/deleg_d3d7397f/task-0.log | jq .findings
cat .hermes/cache/delegation/live/deleg_b860c53e/task-0.log | jq .findings

# Dispatch subagent (example)
# delegate_task with goal, context, output_schema

# Check background processes
# delegate_task action=list
```

---

## 13. File Index for Quick Navigation

| Area | Key Files |
|------|-----------|
| WebView (Android) | modules/nora-view/android/.../NoraView.kt |
| JS Bridge | modules/nora-view/android/.../NouJsInterface.kt |
| Controller | modules/nora-view/android/.../NouController.kt |
| Module Bridge | modules/nora-view/android/.../NoraViewModule.kt |
| Cookies | modules/nora-view/android/.../NoraCookies.kt |
| Main Tab Component | components/tab/NoraTab.tsx |
| Blocklist Core | lib/blocklist/service.ts |
| Blocklist Parser | lib/blocklist/parser.ts |
| Blocklist Storage | lib/blocklist/storage.ts |
| User Styles | lib/user-styles.ts |
| Settings State | states/settings.ts |
| Supabase Sync | lib/supabase/sync.ts |
| Electron Main | desktop/src/main/index.ts |
| iOS WebView | modules/nora-view/ios/NoraView.swift |

---

*This document is the single source of truth for repository understanding. Update it after every significant change. It eliminates the need to re-analyze the codebase from scratch for future feature work, bug fixes, or audits.*