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
# Provenance (QUO-404): the build must come from a clean mac/ whose git tree
# is the mirror main's mac/ tree, byte for byte (tree hashes are content
# addresses). The release tags that mirror commit, and its notes carry the
# SHA-256 of both assets and the tree hash, so anyone can check the download
# against the public source. Sync the mirror before publishing, never after.
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

# The source the build comes from, before spending a notarization on it.
[ -z "$(git status --porcelain -- .)" ] || fail "mac/ has uncommitted changes; build from a commit"
TREE="$(git rev-parse HEAD:mac)"
MIRROR_SHA="$(gh api "repos/$REPO/commits/main" --jq .sha)"
MIRROR_TREE="$(gh api "repos/$REPO/git/trees/$MIRROR_SHA" --jq '.tree[] | select(.path == "mac") | .sha')"
[ "$MIRROR_TREE" = "$TREE" ] \
  || fail "the mirror's main ($MIRROR_SHA) has mac/ tree ${MIRROR_TREE:-none}, this build is $TREE; sync the mirror first"

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

DMG_SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
NOTES="dist/release-notes-$VERSION.md"
cat > "$NOTES" <<NOTES_EOF
Signed, notarized build. Download: https://quotacanary.com/download/mac

Built from tag $TAG on this repository: \`git rev-parse $TAG:mac\` is \`$TREE\`.

SHA-256 (check with \`shasum -a 256 <file>\`):

\`\`\`
$DMG_SHA  QuotaCanary-$VERSION.dmg
$SHA  QuotaCanary-$VERSION.zip
\`\`\`
NOTES_EOF
echo "Notes:   $NOTES"

PUBLISH_CMD="gh release create $TAG $ZIP $DMG --repo $REPO --target $MIRROR_SHA --title \"QuotaCanary for Mac $VERSION\" --notes-file $NOTES --latest=false"
if [ "$PUBLISH" = 0 ]; then
  echo "Not published. To publish the archive (run from mac/):"
  echo "  $PUBLISH_CMD"
else
  gh release view "$TAG" --repo "$REPO" > /dev/null 2>&1 && fail "$TAG already exists on $REPO"
  gh release create "$TAG" "$ZIP" "$DMG" --repo "$REPO" --target "$MIRROR_SHA" --title "QuotaCanary for Mac $VERSION" \
    --notes-file "$NOTES" --latest=false
  # The tag GitHub made must hold the source the notes name.
  [ "$(gh api "repos/$REPO/commits/$TAG" --jq .sha)" = "$MIRROR_SHA" ] || fail "$TAG does not point at $MIRROR_SHA"
  # Read back what GitHub serves, not what was sent.
  gh release download "$TAG" --repo "$REPO" --pattern "QuotaCanary-$VERSION.zip" --dir "$TMP/served"
  SERVED="$(shasum -a 256 "$TMP/served/QuotaCanary-$VERSION.zip" | awk '{print $1}')"
  [ "$SERVED" = "$SHA" ] || fail "the published asset's sha256 is $SERVED, the feed says $SHA"
  gh release download "$TAG" --repo "$REPO" --pattern "QuotaCanary-$VERSION.dmg" --dir "$TMP/served"
  [ "$(shasum -a 256 "$TMP/served/QuotaCanary-$VERSION.dmg" | awk '{print $1}')" = "$(shasum -a 256 "$DMG" | awk '{print $1}')" ] \
    || fail "the published disk image differs from $DMG"
  # GitHub's own asset digest, the one its release page shows.
  [ "$(gh release view "$TAG" --repo "$REPO" --json assets --jq ".assets[] | select(.name == \"QuotaCanary-$VERSION.dmg\") | .digest")" = "sha256:$DMG_SHA" ] \
    || fail "GitHub's digest for the disk image is not $DMG_SHA"
  echo "Published $TAG on $REPO; the served zip matches the feed and the served dmg matches dist/."
fi
echo "Next: ship site/public/mac/updates.json through a PR to master (Railway deploys the site)."
