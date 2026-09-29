# Nora — engineering contract

Durable engineering contract for this repository, adopted 2026-09-29 from the
owner's LatestNuraniumPrompt.md (§5, §6, §7, §15, §25, §26, §32). Future agent
sessions must read this file and apply it without anyone having to repeat it.
If a rule here conflicts with an explicit instruction from the repository
owner, the owner's instruction wins for that instance; update this file to match.

(The natural home for this content is `AGENTS.md`, which agents auto-load; that
path is a consent-gated agent-instruction file and the write was not approved,
so the contract lives here instead — see DECISION_LOG D-009.)

## What Nora is (do not change it)

Nora is an Android (with iOS parity, desktop via Electron) social/browser app:
React Native + Expo, WebView foundation, profiles/containers, user scripts,
existing navigation and UI direction, existing Hermes/provider integration.
Improve it; do not rewrite its architecture for theoretical cleanliness.

## Change lifecycle (runs automatically on every change)

```
DISCOVER → CLASSIFY CHANGE → SECURITY IMPACT → PRIVACY IMPACT → PROFILE
ISOLATION → PERMISSIONS → LIFECYCLE → CONCURRENCY → IMPLEMENT MINIMALLY →
TEST → SECURITY REVIEW → REGRESSION REVIEW → BUILD/CI → RUNTIME VALIDATION
WHEN REQUIRED → UPDATE STATE
```

No one should have to ask for these checks. Skipping one requires a stated
reason, not silence.

## Change risk classification

| Level | Example | Minimum verification |
|---|---|---|
| LOW | UI text, docs, targeted test | targeted tests + regression review |
| MEDIUM | storage, persistence, config | persistence/migration + security review |
| HIGH | permissions, profile/container, WebView/native bridge | permission- or isolation-specific review + Android validation |
| CRITICAL | authentication/crypto, release/build/signing/R8 | independent security review + build/signing validation |

Run the cheapest reliable evidence first: static inspection → unit test →
component test → integration test → CI → Android runtime → release validation.
Escalate only when risk or uncertainty justifies it. Never under-test
security-sensitive changes; never run expensive validation unnecessarily.

## Permissions — first-class security property

- **The `/perm` command is the permission specialist.** Registered by the
  `perm-specialist` plugin (`~/.hermes/plugins/perm-specialist/`) as an
  in-session `/perm on|off|status|audit` command and a `hermes perm` subcommand.
  - `/perm audit` — deterministic, offline, sub-second static audit: declared
    (app.config.ts + manifests) vs used (Kotlin/TS) permissions, undeclared
    but requested, declared but unused, hardware-feature pairing, and
    permission helpers reachable at module load.
  - `/perm off` disables only the optional specialist workflow. It never
    disables application security, Android permission enforcement, existing
    tests, or mandatory safety checks — by design (§13), not a gap.
  - Model selection for the deep, judgement-heavy review stays **dynamic**:
    whichever capable model the session resolves (§14). Nothing is pinned.
- **Invariant pinned by tests:** `lib/permission-declaration.test.ts` fails if
  native code checks/asks for a permission that `app.config.ts` does not
  declare (Android denies undeclared permissions *without a prompt*, so the
  guarded feature silently cannot work — finding PERM-UNDECLARED-CAMERA).
- **Safety contract for every permission change (§15):** request only when
  needed; request only for an actual user/product action; minimum necessary
  permission; correct API behavior; correct grant-result ordering and callback
  ownership; correct lifecycle behavior; correct denial and partial-grant
  handling; correct profile scoping; correct cleanup; no permission state
  leakage; no accidental privilege retention. Every discovered permission bug
  gets a regression test.
- Optional hardware-backed permissions (camera, microphone) must be paired with
  `<uses-feature android:required="false">` so Play does not filter Nora off
  devices that lack them (`plugins/withAndroidPlugin.ts`).

## Profile isolation

Profiles/containers are a first-class security boundary: data belonging to
Profile A must never become observable, readable, writable, executable, or
implicitly reused by Profile B unless the product defines that data as global
— during switching, backgrounding, WebView recreation, process death, session
restoration, downloads, clipboard, cookies, cache, storage, user scripts,
permissions, credentials, and async completion. Never merely swap
`currentProfileId` and assume isolation; an async result must prove ownership
(profile id + generation/lifecycle validity) before it may mutate state.

## Reviews and evidence

- Critical changes (security, privacy, profile isolation, permissions, crypto,
  WebView/native boundaries, lifecycle, concurrency, persistence, release
  configuration) require **independent review**, preferably from a different
  model/provider than the author, findings classified
  BLOCKING / HIGH / MEDIUM / LOW / INFO. Legitimate findings become minimal
  fixes or tests; nothing is dismissed without evidence.
- PRs are opened with full reports. Merges are performed by the permission
  specialist role once CI is green and any required independent review is
  satisfied (owner's delegation, 2026-09-29).
- GitHub state is authoritative over stale local state. Never claim a test
  passed that did not run; never call an infrastructure failure an
  application failure; never call a skipped test a passing test.

## Build and validation

- **Builds run only in GitHub Actions.** Never build heavy Android artifacts on
  a developer phone; CI is the validation venue (`bun test --preload
  ./test-preload.ts`, FOSS + full Android validation).
- Preserve R8, ABI strategy, release signing, manifest/permission hardening.
  Never disable R8 or weaken release security to make a build green.

## State and resumability

- Durable state lives in `.hermes/` (state, work journal, error log) and must
  be understandable by a fresh session: completed work, pending work, current
  checkpoint, git/test/review state, next safe action.
- After every meaningful milestone: record state, evidence, changed files,
  tests, review, commit, next safe action. Never repeat completed work; never
  skip unfinished work; work must survive interruption.

## Regression memory

Every real defect becomes at least one of: a regression test, an explicit
invariant, a documented engineering rule (this file), or durable Hermes
knowledge. Fix the class, not the symptom — without over-engineering
hypothetical failures.

## Historical lessons (permanent)

- Never audit a stale/wrong repository path; never fabricate findings; verify
  intent in the code and `DECISION_LOG.md` before "fixing" a design.
- Preserve callback contracts and permission-result ordering.
- `npx tsc` is not a substitute for project dependencies; do not use it to
  bypass missing installs.
- Do not disable R8 to bypass a release failure; fix it surgically; validate
  APK signing independently; distinguish production ARM artifacts from x86_64
  CI smoke artifacts, and emulator/system failures from application failures.
- CSP is not sandboxing; Trusted Types is not process isolation; intentional
  user-script capability is not a vulnerability without an untrusted-input or
  privilege-escalation path.
- Do not store encryption secrets beside ciphertext as the sole protection.
- GitHub is authoritative; state must be durable; completed work must not be
  repeated; unfinished work must not disappear.
