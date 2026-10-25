#!/bin/sh
# Prints the update feed entry (JSON) for a release archive, signed with the
# private key from scripts/update-keys.sh (QUO-139).
#
# Usage: scripts/sign-update.sh <archive.zip> <version> [download-url]
#
#   archive       a zip with QuotaCanary.app at its top level, made with
#                 ditto -c -k --keepParent dist/QuotaCanary.app QuotaCanary-<version>.zip
#   version       must equal the bundle's CFBundleShortVersionString
#   download-url  where the zip will be served; default
#                 https://quotacanary.com/mac/QuotaCanary-<version>.zip
#
# minimumSystemVersion comes from the bundle's LSMinimumSystemVersion.
# QUOTACANARY_UPDATE_NOTES sets the optional "notes" field (not signed, not
# shown in the app). The entry carries two Ed25519 signatures: "signature" over
# the archive's raw bytes, "feedSignature" over
# "quotacanary-mac-update\n<version>\n<minimumSystemVersion>\n<sha256>".
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
KEY="$HOME/.config/quotacanary-mac/update-signing.key"

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: $0 <archive.zip> <version> [download-url]" >&2
  exit 2
fi
ARCHIVE="$1"
VERSION="$2"
URL="${3:-https://quotacanary.com/mac/QuotaCanary-$VERSION.zip}"
[ -f "$ARCHIVE" ] || { echo "No archive at $ARCHIVE" >&2; exit 1; }
[ -f "$KEY" ] || { echo "No private key at $KEY. Run scripts/update-keys.sh first." >&2; exit 1; }

# Refuse to sign something the app would reject anyway.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ditto -x -k "$ARCHIVE" "$TMP"
PLIST="$TMP/QuotaCanary.app/Contents/Info.plist"
[ -f "$PLIST" ] || { echo "The archive has no QuotaCanary.app at its top level." >&2; exit 1; }
read_plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST"; }
ID="$(read_plist CFBundleIdentifier)"
[ "$ID" = com.quotacanary.mac ] || { echo "Bundle identifier is $ID, expected com.quotacanary.mac." >&2; exit 1; }
BUNDLE_VERSION="$(read_plist CFBundleShortVersionString)"
[ "$BUNDLE_VERSION" = "$VERSION" ] || { echo "The bundle is version $BUNDLE_VERSION, not $VERSION." >&2; exit 1; }
MINIMUM="$(read_plist LSMinimumSystemVersion)"
codesign --verify --deep --strict "$TMP/QuotaCanary.app" || { echo "The bundle's code signature does not verify." >&2; exit 1; }

swift "$DIR/update-tool.swift" sign "$KEY" "$ARCHIVE" "$VERSION" "$MINIMUM" "$URL" "${QUOTACANARY_UPDATE_NOTES:-}"
