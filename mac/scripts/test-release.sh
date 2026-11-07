#!/bin/sh
# Exercise publication ordering with a disposable repo and fake GitHub; the
# package/signature verifier itself is exercised separately on the real pair.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/repo/mac/scripts" "$T/repo/mac/Sources/QuotaCanaryCore" "$T/bin" "$T/served" \
  "$T/repo/site/public/mac" "$T/repo/site/src/data"
cp "$HERE/release.sh" "$T/repo/mac/scripts/"
cd "$T/repo"
git init -q
printf '0.2.0\n' > mac/VERSION
printf '  public static let publicKeyBase64 = "fake"\n' > mac/Sources/QuotaCanaryCore/Updates.swift
printf 'mac/dist/\n' > .gitignore
cat > mac/scripts/verify-packages.sh <<'MOCK'
#!/bin/sh
set -eu
[ "$(shasum -a 256 "$3" | awk '{print $1}')" = "$5" ] && [ "$(shasum -a 256 "$4" | awk '{print $1}')" = "$6" ]
MOCK
cat > "$T/bin/swift" <<'MOCK'
#!/bin/sh
set -eu
[ "$2" = verify ] && [ "$(cat "$6")" = verified-feed ]
MOCK
cat > "$T/bin/gh" <<'MOCK'
#!/bin/sh
set -eu
case "$*" in
  'api '*'/quotacanary-oss --jq .visibility') echo public ;;
  'api --paginate '*'/releases?'*) printf 'substituted\n' > dist/updates-0.2.0.json
    if [ -f "$TEST_SERVED/created" ]; then echo 123; fi ;;
  'api --method POST '*) [ ! -e "$TEST_SERVED/tag" ] || exit 1
    for last; do :; done
    printf 'commit %s\n' "${last#sha=}" > "$TEST_SERVED/tag" ;;
  'api '*'/git/ref/tags/'*) cat "$TEST_SERVED/tag" ;;
  'api '*'/git/tags/annotated '*) echo 'commit reviewed' ;;
  'api '*'/commits/main'*) cat "$TEST_SERVED/main" ;;
  'api '*'/git/commits/'*) case "$*" in
    *'/reviewed '*|*'/later-site '*) echo same-tree ;;
    *'/later-mac '*) echo changed-tree ;;
    *) echo "unexpected commit: $*" >&2; exit 1 ;;
    esac ;;
  'api '*'/git/trees/same-tree '*) echo "$TEST_TREE" ;;
  'api '*'/git/trees/changed-tree '*) echo wrong-mac-tree ;;
  'api '*'/releases/tags/'*)
    [ -f "$TEST_SERVED/created" ]
    python3 - <<'PY'
import json, os
mode = os.environ.get("TEST_RELEASE")
assets = [{"name": "QuotaCanary-0.2.0." + ext, "state": "uploaded",
           "digest": "sha256:" + os.environ[ext.upper() + "_HASH"]} for ext in ("zip", "dmg")]
if mode == "missing": assets.pop()
if mode == "wrong-digest": assets[0]["digest"] = "sha256:wrong"
print(json.dumps({"tag_name": "mac-v0.2.0", "draft": mode == "draft", "prerelease": False,
                  "published_at": "2026-11-07", "assets": assets}))
PY
    ;;
  'release create'*) case " $* " in *' --verify-tag '*) :;; *) exit 1;; esac
    echo create >> "$TEST_SERVED/creates"
    [ ! -e "$TEST_SERVED/created" ]
    cp "$4" "$5" "$TEST_SERVED/"; touch "$TEST_SERVED/created" ;;
  'release download'*)
    if [ "$TEST_RELEASE" = transient ]; then echo "transient readback failure" >&2; exit 1; fi
    if [ "$TEST_RELEASE" = retag ]; then echo 'commit later-site' > "$TEST_SERVED/tag"; fi
    for last; do :; done; mkdir -p "$last"; cp "$TEST_SERVED"/QuotaCanary* "$last/" ;;
  *) echo "Unexpected mock call: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x mac/scripts/* "$T/bin/gh" "$T/bin/swift"
git add . && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm fixture
cd mac
export PATH="$T/bin:$PATH" TEST_SERVED="$T/served"
TEST_TREE=$(git rev-parse HEAD:mac); export TEST_TREE
mkdir dist
printf 'zip-fixture\n' > dist/QuotaCanary-0.2.0.zip
printf 'dmg-fixture\n' > dist/QuotaCanary-0.2.0.dmg
ZIP_HASH=$(shasum -a 256 dist/QuotaCanary-0.2.0.zip | awk '{print $1}'); export ZIP_HASH
DMG_HASH=$(shasum -a 256 dist/QuotaCanary-0.2.0.dmg | awk '{print $1}'); export DMG_HASH

publish() {
  printf 'verified-feed\n' > dist/updates-0.2.0.json
  TEST_RELEASE=$1 ./scripts/release.sh --publish "$ZIP_HASH" "$DMG_HASH"
}
reject() {
  if publish "$1" > "$T/rejection" 2>&1; then echo "Unexpected success: $1"; exit 1; fi
  grep -Fq "$2" "$T/rejection" || { cat "$T/rejection" >&2; exit 1; }
  [ ! -e ../site/public/mac/updates.json ] && [ ! -e ../site/src/data/mac-dmg.json ]
}
echo reviewed > "$TEST_SERVED/main"
# Even a preexisting tag with the same mac/ tree must point to the chosen
# mirror main commit when creating a NEW release.
echo 'commit later-site' > "$TEST_SERVED/tag"
reject normal "existing tag does not point"
[ ! -e "$TEST_SERVED/created" ]
rm "$TEST_SERVED/tag"
reject transient "transient readback failure"
[ -f "$TEST_SERVED/created" ]
echo later-site > "$TEST_SERVED/main"
echo 'commit later-mac' > "$TEST_SERVED/tag"
reject normal "tagged mac/ tree differs"
echo 'commit reviewed' > "$TEST_SERVED/tag"
reject draft "Expected a published release"
reject missing "assets differ"
reject wrong-digest "assets differ"
printf 'changed\n' > "$TEST_SERVED/QuotaCanary-0.2.0.dmg"
reject normal "served dmg differs"
cp dist/QuotaCanary-0.2.0.dmg "$TEST_SERVED/"
reject retag "tag changed"
echo 'commit reviewed' > "$TEST_SERVED/tag"
publish normal > "$T/accepted"
# Even a later main with a different mac/ tree doesn't change reviewed bytes.
echo later-mac > "$TEST_SERVED/main"
echo 'tag annotated' > "$TEST_SERVED/tag"
publish normal > "$T/accepted"
[ "$(cat "$TEST_SERVED/creates")" = create ]
[ "$(cat ../site/public/mac/updates.json)" = verified-feed ]
grep -Fq "$DMG_HASH" ../site/src/data/mac-dmg.json
echo 'PASS: recovered from the reviewed tag after mirror main advanced; mismatched trees, changed tags and assets rejected.'
