#!/bin/sh
# Keeps the Mac app's bundled catalog identical to the shared one.
#
# catalog/tools.json at the repo root is read by the web interpreter and by
# the Swift reader (QUO-190). SwiftPM cannot bundle a resource from above the
# target directory and scripts/sync-public.sh copies the working tree with
# cp -R (a symlink would publish a dangling link), so the Mac target carries a
# committed copy at Sources/QuotaCanaryCore/Resources/tools.json.
#
# Usage: scripts/sync-catalog.sh          copy the root file into the target
#        scripts/sync-catalog.sh --check  exit 1 when the two files differ
#
# CatalogTests.bundledCatalogIsByteIdenticalToTheRepoRootFile fails the Swift
# suite on drift as well, so a forgotten sync never reaches the build.
set -eu
cd "$(dirname "$0")/.."
SOURCE=../catalog/tools.json
COPY=Sources/QuotaCanaryCore/Resources/tools.json

if [ "${1:-}" = "--check" ]; then
  if cmp -s "$SOURCE" "$COPY"; then
    echo "Catalog copy in sync with catalog/tools.json"
  else
    echo "mac/$COPY differs from catalog/tools.json; run mac/scripts/sync-catalog.sh" >&2
    exit 1
  fi
else
  cp "$SOURCE" "$COPY"
  echo "Copied catalog/tools.json to mac/$COPY"
fi
