#!/bin/sh
# Builds the first-install disk image dist/QuotaCanary-<version>.dmg from a
# notarized, stapled dist/QuotaCanary.app (QUO-364): the app plus an
# /Applications shortcut, so a download ends up installed, not in Downloads
# where the updater refuses to run. The update zip stays the updater's payload.
#
#   QUOTACANARY_SIGN_IDENTITY="Developer ID Application: ..." ./scripts/dmg.sh
#
# Signs the image with the same Developer ID as bundle.sh, notarizes it with
# the notarize.sh keychain profile, staples the ticket and checks Gatekeeper.
set -eu
cd "$(dirname "$0")/.."

APP="${1:-dist/QuotaCanary.app}"
PROFILE="${QUOTACANARY_NOTARY_PROFILE:-quotacanary-notary}"
fail() { echo "DMG: $1"; exit 1; }

[ -d "$APP" ] || fail "no $APP (run bundle.sh and notarize.sh first)"
[ -n "${QUOTACANARY_SIGN_IDENTITY:-}" ] || fail "QUOTACANARY_SIGN_IDENTITY is not set"
xcrun stapler validate -q "$APP" || fail "$APP has no notarization ticket (run notarize.sh first)"

VERSION="$(tr -d '[:space:]' < VERSION)"
BUILT="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")"
[ "$BUILT" = "$VERSION" ] || fail "$APP is version $BUILT, VERSION says $VERSION (rebuild it)"
DIST="$(dirname "$APP")"
DMG="$DIST/QuotaCanary-$VERSION.dmg"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/QuotaCanary.app"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG"
hdiutil create -quiet -volname "QuotaCanary" -srcfolder "$STAGE" -fs HFS+ -format UDZO "$DMG"
codesign --force --sign "$QUOTACANARY_SIGN_IDENTITY" --timestamp "$DMG"

xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"

echo "Disk image: $DMG"
echo "SHA-256: $(shasum -a 256 "$DMG" | awk '{print $1}')"
