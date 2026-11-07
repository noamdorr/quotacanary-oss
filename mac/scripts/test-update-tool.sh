#!/bin/sh
# Exercise the release signer/verifier against the installed client's byte
# limits, using a disposable key and synthetic archives.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
swiftc "$HERE/update-tool.swift" -o "$T/update-tool"
cd "$T"
pub=$(./update-tool keygen key)
url=https://quotacanary.com/mac/QuotaCanary-0.2.0.zip
sign() { ./update-tool sign key "$1" 0.2.0 26.0 "$url" "$2"; }
verify() { ./update-tool verify "$pub" "$1" 0.2.0 "$2"; }
refuse() {
  expected=$1
  shift
  if "$@" > result 2> error; then echo "Expected rejection of $1" >&2; exit 1; fi
  grep -Fq "$expected" error
  [ ! -s result ]
}

printf 'synthetic zip' > archive
sign archive x > feed
verify archive feed
# Each ASCII notes byte adds exactly one byte to this entry. Include the
# signer's trailing newline when constructing the largest accepted feed.
notes=$(python3 -c 'from pathlib import Path; print("x" * (65536 - Path("feed").stat().st_size + 1))')
sign archive "$notes" > feed
[ "$(wc -c < feed)" -eq 65536 ]
verify archive feed
refuse "65536-byte update limit" sign archive "x$notes"
# JSON whitespace leaves both signatures valid.
printf '\n' >> feed
refuse "65536-byte update limit" verify archive feed

python3 -c 'with open("archive", "wb") as f: f.truncate(64 * 1024 * 1024)'
sign archive '' > feed
verify archive feed
printf 'x' >> archive
refuse "67108864-byte update limit" sign archive ''
refuse "67108864-byte update limit" verify archive feed
echo 'PASS: genuine signatures at the feed and archive limits; one extra byte rejected by sign and verify.'
