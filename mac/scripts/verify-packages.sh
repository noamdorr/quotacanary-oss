#!/bin/sh
# Read-only verification of a versioned package pair against independent pins.
# Usage: verify-packages.sh VERSION MAC_TREE ZIP DMG ZIP_SHA256 DMG_SHA256
set -eu
[ "$#" -eq 6 ] || { echo 'Expected VERSION MAC_TREE ZIP DMG ZIP_SHA256 DMG_SHA256' >&2; exit 2; }
VERSION=$1 TREE=$2 ZIP=$3 DMG=$4
fail() { echo "Verify packages: $1" >&2; exit 1; }
hash() { shasum -a 256 "$1" | awk '{print $1}'; }
[ "$(hash "$ZIP")" = "$5" ] || fail 'ZIP hash mismatch'
[ "$(hash "$DMG")" = "$6" ] || fail 'DMG hash mismatch'
# The Apple Developer ID that signs the production app and its disk image.
SIGNER='anchor apple generic and certificate leaf[subject.OU] = "YTTTWJ2T86" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
TMP=$(mktemp -d)
MOUNT="$TMP/mount"
cleanup() {
  if [ -f "$TMP/attached" ]; then hdiutil detach "$MOUNT" -quiet || return 1; fi
  rm -rf "$TMP"
}
trap cleanup EXIT
codesign --verify --strict -R="$SIGNER" "$DMG"
xcrun stapler validate -q "$DMG"
spctl --assess --type open --context context:primary-signature "$DMG"
ditto -x -k "$ZIP" "$TMP/zip"
mkdir "$MOUNT"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT" "$DMG" >/dev/null
touch "$TMP/attached"
[ -L "$MOUNT/Applications" ] && [ "$(readlink "$MOUNT/Applications")" = /Applications ] || fail 'wrong Applications shortcut'
for APP in "$TMP/zip/QuotaCanary.app" "$MOUNT/QuotaCanary.app"; do
  [ -d "$APP" ] && [ ! -L "$APP" ] || fail 'expected app missing'
  codesign --verify --deep --strict -R="identifier \"com.quotacanary.mac\" and $SIGNER" "$APP"
  INFO=$(codesign -dvv "$APP" 2>&1)
  echo "$INFO" | grep -q 'flags=.*runtime' || fail 'hardened runtime missing'
  echo "$INFO" | grep -q '^Timestamp=' || fail 'secure timestamp missing'
  xcrun stapler validate -q "$APP"
  spctl --assess --type execute "$APP"
  PLIST="$APP/Contents/Info.plist"
  read_plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST"; }
  [ "$(read_plist CFBundleShortVersionString)" = "$VERSION" ] || fail 'wrong app version'
  [ "$(read_plist CFBundleIdentifier)" = com.quotacanary.mac ] || fail 'wrong bundle identifier'
  [ "$(read_plist QuotaCanarySourceTree)" = "$TREE" ] || fail 'wrong signed source tree'
  [ "$(read_plist LSMinimumSystemVersion)" = 26.0 ] || fail 'wrong minimum OS'
  lipo "$APP/Contents/MacOS/QuotaCanary" -verify_arch arm64 x86_64 || fail 'missing architecture'
done
# This app contains no frameworks or links. Compare bytes and executable bits
# of every bundled entry, and reject additional launchable payloads at the root.
python3 - "$TMP/zip" "$MOUNT" <<'PY'
import hashlib, os, stat, sys
from pathlib import Path
z, d = map(Path, sys.argv[1:])
for root, allowed in [(z, {'QuotaCanary.app', '__MACOSX'}), (d, {'QuotaCanary.app', 'Applications', '.DS_Store', '.fseventsd', '.Trashes', '.Spotlight-V100', '.VolumeIcon.icns', '.vol', '.HFS+ Private Directory Data\r'})]:
    extra = {p.name for p in root.iterdir()} - allowed
    if extra: sys.exit('Unexpected package root entries: ' + repr(extra))
def entries(root):
    result = {}
    for p in (root / 'QuotaCanary.app').rglob('*'):
        mode = p.lstat().st_mode
        if p.is_symlink() or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            sys.exit('Unexpected link or special file: ' + str(p))
        result[str(p.relative_to(root))] = (stat.S_IFMT(mode), mode & 0o111, hashlib.sha256(p.read_bytes()).digest() if p.is_file() else None)
    return result
if entries(z) != entries(d): sys.exit('ZIP and DMG contain different apps')
PY
echo "Verified $VERSION ($TREE): matching signed, stapled universal apps; Gatekeeper accepted app and DMG."
