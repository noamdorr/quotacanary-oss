#!/bin/sh
# The single local entry point for native verification, and the one command a
# macOS CI job would call: debug build, Swift Testing suite, universal release
# bundle, artifact inspection, and a headless launch of the bundled binary.
#
# Usage: scripts/verify.sh [--clean]   (--clean removes .build and dist first)
# Set QUOTACANARY_ROSETTA_SMOKE=1 to also launch the Intel slice under Rosetta 2
# (CI does; see below for why it is off by default).
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--clean" ]; then
  rm -rf .build dist
fi

echo "== toolchain"
swift --version 2>&1 | head -1
sw_vers -productVersion
uname -m

# mac/LICENSE is a copy (so mac/ stands alone); keep it identical to the root one.
if [ -f ../LICENSE ] && ! cmp -s LICENSE ../LICENSE; then
  echo "mac/LICENSE differs from the repository LICENSE"
  exit 1
fi

# The bundled catalog must be the shared one (QUO-190); the Swift suite checks it too.
./scripts/sync-catalog.sh --check

echo "== debug build"
swift build
.build/debug/QuotaCanary --check-provider-logos

echo "== tests"
./scripts/test.sh

# Exercise the real Settings and stack hosts, not isolated SwiftUI snapshots.
# In-memory fixtures only; these checks need a logged-in macOS GUI session.
echo "== Native window regression"
if [ "$(launchctl managername 2>/dev/null)" != Aqua ]; then
  echo "NOT RUN: native window checks need a logged-in macOS GUI session"
  # CI must exercise the windows, never pass a required check without them.
  if [ -n "${CI:-}" ]; then exit 1; fi
else
  for count in 0 1 50; do
    .build/debug/QuotaCanary --check-settings-window "$count"
    .build/debug/QuotaCanary --check-stack-window "$count"
  done
  .build/debug/QuotaCanary --check-interactions 0
  .build/debug/QuotaCanary --check-interactions 1
  # The interaction check must catch what it exists for: a collapsed, empty host.
  if .build/debug/QuotaCanary --check-interactions 50 --inject-defect; then
    echo "The interaction check passed an injected collapsed window"
    exit 1
  fi
  echo "(the FAIL lines above are the injected defect being caught)"
  EVIDENCE=.build/window-evidence
  mkdir -p "$EVIDENCE"
  for look in light dark contrast; do
    status=0
    .build/debug/QuotaCanary --check-interactions 50 "$look" --capture-dir "$EVIDENCE" || status=$?
    case $status in
      0) ;;
      2) echo "$look: NOT RUN, not verified" ;;
      *) exit "$status" ;;
    esac
  done
  echo "Window evidence: $EVIDENCE"
fi

echo "== release bundle"
./scripts/bundle.sh

echo "== inspect"
./scripts/inspect.sh dist/QuotaCanary.app

# Headless launch of the bundled binary: no key, no network, no Keychain, no
# account. Proves the slice this machine runs actually starts and reads the
# bundle's Info.plist (the version lands in the report).
echo "== headless launch"
BIN=dist/QuotaCanary.app/Contents/MacOS/QuotaCanary
VERSION="$(tr -d '[:space:]' < VERSION)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
smoke() {
  label="$1"
  shift
  "$@" "$BIN" --export-diagnostics "$TMP/$label.json"
  "$@" "$BIN" --check-provider-logos
  grep -q "\"$VERSION (" "$TMP/$label.json" || { echo "$label: report lacks version $VERSION"; exit 1; }
  echo "$label: started, wrote diagnostics with version $VERSION"
}
smoke "native $(uname -m)" env
# Opt-in: on Apple silicon, also run the Intel slice under Rosetta 2 when it is
# installed. That is translation, not Intel hardware: it is a smoke signal,
# not runtime acceptance for Intel Macs. Off by default because launching an
# Intel process makes macOS 26 show "Support Ending for Intel-based Apps".
if [ "${QUOTACANARY_ROSETTA_SMOKE:-}" = 1 ] && [ "$(uname -m)" = arm64 ] && lipo -archs "$BIN" | grep -q x86_64 && arch -x86_64 /usr/bin/true 2>/dev/null; then
  smoke "x86_64 under Rosetta 2" arch -x86_64
fi

echo "Verify: OK"
