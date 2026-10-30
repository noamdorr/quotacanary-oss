# Building QuotaCanary for Mac

Everything goes through SwiftPM and the scripts in `mac/scripts/`. Command Line
Tools are enough; Xcode is not required.

| Script | Does |
| --- | --- |
| `test.sh` | Runs the Swift Testing suite with the framework flags CLT needs. |
| `bundle.sh` | Builds each architecture in release mode, merges them with `lipo`, writes `dist/QuotaCanary.app`, signs it ad hoc. |
| `inspect.sh [app]` | Prints architectures, minimum macOS per slice, identity, version, signature, Gatekeeper verdict, binary hash, toolchain. Exits 1 if any of them is off. |
| `verify.sh [--clean]` | Debug build, tests, native window and interaction checks, bundle, inspect, then launches the bundled binary headless. The one command to run before calling a build good. |
| `install.sh [--uninstall]` | Copies the bundle to `~/Applications` and registers it with Launch Services. |
| `update-keys.sh` | Once per project: makes the Ed25519 update signing key pair. |
| `sign-update.sh <zip> <version> [url]` | Prints the signed feed entry for a release archive. |
| `dmg.sh` | Builds, signs, notarizes and staples `dist/QuotaCanary-<version>.dmg` (the app plus an Applications shortcut) from the stapled app. The website's download is this file; the update zip stays the updater's payload. |
| `release.sh [--publish]` | Cuts a release from `VERSION` and the notarized build: zip, disk image, signed feed for the site, and (with `--publish`) both GitHub release assets. |

## Identity and version

- Bundle identifier: `com.quotacanary.mac` (also the Keychain service name).
- `CFBundleShortVersionString` comes from `mac/VERSION`. Change it there only.
- `CFBundleVersion` is `git rev-list --count HEAD` of the checkout you build
  from, so it only goes up along one history. Builds outside a git checkout get
  `0`; set `QUOTACANARY_BUILD_NUMBER` to override. The short commit SHA is in
  the Info.plist key `QuotaCanaryGitCommit`.
- Deployment target: macOS 26 (`Package.swift` platforms, `LSMinimumSystemVersion`,
  and `minos 26.0` in every slice's `LC_BUILD_VERSION`, which `inspect.sh` checks).

## Architectures

`bundle.sh` builds `arm64` and `x86_64` separately and joins them with `lipo`.
SwiftPM's own multi-arch flag (`--arch arm64 --arch x86_64`) hands off to
Xcode's `xcbuild`, which Command Line Tools do not include, so it fails there.
Set `QUOTACANARY_ARCHS=arm64` for a faster single-slice build (`inspect.sh`
reads the same variable).

What has been checked, and what has not: both slices build, link and carry
`minos 26.0`. On Apple silicon, `QUOTACANARY_ROSETTA_SMOKE=1 verify.sh` also
runs the Intel slice under Rosetta 2 (CI sets it; it is off by default locally
because an Intel launch can make macOS show "Support Ending for Intel-based
Apps"). That is translation, not an Intel Mac, so the Intel build has not been
run on Intel hardware yet.

## Reproducibility

Same commit, same toolchain, same `QUOTACANARY_ARCHS`: the same
`Contents/MacOS/QuotaCanary`, byte for byte. Checked with two `verify.sh --clean`
runs and by building each slice from a second checkout path (identical hashes).

What makes that hold:

- The link step passes `-S`, which drops the debug map. That map records each
  object file's modification time, so two clean builds would otherwise differ,
  and it records the absolute build path (your home directory).
- The ad hoc signature has no timestamp and no certificate, so it depends only
  on the binary, the Info.plist and the bundled LICENSE.

What does not hold:

- A different Swift toolchain or SDK produces a different binary. `inspect.sh`
  prints the toolchain; compare hashes only between builds that match.
- The Info.plist carries the commit SHA and commit count, so the signed binary
  changes with every commit even when the code does not. Unsigned slices under
  `.build/<arch>-apple-macosx/release/` do not carry them.
- A Developer ID signature with a secure timestamp, and notarization, are not
  deterministic. Neither is part of these scripts.

## Development build vs signed release

By default `bundle.sh` signs ad hoc (`codesign -s -`): no Apple certificate, no
team, no notarization. `inspect.sh` labels it `DEVELOPMENT (ad hoc)` and
Gatekeeper rejects it, which is expected. A public download needs a Developer ID
Application certificate, a hardened-runtime signature with a secure timestamp,
notarization and stapling. On the release Mac:

```sh
QUOTACANARY_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" ./scripts/bundle.sh
./scripts/notarize.sh      # submit, wait, staple, write dist/QuotaCanary-<version>.zip
./scripts/inspect.sh       # "Developer ID, notarized and stapled."
```

`notarize.sh` uses a notarytool keychain profile (`quotacanary-notary`, or
`QUOTACANARY_NOTARY_PROFILE`), made once per Mac with
`xcrun notarytool store-credentials quotacanary-notary --apple-id <id> --team-id <team>`.
The app-specific password goes into the Keychain at that prompt; the scripts
never read it, and nothing about the identity or the profile is in the repo.

## Releasing an update

The app checks for updates only when the user asks (Settings, "Check for
updates") or opted in to the daily automatic check. Nothing installs until the
user clicks Install. The updater is hand-rolled (no Sparkle): a signed JSON
feed, a signed zip, CryptoKit Ed25519.

### Keys

`scripts/update-keys.sh` generates the pair once. The private key goes to
`~/.config/quotacanary-mac/update-signing.key` (mode 600, outside the repo,
never committed; the mirror denylist also rejects any `mac/**/*.key`). The
script refuses to overwrite it. The public key it prints lives in
`UpdateFeed.publicKeyBase64` (`Sources/QuotaCanaryCore/Updates.swift`).
Losing the private key means installed copies can no longer be updated in
place; back it up somewhere offline. To rotate: ship one last release signed
with the old key that carries the new public key, then switch.

The current key was generated on the dev Mac on 2026-09-25 and has only
signed local test archives and the 0.1.0 release feed (2026-10-29, QUO-350).

### Cutting one

On the release Mac, from a clean checkout of `master`:

```sh
cd mac
echo 0.2.0 > VERSION                  # the only place the version lives
./scripts/verify.sh                   # builds and checks the app
QUOTACANARY_SIGN_IDENTITY="Developer ID Application: ..." ./scripts/bundle.sh
./scripts/release.sh                  # notarize, zip, dmg, sign the feed; publishes nothing
./scripts/release.sh --publish        # uploads zip + dmg as release mac-v0.2.0
```

`release.sh` reuses `dist/QuotaCanary-<version>.zip` and `.dmg` when they exist
(delete one to rebuild it), refuses a zip or image without a notarization ticket, writes the
signed entry to `site/public/mac/updates.json`, and with `--publish` creates
the release `mac-v<version>` on `noamdorr/quotacanary-oss` (not marked Latest,
so the mirror's source release keeps that), then downloads the assets back and
checks the zip's SHA-256 against the feed and the image's against `dist/`. Then ship `site/public/mac/updates.json`
in a pull request to `master`; Railway deploys the site from it.

Publish first, merge the feed second. A feed that reaches quotacanary.com
before its asset exists tells every older install there is an update it then
fails to download.

### Where things are hosted

| URL | Served by |
| --- | --- |
| `https://quotacanary.com/mac/updates.json` | The site (`site/public/mac/updates.json`), `application/json`, `no-cache`. |
| `https://quotacanary.com/mac/QuotaCanary-<version>.zip` | `site/server.mjs`: 302 to the release asset `mac-v<version>` on the public mirror. The feed names this one. |
| `https://quotacanary.com/mac/QuotaCanary-<version>.dmg` | Same, for the disk image. |
| `https://quotacanary.com/download/mac` | `site/server.mjs`: 302 to the `.dmg` of the version the feed names. The website button and launch links use this. |

The zips and images stay out of git (both repos would carry every 14 MB build forever).
Nothing about the app, the feed or the button names a GitHub URL, so moving the
archives elsewhere is a change to `macDownloadLocation` in `site/server.mjs`
and no app release.

A release cut before QUO-364 (0.1.0) has no image: add one with
`./scripts/dmg.sh && gh release upload mac-v0.1.0 dist/QuotaCanary-0.1.0.dmg --repo noamdorr/quotacanary-oss`
before the `/download/mac` redirect reaches production, or the button 404s.

`sign-update.sh` unzips the archive first and refuses to sign unless it holds
`QuotaCanary.app` at the top level with bundle id `com.quotacanary.mac`, the
given version, and a code signature that verifies. `minimumSystemVersion`
comes from the bundle's `LSMinimumSystemVersion`. `QUOTACANARY_UPDATE_NOTES`
sets the optional notes field.

### Feed shape

One JSON object, one release:

```json
{
  "version": "0.2.0",
  "minimumSystemVersion": "26.0",
  "url": "https://quotacanary.com/mac/QuotaCanary-0.2.0.zip",
  "sha256": "<lowercase hex of the zip>",
  "signature": "<base64 Ed25519 over the zip's raw bytes>",
  "feedSignature": "<base64 Ed25519 over quotacanary-mac-update\n<version>\n<minimumSystemVersion>\n<sha256>>",
  "notes": "optional, unsigned, never shown in the app"
}
```

The app trusts an entry only after `feedSignature` verifies, so a tampered
feed cannot point at another or an older archive. It ignores versions not newer
than its own and says "needs macOS X" when `minimumSystemVersion` is above the
running macOS. The zip must match `sha256` and `signature` before the user
sees "Version X is ready". Install then checks the unzipped bundle's id,
version, code seal and architectures, swaps it in with
`FileManager.replaceItemAt` (the old bundle stays next to it as
`.QuotaCanary-previous.app`), relaunches with `open -n`, and quits. Same bundle
id, same Keychain service, same Application Support folder: settings and
connections carry over. An ad hoc signed build may still get the Keychain
"allow access" prompt once after an upgrade (macOS ties the item to the old
binary); a Developer ID build keeps access.

### What the request sends

The feed request is `GET <feed>?app=<version>&os=<macOS version>&arch=<arm64|x86_64>`
with `User-Agent: QuotaCanary/<version>`; the archive request is the entry's
`url` with the same header. URLSession adds constant `Accept` and
`Accept-Encoding`; `Accept-Language` is pinned to `en`. No cookies, no cache,
nothing about providers, connections, keys or balances.

### Hosting requirements

- The feed is served as `application/json` over HTTPS (http is refused except
  to loopback), under 64 KB. The server ignores the query parameters.
- The archive reaches the app unchanged byte for byte. Redirects are fine:
  URLSession follows them, and the archive is checked by SHA-256 and Ed25519,
  not by host.
- Nothing is signed on the server: signing happens on the release Mac.

### Testing against a local feed

`QUOTACANARY_UPDATE_FEED` points the app at another feed. It is meant for
development and is honored in every build (the scripts build dev and release
the same way), but only for `https://` or `http://` to 127.0.0.1/localhost,
and every signature is still checked against the compiled-in key.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 -d <folder with updates.json and the zip>
APP=<a copy of an older QuotaCanary.app, not in ~/Applications>
QUOTACANARY_SYNTHETIC=1 QUOTACANARY_UPDATE_FEED=http://127.0.0.1:8765/updates.json \
  "$APP/Contents/MacOS/QuotaCanary" --check-updates    # one line of JSON
QUOTACANARY_SYNTHETIC=1 QUOTACANARY_UPDATE_FEED=http://127.0.0.1:8765/updates.json \
  "$APP/Contents/MacOS/QuotaCanary" --install-update   # swaps and relaunches
```

`--install-update` does what the Install button does. The relaunched app gets
`QUOTACANARY_SYNTHETIC` and `QUOTACANARY_UPDATE_FEED` forwarded through
`open --env`, so a synthetic test stays synthetic.

## Synthetic design snapshots

```sh
cd mac
swift build
.build/debug/QuotaCanary --snapshot /tmp/quotacanary-snapshots
```

The renderer uses in-memory credentials, connection stores, notification hooks,
and scripted provider responses. It never reads user keys or sends provider
requests. Existing connect, settings, monitoring, and updater scenes remain.
Every scene renders in light and dark appearance without screen recording.

`StackScenarios.swift` in `QuotaCanaryCore` supplies three repeatable design
fixtures with fixed connection IDs, names, balances, and reading timestamps:

- `stack-1`: one healthy OpenRouter connection.
- `stack-8`: all five providers, two Low pools, one Critical pool, one failed
  refresh retaining its last reading, and one unmonitored pool.
- `stack-50`: ten connections per provider, mostly healthy, with five risky
  pools spread across the original connection order.

Every snapshot scene, `--demo`, `--design-preview`, the window checks and
synthetic mode build from the named scenarios in `Scenarios.swift` and
`StackScenarios.swift`. `ScenariosTests` checks under `swift test` what each one
presents (the small-stack risk counts, the large-stack provider coverage and the
rest), so the PNGs check layout only. Save before/after runs to separate
directories to compare changes with the same fixture inputs.

Each stack also has a `-window` scene at 1000x680, including native window
controls, plus `-increased-contrast` variants for both surfaces. Those render only
with System Settings > Accessibility > Display > Increase contrast on, because
`NSAppearance(named:)` returns plain Aqua for the high-contrast names; with the
switch off the run prints NOT RUN for them and writes no contrast images. The
`contrast` argument of `--settings-preview`, `--design-preview` and the host checks
follows the same rule and exits 2. Reduce Transparency must be checked with the real macOS
accessibility setting; its SwiftUI environment value is read-only, and the
renderer never changes global system preferences. Stack scenes inject a fixed
reference date for relative-time copy. `bird-count-0`, `bird-count-1`, and `bird-count-12` exercise the actual
menu-bar label, including its warning count. The 50-connection window also
includes `-hunter` search and `-at-risk` filter scenes.

For native keyboard and window checks with the same 50-account synthetic stack:

```sh
swift run QuotaCanary --design-preview
```

This mode uses in-memory state. Renaming, threshold edits, key replacement attempts,
and removal affect only those fixtures. Quit the preview process when finished.
The full window supports Command-F to focus search and Command-W to close it.

## Native interaction check

`verify.sh` drives the real stack and Settings windows with synthetic stacks of
0, 1 and 50 connections:

```sh
swift build && .build/debug/QuotaCanary --check-interactions 50 [dark|contrast] [--capture-dir DIR]
```

It clicks table rows, moves the selection with the arrow keys, switches the
At risk filter, searches, renames through the inspector (including a refused
duplicate name), opens and dismisses Add connection, and opens, closes and
reopens Settings and the stack, the stack through the menu bar's path for one
connection, whose row must be scrolled into view. It also checks that a Warn below
draft survives selecting another balance, and that closing with unsaved edits asks
Save / Discard / Cancel (Cmd-W on the stack: Cancel, then Discard; Escape in
Settings: Save). Each step prints PASS or FAIL; any FAIL exits 1. The events are
synthesized inside the process, so it needs no Accessibility permission and
works while another app is frontmost, but it does need a logged-in GUI session
(`launchctl managername` prints `Aqua`). Without one, `verify.sh` prints NOT RUN
and skips every native window check.

Everything is in memory: no key is typed, no provider is called, and neither
the Keychain, login items nor notification permission is touched.
`--inject-defect` collapses the stack to an empty host first; `verify.sh`
requires that run to fail, which proves the check catches the defect it
exists for.

`--capture-dir` saves the actual window as `stack-<count>-<look>.png` and fails
unless the image has visible content at the brightness the appearance implies
(`verify.sh` writes them to `.build/window-evidence`). macOS only produces
increased contrast from the real System Settings > Accessibility > Display >
Increase contrast switch; `NSAppearance(named:)` returns plain Aqua for the
high-contrast names. With the switch off, `contrast` prints NOT RUN and exits 2.
The check never changes the switch.

Native sidebar materials can render as blank in AppKit's offscreen bitmap cache
even when the live window and accessibility tree contain the list. Use the
synthetic `--design-preview` window for final sidebar, search, and keyboard
verification; a generated window PNG alone is not proof of those controls.
