#!/bin/sh
# Notarizes a Developer ID signed dist/QuotaCanary.app, staples the ticket, and
# writes the release archive dist/QuotaCanary-<version>.zip (the file
# sign-update.sh signs and the download page serves).
#
#   QUOTACANARY_SIGN_IDENTITY=... ./scripts/bundle.sh && ./scripts/notarize.sh
#
# Credentials are a notarytool keychain profile, created once per Mac with
#   xcrun notarytool store-credentials quotacanary-notary \
#     --apple-id <apple id> --team-id <team id>
# QUOTACANARY_NOTARY_PROFILE overrides the profile name. The scripts never see
# the app-specific password.
set -eu
cd "$(dirname "$0")/.."

APP="${1:-dist/QuotaCanary.app}"
PROFILE="${QUOTACANARY_NOTARY_PROFILE:-quotacanary-notary}"
fail() { echo "Notarize: $1"; exit 1; }

[ -d "$APP" ] || fail "no $APP (run bundle.sh with QUOTACANARY_SIGN_IDENTITY set)"
INFO="$(codesign -dvv "$APP" 2>&1)"
echo "$INFO" | grep -q "^Authority=Developer ID Application" \
  || fail "$APP is not signed with a Developer ID Application certificate"
echo "$INFO" | grep -q "flags=.*runtime" || fail "$APP has no hardened runtime"
echo "$INFO" | grep -q "^Timestamp=" || fail "$APP has no secure timestamp"

VERSION="$(tr -d '[:space:]' < VERSION)"
DIST="$(dirname "$APP")"
SUBMIT="$(mktemp -d)/QuotaCanary-notarize.zip"
ditto -c -k --keepParent "$APP" "$SUBMIT"

xcrun notarytool submit "$SUBMIT" --keychain-profile "$PROFILE" --wait
rm -f "$SUBMIT"

xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"

# Zip after stapling so the archive carries the ticket and works offline.
ZIP="$DIST/QuotaCanary-$VERSION.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "Notarized and stapled $APP"
echo "Archive: $ZIP"
echo "SHA-256: $(shasum -a 256 "$ZIP" | awk '{print $1}')"
