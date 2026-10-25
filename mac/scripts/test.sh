#!/bin/sh
# Runs the Swift Testing suite with Command Line Tools only (no Xcode).
# CLT ships Testing.framework outside the default search paths, so point
# the compiler, linker, and runtime at it.
set -eu
cd "$(dirname "$0")/.."
# Under an Xcode toolchain (CI), swift test finds Testing on its own.
case "${DEVELOPER_DIR:-$(xcode-select -p)}" in
  *.app/*) exec swift test "$@" ;;
esac
F=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
L=/Library/Developer/CommandLineTools/Library/Developer/usr/lib
exec swift test \
  -Xswiftc -F -Xswiftc "$F" \
  -Xlinker -F -Xlinker "$F" \
  -Xlinker -rpath -Xlinker "$F" \
  -Xlinker -rpath -Xlinker "$L" \
  "$@"
