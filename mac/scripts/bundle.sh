#!/bin/sh
# Builds a release binary for each architecture, merges them with lipo, and
# wraps the result in dist/QuotaCanary.app, signed ad hoc (a development
# package, not a Developer ID release).
#
#   CFBundleShortVersionString  <- mac/VERSION
#   CFBundleVersion             <- `git rev-list --count HEAD` (commit count of
#                                  the checkout you build from), or
#                                  QUOTACANARY_BUILD_NUMBER, or 0 outside git
#   QuotaCanaryGitCommit        <- short commit SHA, or "unknown" outside git
#
# QUOTACANARY_ARCHS overrides the slices (default "arm64 x86_64").
# `-Xlinker -S` leaves out the linker's debug map: it holds each object file's
# modification time (so two clean builds would differ) and the absolute build
# path (the builder's home directory). The shipped binary needs neither.
# SwiftPM's own `--arch arm64 --arch x86_64` needs Xcode's xcbuild, which
# Command Line Tools do not ship, so each slice is built on its own.
set -eu
cd "$(dirname "$0")/.."

ARCHS="${QUOTACANARY_ARCHS:-arm64 x86_64}"
VERSION="$(tr -d '[:space:]' < VERSION)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  BUILD="${QUOTACANARY_BUILD_NUMBER:-$(git rev-list --count HEAD)}"
  COMMIT="$(git rev-parse --short=12 HEAD)"
else
  BUILD="${QUOTACANARY_BUILD_NUMBER:-0}"
  COMMIT=unknown
fi

APP=dist/QuotaCanary.app
SLICES=""
for ARCH in $ARCHS; do
  # One scratch path per slice: Swift 6.4's build system writes every
  # --arch to the same .build/out/Products/Release, so lipo would get one
  # slice twice.
  SCRATCH=".build/slice-$ARCH"
  swift build -c release --arch "$ARCH" --scratch-path "$SCRATCH" -Xlinker -S
  SLICES="$SLICES $(swift build -c release --arch "$ARCH" --scratch-path "$SCRATCH" -Xlinker -S --show-bin-path)/QuotaCanary"
done

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# shellcheck disable=SC2086 # SLICES is a space-separated list of paths without spaces
lipo -create $SLICES -output "$APP/Contents/MacOS/QuotaCanary"
cp LICENSE "$APP/Contents/Resources/LICENSE"
cp -R Sources/QuotaCanary/Resources/ProviderLogos "$APP/Contents/Resources/ProviderLogos"
# The shared adapter catalog (QUO-190); Catalog.bundledData() reads it from Contents/Resources.
cp Sources/QuotaCanaryCore/Resources/tools.json "$APP/Contents/Resources/tools.json"
# Generated from the brand package (QUO-171); never edit it by hand.
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.quotacanary.mac</string>
  <key>CFBundleName</key>
  <string>QuotaCanary</string>
  <key>CFBundleDisplayName</key>
  <string>QuotaCanary</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleExecutable</key>
  <string>QuotaCanary</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$BUILD</string>
  <key>QuotaCanaryGitCommit</key>
  <string>$COMMIT</string>
  <key>LSMinimumSystemVersion</key>
  <string>26.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright (c) 2026 QuotaCanary. MIT License.</string>
</dict>
</plist>
PLIST

codesign -s - --force "$APP"
echo "Built $APP ($VERSION build $BUILD, $COMMIT, $ARCHS), ad hoc signed"
