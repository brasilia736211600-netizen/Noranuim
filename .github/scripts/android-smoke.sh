#!/usr/bin/env bash
set -euo pipefail

mkdir -p smoke/diagnostics
x64="smoke/full-x86_64/app-full-x86_64-release.apk"
foss="smoke/foss-x86_64/app-foss-x86_64-release-unsigned.apk"

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk_root" ]]; then
  adb_path="$(command -v adb)"
  test -n "$adb_path"
  adb_real="$(realpath "$adb_path")"
  sdk_root="$(cd "$(dirname "$adb_real")/.." && pwd)"
fi
test -d "$sdk_root/platform-tools"
build_tools="$sdk_root/build-tools/37.0.0"
aapt2="$build_tools/aapt2"
apksigner="$build_tools/apksigner"
test -x "$aapt2"
test -x "$apksigner"
echo "Android SDK root: $sdk_root"
echo "Android Build Tools: $build_tools"

package_name=$("$aapt2" dump badging "$x64" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -n1)
test -n "$package_name"
echo "$package_name" | tee smoke/diagnostics/package.txt
adb shell getprop > smoke/diagnostics/device-properties.txt

sign_foss_for_runtime() {
  local keystore="$RUNNER_TEMP/noranuim-smoke-foss.jks"
  local signed="$RUNNER_TEMP/noranuim-foss-smoke-signed.apk"
  keytool -genkeypair -noprompt -keystore "$keystore" -storepass android -keypass android -alias smoke -keyalg RSA -keysize 2048 -validity 1 -dname 'CN=Noranuim CI Smoke Test,O=Noranuim,C=US' >/dev/null 2>&1
  "$apksigner" sign --ks "$keystore" --ks-pass pass:android --key-pass pass:android --out "$signed" "$foss"
  mv "$signed" "$foss"
  "$apksigner" verify --verbose "$foss" > smoke/diagnostics/foss-signature.txt
  rm -f "$keystore"
}

wait_for_running() {
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if adb shell pidof "$package_name" | tr -d '\r' | xargs | grep -q .; then return 0; fi
    sleep 2
done
  return 1
}

wait_for_resumed() {
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if adb shell dumpsys activity activities | grep -m1 'mResumedActivity' | grep -q "$package_name"; then return 0; fi
    sleep 2
done
  return 1
}

assert_no_crash() {
  local log="$1"
  if grep -E "FATAL EXCEPTION|ANR in ${package_name}|Process: ${package_name}" "$log"; then return 1; fi
}

smoke_apk() {
  local apk="$1"
  local label="$2"
  local safe="${label// /-}"
  local activity
  adb install -r "$apk"
  activity=$(adb shell cmd package resolve-activity --brief "$package_name" | tr -d '\r' | awk 'NF {last=$0} END {print last}')
  test -n "$activity"
  test "$activity" != "No activity found"
  echo "$activity" > "smoke/diagnostics/${safe}-activity.txt"
  adb shell am force-stop "$package_name"
  adb logcat -c
  adb shell am start -W -n "$activity" | tee "smoke/diagnostics/${safe}-cold-start.txt"
  wait_for_running
  wait_for_resumed
  adb exec-out screencap -p > "smoke/diagnostics/${safe}-cold-launch.png"
  adb logcat -d -v time > "smoke/diagnostics/${safe}-first-logcat.txt"
  assert_no_crash "smoke/diagnostics/${safe}-first-logcat.txt"
  adb shell am force-stop "$package_name"
  adb shell am start -W -n "$activity" | tee "smoke/diagnostics/${safe}-relaunch.txt"
  wait_for_running
  wait_for_resumed
  adb exec-out screencap -p > "smoke/diagnostics/${safe}-relaunch.png"
  adb logcat -d -v time > "smoke/diagnostics/${safe}-relaunch-logcat.txt"
  assert_no_crash "smoke/diagnostics/${safe}-relaunch-logcat.txt"
  adb shell am force-stop "$package_name"
  echo "$label PASS"
}

trap 'set +e; adb shell dumpsys activity activities > smoke/diagnostics/final-activity.txt 2>&1; adb shell dumpsys package "$package_name" > smoke/diagnostics/final-package.txt 2>&1; adb logcat -d -v time > smoke/diagnostics/final-logcat.txt 2>&1; adb exec-out screencap -p > smoke/diagnostics/final-screen.png 2>/dev/null; true' EXIT

sign_foss_for_runtime
smoke_apk "$x64" "Full x86_64 signed"
adb uninstall "$package_name"
smoke_apk "$foss" "FOSS x86_64 CI-signed"
