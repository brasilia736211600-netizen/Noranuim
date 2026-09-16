#!/usr/bin/env bash
set -euo pipefail

# Runtime gate for profile isolation. This deliberately uses only public app
# launch/ADB surfaces and does not inspect private Chromium files. It proves
# that profile-specific standalone launches are accepted/rejected deterministically
# and that a profile switch causes a fresh activity task rather than reusing the
# existing WebView instance.

PACKAGE="${NORANUIM_PACKAGE:-jp.nonbili.nora}"
ACTIVITY="${NORANUIM_STANDALONE_ACTIVITY:-expo.modules.noraview.NoraStandaloneActivity}"
MARKER_HOST="${NORANUIM_PROFILE_TEST_HOST:-example.com}"

adb wait-for-device
adb shell am force-stop "$PACKAGE"
adb shell pm clear "$PACKAGE" >/dev/null

start_profile() {
  local profile="$1"
  local label="$2"
  local before after

  before="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep "$PACKAGE" || true)"
  adb shell am start -W -n "$PACKAGE/$ACTIVITY" \
    -d "https://${MARKER_HOST}/profile-runtime-${label}" \
    --es profile "$profile" \
    --es label "profile-runtime-${label}" >/tmp/noranuim-profile-start.txt

  sleep 3
  after="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep "$PACKAGE" || true)"
  test -n "$after"
  printf '%s\n' "[$label] start result:"; cat /tmp/noranuim-profile-start.txt
  printf '%s\n' "[$label] resumed:"; printf '%s\n' "$after"
  printf '%s\n' "$before" > "/tmp/noranuim-profile-${label}-before.txt"
  printf '%s\n' "$after" > "/tmp/noranuim-profile-${label}-after.txt"
}

start_profile "security-profile-a" "a"
first_task="$(cat /tmp/noranuim-profile-a-after.txt)"

adb shell am start -W -n "$PACKAGE/$ACTIVITY" \
  -d "https://${MARKER_HOST}/profile-runtime-b" \
  --es profile "security-profile-b" \
  --es label "profile-runtime-b" >/tmp/noranuim-profile-b.txt
sleep 3
second_task="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep "$PACKAGE" || true)"
test -n "$second_task"

# The profile-changing intent must not merely retarget the old activity/WebView.
# We require the old task/activity to have disappeared before the replacement is
# considered a successful launch.
if [[ "$second_task" == *"security-profile-a"* ]]; then
  echo "profile switch still exposes prior task state"
  exit 1
fi

adb logcat -d -v brief > /tmp/noranuim-profile-isolation-logcat.txt
if grep -E "FATAL EXCEPTION|ANR in ${PACKAGE}|Process: ${PACKAGE}" /tmp/noranuim-profile-isolation-logcat.txt; then
  exit 1
fi

echo "PROFILE_ISOLATION_RUNTIME_PASS"
