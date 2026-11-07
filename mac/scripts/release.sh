#!/bin/sh
# Prepare from a fresh checkout. Verify or publish ONLY the exact reviewed pair:
#   release.sh                         builds, notarizes and verifies; no publication
#   release.sh --verify ZIP_SHA256 DMG_SHA256
#   release.sh --publish ZIP_SHA256 DMG_SHA256
# Use the hashes from preparation/review, never compute new pins from a suspect dist/.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "Release: $1" >&2; exit 1; }
hash() { shasum -a 256 "$1" | awk '{print $1}'; }
MODE=${1:---prepare}
case "$MODE:$#" in --prepare:0|--prepare:1|--verify:3|--publish:3) ;;
  *) fail 'usage: release.sh [--prepare | --verify ZIP_SHA256 DMG_SHA256 | --publish ZIP_SHA256 DMG_SHA256]' ;;
esac
VERSION=$(tr -d '[:space:]' < VERSION)
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail 'invalid VERSION'
[ -z "$(git status --porcelain -- .)" ] || fail 'mac/ must be committed and clean'
COMMIT=$(git rev-parse HEAD)
TREE=$(git rev-parse HEAD:mac)
REPO=noamdorr/quotacanary-oss
TAG="mac-v$VERSION"
STEM="QuotaCanary-$VERSION"
ZIP="dist/$STEM.zip"
DMG="dist/$STEM.dmg"
FEED="dist/updates-$VERSION.json"
DIGEST="dist/mac-dmg-$VERSION.json"
NOTES="dist/release-notes-$VERSION.md"
PUB=$(sed -n 's/^  public static let publicKeyBase64 = "\([^"]*\)"$/\1/p' Sources/QuotaCanaryCore/Updates.swift)
[ -n "$PUB" ] || fail 'compiled update verification key not found'
TMP=$(mktemp -d)
cleanup() {
  if [ -f "$TMP/source/.git" ]; then git worktree remove --force "$TMP/source" || return 1; fi
  rm -rf "$TMP"
}
trap cleanup EXIT
if [ "$MODE" = --prepare ]; then
  : "${QUOTACANARY_SIGN_IDENTITY:?Set the release Developer ID signing identity}"
  # An existing app, .build, ignored source file or same-version archive in
  # the operator's checkout is never an input to a prepared release.
  git worktree add --quiet --detach "$TMP/source" "$COMMIT"
  (cd "$TMP/source/mac" && QUOTACANARY_ARCHS='arm64 x86_64' ./scripts/bundle.sh && ./scripts/notarize.sh && ./scripts/dmg.sh)
  STAGE="$TMP/source/mac/dist"
  ZIP_SHA=$(hash "$STAGE/$STEM.zip")
  DMG_SHA=$(hash "$STAGE/$STEM.dmg")
  ./scripts/verify-packages.sh "$VERSION" "$TREE" "$STAGE/$STEM.zip" "$STAGE/$STEM.dmg" "$ZIP_SHA" "$DMG_SHA"
  ./scripts/sign-update.sh "$STAGE/$STEM.zip" "$VERSION" > "$TMP/updates.json"
  swift scripts/update-tool.swift verify "$PUB" "$STAGE/$STEM.zip" "$VERSION" "$TMP/updates.json"
  mkdir -p dist
  mv "$STAGE/$STEM.zip" "$ZIP"
  mv "$STAGE/$STEM.dmg" "$DMG"
  mv "$TMP/updates.json" "$FEED"
  printf '{\n  "version": "%s",\n  "sha256": "%s"\n}\n' "$VERSION" "$DMG_SHA" > "$DIGEST"
  cat > "$NOTES" <<NOTES_EOF
Signed, notarized build. Download: https://quotacanary.com/download/mac

Built from the mac/ tree $TREE. Verify with \`git rev-parse $TAG:mac\`.

SHA-256 (check with \`shasum -a 256 <file>\`):

\`\`\`
$DMG_SHA  $STEM.dmg
$ZIP_SHA  $STEM.zip
\`\`\`
NOTES_EOF
  echo "Prepared, not published. Record these hashes independently."
  echo "  ./scripts/release.sh --verify $ZIP_SHA $DMG_SHA"
  echo "  ./scripts/release.sh --publish $ZIP_SHA $DMG_SHA"
  exit 0
fi
ZIP_SHA=$2 DMG_SHA=$3
# Verify and use one private snapshot. Neither upload nor site staging may
# reopen mutable dist/ paths after verification.
cp "$ZIP" "$DMG" "$FEED" "$TMP/"
./scripts/verify-packages.sh "$VERSION" "$TREE" "$TMP/$STEM.zip" "$TMP/$STEM.dmg" "$ZIP_SHA" "$DMG_SHA"
swift scripts/update-tool.swift verify "$PUB" "$TMP/$STEM.zip" "$VERSION" "$TMP/updates-$VERSION.json"
[ "$MODE" = --publish ] || exit 0
[ "$(gh api "repos/$REPO" --jq .visibility)" = public ] || fail 'release repository must be public'
# Resolve the tag itself (including annotated tags), never a same-named branch.
tag_commit() {
  filter='.object | "\(.type) \(.sha)"'
  object=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq "$filter") || return 1
  while [ "${object%% *}" = tag ]; do
    object=$(gh api "repos/$REPO/git/tags/${object#* }" --jq "$filter") || return 1
  done
  [ "${object%% *}" = commit ] || return 1
  printf '%s\n' "${object#* }"
}
# Include drafts and distinguish an absent release from a failed lookup.
EXISTING=$(gh api --paginate "repos/$REPO/releases?per_page=100" --jq ".[] | select(.tag_name == \"$TAG\") | .id")
if [ -n "$EXISTING" ]; then
  RELEASE_SHA=$(tag_commit) || fail 'existing release tag does not resolve to a commit'
else
  RELEASE_SHA=$(gh api "repos/$REPO/commits/main" --jq .sha)
fi
ROOT_TREE=$(gh api "repos/$REPO/git/commits/$RELEASE_SHA" --jq .tree.sha)
MAC_TREE=$(gh api "repos/$REPO/git/trees/$ROOT_TREE" --jq '.tree[] | select(.path == "mac" and .type == "tree") | .sha')
[ "$MAC_TREE" = "$TREE" ] || {
  [ -z "$EXISTING" ] || fail 'tagged mac/ tree differs from the reviewed source'
  fail 'mirror main must contain this exact mac/ source tree before publication'
}
if [ -z "$EXISTING" ]; then
  # Creating a lightweight tag never overwrites one. Reuse only an exact match.
  gh api --method POST "repos/$REPO/git/refs" -f "ref=refs/tags/$TAG" -f "sha=$RELEASE_SHA" >/dev/null ||
    echo 'Tag creation was not confirmed. Checking the existing tag.' >&2
  [ "$(tag_commit)" = "$RELEASE_SHA" ] || fail 'existing tag does not point at the reviewed mirror source'
  # Generate notes from the validated pins, not an editable dist/ document.
  printf 'Mac source tree: `%s` on `%s`.\n\nSHA-256:\n```\n%s  %s.dmg\n%s  %s.zip\n```\n' "$TREE" "$TAG" "$DMG_SHA" "$STEM" "$ZIP_SHA" "$STEM" > "$TMP/notes.md"
  gh release create "$TAG" "$TMP/$STEM.zip" "$TMP/$STEM.dmg" --repo "$REPO" --verify-tag \
    --title "QuotaCanary for Mac $VERSION" --notes-file "$TMP/notes.md" --latest=false
fi
gh api "repos/$REPO/releases/tags/$TAG" > "$TMP/release.json"
python3 - "$TMP/release.json" "$TAG" "$STEM" "$ZIP_SHA" "$DMG_SHA" <<'PY'
import json, sys
path, tag, stem, zip_sha, dmg_sha = sys.argv[1:]
with open(path) as source:
    release = json.load(source)
if release["tag_name"] != tag or release["draft"] is not False or release["prerelease"] is not False or not release["published_at"]:
    sys.exit("Expected a published release for " + tag)
expected = {(stem + ".zip", "sha256:" + zip_sha), (stem + ".dmg", "sha256:" + dmg_sha)}
assets = release["assets"]
uploaded = {(a["name"], a["digest"]) for a in assets if a["state"] == "uploaded"}
if len(assets) != len(expected) or uploaded != expected:
    sys.exit("GitHub release assets differ from the reviewed package pair")
PY
gh release download "$TAG" --repo "$REPO" --pattern "$STEM.*" --dir "$TMP/served"
for ext in zip dmg; do
  expected=$ZIP_SHA; [ "$ext" = zip ] || expected=$DMG_SHA
  [ "$(hash "$TMP/served/$STEM.$ext")" = "$expected" ] || fail "served $ext differs"
done
[ "$(tag_commit)" = "$RELEASE_SHA" ] || fail 'release tag changed during verification'
cp "$TMP/updates-$VERSION.json" ../site/public/mac/updates.json
printf '{\n  "version": "%s",\n  "sha256": "%s"\n}\n' "$VERSION" "$DMG_SHA" > ../site/src/data/mac-dmg.json
echo 'Published and verified both served assets. Ship the two site files through a PR.'
