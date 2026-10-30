#!/bin/sh
# Cuts a Mac release from mac/VERSION and the notarized build (QUO-350).
#
#   ./scripts/release.sh            # archive + feed, prints the publish command
#   ./scripts/release.sh --publish  # also uploads the archive to the mirror
#
# Writes, in order:
#   dist/QuotaCanary-<version>.zip    notarize.sh's archive (reused if present;
#                                     delete it to notarize again)
#   dist/QuotaCanary-<version>.dmg    dmg.sh's first-install disk image (reused
#                                     if present; QUO-364)
#   ../site/public/mac/updates.json   sign-update.sh's feed entry, served at
#                                     https://quotacanary.com/mac/updates.json
#   GitHub release mac-v<version>     on the public mirror, with the zip and the
#                                     dmg as its assets (--publish only)
#
# The feed's url is https://quotacanary.com/mac/QuotaCanary-<version>.zip,
# which site/server.mjs redirects to that release asset, and
# https://quotacanary.com/download/mac redirects to the .dmg of whatever
# version the feed names. So mac/VERSION is the only version anyone types.
#
# Order matters: publish the asset before the feed reaches quotacanary.com, or
# the app finds an update it cannot download.
set -eu
cd "$(dirname "$0")/.."

REPO=noamdorr/quotacanary-oss # also MAC_RELEASE_REPO in site/server.mjs
PUBLISH=0
case "${1:-}" in
  --publish) PUBLISH=1 ;;
  "") ;;
  *) echo "usage: $0 [--publish]" >&2; exit 2 ;;
esac
fail() { echo "Release: $1" >&2; exit 1; }

VERSION="$(tr -d '[:space:]' < VERSION)"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "VERSION is '$VERSION', expected x.y.z"
TAG="mac-v$VERSION"
ZIP="dist/QuotaCanary-$VERSION.zip"
DMG="dist/QuotaCanary-$VERSION.dmg"
URL="https://quotacanary.com/mac/QuotaCanary-$VERSION.zip"
FEED=../site/public/mac/updates.json

[ -f "$ZIP" ] || ./scripts/notarize.sh
[ -f "$DMG" ] || ./scripts/dmg.sh

# Only a notarized, stapled build goes out; an ad hoc zip would pass
# sign-update.sh and then fail Gatekeeper on every Mac but this one.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ditto -x -k "$ZIP" "$TMP/unpacked"
xcrun stapler validate -q "$TMP/unpacked/QuotaCanary.app" || fail "$ZIP holds a build with no notarization ticket"

# The same goes for the disk image: the first download must open without a
# network round trip to Apple.
xcrun stapler validate -q "$DMG" || fail "$DMG has no notarization ticket"

./scripts/sign-update.sh "$ZIP" "$VERSION" "$URL" > "$TMP/updates.json"
mv "$TMP/updates.json" "$FEED"
SHA="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
echo "Feed:    site/public/mac/updates.json ($VERSION, sha256 $SHA)"

PUBLISH_CMD="gh release create $TAG $ZIP $DMG --repo $REPO --title \"QuotaCanary for Mac $VERSION\" --notes \"Signed, notarized build. Download: https://quotacanary.com/download/mac\" --latest=false"
if [ "$PUBLISH" = 0 ]; then
  echo "Not published. To publish the archive (run from mac/):"
  echo "  $PUBLISH_CMD"
else
  gh release view "$TAG" --repo "$REPO" > /dev/null 2>&1 && fail "$TAG already exists on $REPO"
  gh release create "$TAG" "$ZIP" "$DMG" --repo "$REPO" --title "QuotaCanary for Mac $VERSION" \
    --notes "Signed, notarized build. Download: https://quotacanary.com/download/mac" --latest=false
  # Read back what GitHub serves, not what was sent.
  gh release download "$TAG" --repo "$REPO" --pattern "QuotaCanary-$VERSION.zip" --dir "$TMP/served"
  SERVED="$(shasum -a 256 "$TMP/served/QuotaCanary-$VERSION.zip" | awk '{print $1}')"
  [ "$SERVED" = "$SHA" ] || fail "the published asset's sha256 is $SERVED, the feed says $SHA"
  gh release download "$TAG" --repo "$REPO" --pattern "QuotaCanary-$VERSION.dmg" --dir "$TMP/served"
  [ "$(shasum -a 256 "$TMP/served/QuotaCanary-$VERSION.dmg" | awk '{print $1}')" = "$(shasum -a 256 "$DMG" | awk '{print $1}')" ] \
    || fail "the published disk image differs from $DMG"
  echo "Published $TAG on $REPO; the served zip matches the feed and the served dmg matches dist/."
fi
echo "Next: ship site/public/mac/updates.json through a PR to master (Railway deploys the site)."
