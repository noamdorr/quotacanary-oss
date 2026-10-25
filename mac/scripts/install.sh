#!/bin/sh
# Installs dist/QuotaCanary.app into ~/Applications (your user only, no sudo)
# and registers it with Launch Services. Run scripts/bundle.sh first.
#
# Usage: scripts/install.sh                          install or replace
#        scripts/install.sh --uninstall              quit and remove the installed copy
#        scripts/install.sh --uninstall --erase-data also erase every app-owned key,
#                                                    history and settings
#
# Plain --uninstall leaves your saved connections and Keychain items alone.
set -eu
cd "$(dirname "$0")/.."

SRC=dist/QuotaCanary.app
DEST="$HOME/Applications/QuotaCanary.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

quit_installed() {
  # Only the copy running from $DEST, never a dev build running elsewhere.
  pkill -f "^$DEST/Contents/MacOS/QuotaCanary" 2>/dev/null || true
}

if [ "${1:-}" = "--uninstall" ]; then
  quit_installed
  if [ "${2:-}" = "--erase-data" ]; then
    # Local only: the app erases its own Keychain items and folder, no network.
    if [ -x "$DEST/Contents/MacOS/QuotaCanary" ]; then
      "$DEST/Contents/MacOS/QuotaCanary" --erase-local-data
    else
      echo "The app is not installed, so it cannot erase for you. To do it by hand:"
      echo "  while security delete-generic-password -s com.quotacanary.mac >/dev/null 2>&1; do :; done"
      echo "  rm -rf \"\$HOME/Library/Application Support/QuotaCanary\""
    fi
  fi
  if [ -d "$DEST" ]; then
    "$LSREGISTER" -u "$DEST" 2>/dev/null || true
    rm -rf "$DEST"
    echo "Removed $DEST"
  else
    echo "Nothing installed at $DEST"
  fi
  exit 0
fi

[ -d "$SRC" ] || { echo "No $SRC yet. Run scripts/bundle.sh first."; exit 1; }

quit_installed
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto "$SRC" "$DEST"
"$LSREGISTER" -f "$DEST"

echo "Installed $DEST"
echo "Launch it: open \"$DEST\"  (the bird appears in the menu bar, no Dock icon)"
echo
echo "This is an ad hoc signed development build. A copy you built yourself opens"
echo "normally. A copy that arrived as a download gets the unsigned-app warning:"
echo "  macOS 26+:   try to open it once, then System Settings > Privacy & Security,"
echo "               scroll to Security, click Open Anyway."
