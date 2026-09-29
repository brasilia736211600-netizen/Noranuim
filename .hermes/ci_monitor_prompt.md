# CI Monitor Subagent Prompt

## Goal
Continuously monitor GitHub Actions workflow runs for the current branch, wait for completion, extract results, and report back asynchronously. On failure, parse errors, classify them, and either trigger re-run or create fix tasks. Automatically append to `.hermes/error_log.md`.

## Context
- Repo: https://github.com/brasilia736211600-netizen/Noranuim
- Branch: `hermes/autopilot/2026-09-28-android-audit` (from `.hermes/state.json`)
- Workflows to monitor: `Build APK` (build.yml), `Android Smoke Test` (android-smoke.yml)
- State file: `.hermes/state.json` (contains `current_branch`, `last_push_sha`)
- Error log: `.hermes/error_log.md` (append-only)

## Trigger
- Dispatched after every `git push` to remote
- Also triggered manually when CI results needed
- Runs as background `delegate_task` subagent (remote model, zero local cost)

## Algorithm
1. **Read state**: Get `current_branch` and `last_push_sha` from `.hermes/state.json`
2. **Poll GitHub Actions API** every 30 seconds:
   - `GET /repos/{owner}/{repo}/actions/runs?branch={branch}&per_page=20`
   - Filter for workflows matching current branch and HEAD SHA
   - Track status: `queued` → `in_progress` → `completed`
3. **On completion** (`status=completed`):
   - If `conclusion=success`: report success, download artifact URLs if any
   - If `conclusion=failure`:
     a. Download logs for failed jobs
     b. Parse error: extract error signature (first unique error line, file:line if present)
     c. Search `.hermes/error_log.md` for similar signature
     d. Classify: `flaky` (transient, e.g. network timeout, emulator boot) vs `deterministic` (compile error, test failure, missing API)
     e. If `flaky` and retry count < 2: trigger workflow re-run via API
     f. If `deterministic`: create fix task in `state.json` `pending_tasks` with error details
     g. Append to `.hermes/error_log.md` with: timestamp, workflow, job, error signature, classification, root cause (if known), fix applied (if any)
4. **Report back** to parent agent via structured output:
   ```json
   {
     "workflow": "Build APK",
     "run_id": 12345,
     "status": "completed",
     "conclusion": "success|failure",
     "artifacts": [...],
     "errors": [...],
     "error_log_updated": true
   }
   ```
5. **Continue monitoring** until all workflows for the push SHA reach terminal state, or parent agent recalls it.

## Output Schema
```json
{
  "monitoring": true,
  "branch": "hermes/autopilot/2026-09-28-android-audit",
  "sha": "abc123",
  "workflows_tracked": [
    {"name": "Build APK", "run_id": 123, "status": "in_progress", "conclusion": null}
  ],
  "completed": [
    {"name": "Build APK", "run_id": 123, "conclusion": "success", "artifacts": ["nora-full-arm64-v8a-release-signed"]}
  ],
  "failures": [
    {"name": "Android Smoke Test", "run_id": 124, "conclusion": "failure", "error_signature": "gradle: error: cannot find symbol NouController", "classification": "deterministic", "error_log_entry": "E-008"}
  ],
  "error_log_updated": true
}
```

## Constraints
- Zero local compute — runs as remote subagent
- Uses GitHub API (public repo, no auth needed for public reads; for dispatch/re-run needs token — if unavailable, report limitation)
- Does not modify source code; only reads state, writes error_log, updates state.json pending_tasks
- Polling interval: 30s (configurable via state.json `ci_monitor_interval`)
- Max duration: 60 minutes (then reports timeout)
- Respects GitHub API rate limits

## Integration
- Parent agent dispatches this after `git push`
- Parent agent continues other work; results arrive asynchronously
- On failure classification `deterministic`, parent agent picks up fix task from `state.json`
- `ci-monitor` itself is recorded in `state.json` `in_progress` with subagent ID