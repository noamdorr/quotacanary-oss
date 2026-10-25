#!/bin/sh
# Inspects a built QuotaCanary.app and prints a short report: architectures,
# minimum macOS per slice, bundle identity and version, signature, Gatekeeper
# verdict, binary hash, toolchain. Exits 1 if the bundle is not what
# bundle.sh promises (slices, minos 26.0, identity, version, valid signature).
#
# Usage: scripts/inspect.sh [path/to/QuotaCanary.app]
set -eu
cd "$(dirname "$0")/.."
APP="${1:-dist/QuotaCanary.app}"
BIN="$APP/Contents/MacOS/QuotaCanary"
PLIST="$APP/Contents/Info.plist"
EXPECT_ARCHS="${QUOTACANARY_ARCHS:-arm64 x86_64}"
EXPECT_VERSION="$(tr -d '[:space:]' < VERSION)"
FAILED=0

fail() {
  echo "  FAIL: $*"
  FAILED=1
}

key() {
  plutil -extract "$1" raw -o - "$PLIST" 2>/dev/null || echo "(missing)"
}

[ -x "$BIN" ] || { echo "No executable at $BIN (run scripts/bundle.sh first)"; exit 1; }
plutil -lint -s "$PLIST" || fail "Info.plist does not lint"

ARCHS="$(lipo -archs "$BIN")"
echo "Bundle:        $APP"
echo "Architectures: $ARCHS"
for A in $EXPECT_ARCHS; do
  case " $ARCHS " in *" $A "*) ;; *) fail "missing $A slice" ;; esac
done

for A in $ARCHS; do
  MINOS="$(otool -arch "$A" -l "$BIN" | awk '/LC_BUILD_VERSION/ {f=1} f && $1 == "minos" {print $2; exit}')"
  SDK="$(otool -arch "$A" -l "$BIN" | awk '/LC_BUILD_VERSION/ {f=1} f && $1 == "sdk" {print $2; exit}')"
  echo "  $A: minos $MINOS, sdk $SDK"
  [ "$MINOS" = "26.0" ] || fail "$A minos is $MINOS, want 26.0"
done

ID="$(key CFBundleIdentifier)"
VER="$(key CFBundleShortVersionString)"
echo "Identifier:    $ID"
echo "Version:       $VER (build $(key CFBundleVersion), commit $(key QuotaCanaryGitCommit))"
echo "Min macOS:     $(key LSMinimumSystemVersion) (LSMinimumSystemVersion)"
[ "$ID" = "com.quotacanary.mac" ] || fail "identifier is $ID"
[ "$VER" = "$EXPECT_VERSION" ] || fail "version is $VER, mac/VERSION says $EXPECT_VERSION"
[ "$(key LSMinimumSystemVersion)" = "26.0" ] || fail "LSMinimumSystemVersion is not 26.0"
[ -f "$APP/Contents/Resources/LICENSE" ] || fail "LICENSE missing from Contents/Resources"
[ "$(key CFBundleIconFile)" = "AppIcon" ] || fail "CFBundleIconFile is not AppIcon"
[ -f "$APP/Contents/Resources/AppIcon.icns" ] || fail "AppIcon.icns missing from Contents/Resources"
for PROVIDER in openrouter hunter tavily apollo prospeo; do
  [ -f "$APP/Contents/Resources/ProviderLogos/$PROVIDER.png" ] || fail "$PROVIDER logo missing from bundle"
done
# The shared adapter catalog ships with the app and must be the committed copy (QUO-190).
cmp -s "$APP/Contents/Resources/tools.json" Sources/QuotaCanaryCore/Resources/tools.json \
  || fail "tools.json missing from Contents/Resources or differs from the committed copy"

SIG="$(codesign -dv "$APP" 2>&1 | awk -F= '/^Signature=/ {print $2}')"
TEAM="$(codesign -dv "$APP" 2>&1 | awk -F= '/^TeamIdentifier=/ {print $2}')"
if codesign --verify --strict "$APP" 2>/dev/null; then
  echo "Signature:     ${SIG:-Developer ID or other} (team: ${TEAM:-none}), verifies"
else
  fail "codesign --verify --strict failed"
fi
if [ "$SIG" = "adhoc" ]; then
  echo "Package kind:  DEVELOPMENT (ad hoc). Not Developer ID signed, not notarized."
fi
# Gatekeeper's verdict is informational: an ad hoc build is expected to be rejected.
echo "Gatekeeper:    $(spctl --assess --type execute "$APP" 2>&1 | head -1 || true)"
echo "SHA-256:       $(shasum -a 256 "$BIN" | awk '{print $1}')  (Contents/MacOS/QuotaCanary)"
echo "Toolchain:     $(swift --version 2>/dev/null | head -1)"

[ "$FAILED" = 0 ] && echo "Inspect: OK" || { echo "Inspect: FAILED"; exit 1; }
