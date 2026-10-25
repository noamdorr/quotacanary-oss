# QuotaCanary for Mac

A menu bar app that shows your API credit balances (OpenRouter, Hunter,
Tavily, Apollo, Prospeo and every tool in the shared catalog, about 40 in
all), one row per credit pool, with per-pool Low / Critical thresholds.
Connect several accounts of the same provider and name each one; Manage...
renames a connection, swaps its key (checked with the provider first), or
removes it. No account, no server: each
key lives in your login Keychain and is sent only to its provider. QuotaCanary never receives your provider keys.

Requires macOS 26 or newer. Builds a universal binary (Apple silicon and
Intel) with Command Line Tools alone (no Xcode). MIT licensed, see [LICENSE](LICENSE).

Intel support follows [Apple's macOS Tahoe compatibility list](https://support.apple.com/en-ca/122867):
MacBook Pro 16-inch (2019), MacBook Pro 13-inch (2020, four Thunderbolt 3 ports),
iMac Retina 5K 27-inch (2020), and Mac Pro (2019). Intel hardware validation is
still pending; the Intel build has only been exercised under Rosetta 2.

## Install

There is no download yet. For now you build it yourself, which takes about two
minutes:

```sh
cd mac
./scripts/verify.sh      # build, test, bundle dist/QuotaCanary.app, inspect it
./scripts/install.sh     # copy it to ~/Applications, no sudo
open ~/Applications/QuotaCanary.app
```

The bird appears in the menu bar (no Dock icon). No QuotaCanary account and no
server: paste a provider key and that is the whole setup.
`./scripts/install.sh --uninstall` removes the app; your connections and
Keychain items stay. To leave nothing behind, use Settings > "Erase QuotaCanary
data from this Mac..." first, or `./scripts/install.sh --uninstall --erase-data`
(local only, without a network request).

## Development build vs signed release

What the scripts produce is a development build: signed ad hoc, not with a
Developer ID, and not notarized by Apple. On the Mac that built it, it opens
normally. Copied to another Mac as a download, it gets the unsigned-app
dialog: try to open it once, then use Open Anyway in System Settings > Privacy &
Security.

A Developer ID signed, notarized download that opens without that dialog is a
separate step that has not happened yet. Until it does, nothing published
should be described as a signed release.

## Build, test, bundle, run

```sh
cd mac
swift build                 # debug build
./scripts/test.sh           # Swift Testing suite (wraps the CLT framework flags)
./scripts/bundle.sh         # universal release build -> dist/QuotaCanary.app, ad hoc signed
./scripts/inspect.sh        # architectures, minimum macOS, version, signature, hash
./scripts/verify.sh         # all of the above plus a headless launch
open dist/QuotaCanary.app   # bird appears in the menu bar, no Dock icon
```

`swift run QuotaCanary` also works for quick iteration. The version lives in
[`VERSION`](VERSION). Versioning, architectures and reproducibility are in
[docs/BUILDING.md](docs/BUILDING.md).

## The tool catalog

Most tools are not Swift code: they are entries in `catalog/tools.json` at
the repository root, the same file the web app's adapter interpreter reads
(one request, one auth placement, JSON paths to the balance). The Swift
reader is `QuotaCanaryCore/Catalog.swift` + `CatalogProvider.swift`. Only
OpenRouter, Tavily and Apollo stay hand-written, because their responses do
not fit that shape.

SwiftPM cannot bundle a file from above the package, so the target carries a
committed copy at `Sources/QuotaCanaryCore/Resources/tools.json`. After
editing the root file, run `./scripts/sync-catalog.sh`; `verify.sh` and the
test `CatalogTests.bundledCatalogIsByteIdenticalToTheRepoRootFile` both fail
while the two differ. Adding a tool to the JSON and rebuilding adds it to the
picker with no Swift change. Tools without a bundled logo show a monogram.

## Where things live

- Key: login Keychain, generic password, service `com.quotacanary.mac`,
  account = the connection id, not synchronized to iCloud.
- Connection metadata, last reading, and per-pool settings (Monitor toggle,
  Low, Critical):
  `~/Library/Application Support/QuotaCanary/connections.json` (no key in it).
- Reading history, one point per balance per successful check, kept 30 days
  and pruned on every write. It feeds the burn rate, the "empties in ~3 days"
  estimate and the 7-day sparkline in the window:
  `~/Library/Application Support/QuotaCanary/history.json`. Missing on a fresh
  install, and until a few checks have landed the window says "no burn yet".
- Whether the first-run questions were answered, whether automatic update
  checks are on, and when the last update check succeeded:
  `~/Library/Application Support/QuotaCanary/preferences.json`.
## How fresh the numbers are

While the app is running on an awake, online Mac it checks each connection
about every 15 minutes, plus once at launch, once on wake, once when the
network comes back, and whenever you click Refresh. Nothing is checked while
the Mac sleeps, is offline, is shut down, or the app is not running, and missed
intervals are not replayed afterwards. A fast spender can drain a balance
between two checks. The panel shows per connection whether it is checking,
offline, or failing, with the time of the last good check.

Start at login is offered once after the first connection and lives in
Settings. macOS may refuse it (for example for an unsigned build); the app says
so and keeps working. `.build/debug/QuotaCanary --login-item-status` prints the
current macOS login-item status without changing it.

## Alerts

Alerts work while the app is running and your Mac is awake and online.

After the first connection the panel asks "Turn on alerts?". Enable asks
macOS for notification permission; either answer keeps everything else
working. You get one notification per balance per stage (low, critical,
empty), naming the connection, the balance and what is left. Nothing repeats
until the balance gets worse, and it re-arms once it is back above Low.
Unmonitored and not-in-plan balances never notify. Warnings always show in
the panel and on the menu bar bird (shape and color), notifications or not.
Settings shows the permission status and has "Send test notification"; its
result says whether macOS accepted it, not whether it was shown (Focus and
notification settings can hide it). Notifications need the bundled app:
`dist/QuotaCanary.app/Contents/MacOS/QuotaCanary --notify-test` requests
permission and sends one synthetic notification, printing what macOS said.

## When monitoring stops working

Every failed check shows at once under its connection: why it failed and
when the last good check was. Balances stay at their last good values,
marked as old, never zeroed. Three failed checks in a row send one
notification; a key the provider rejects (or an Apollo key without the
credit usage scope) notifies right away. Neither repeats until a check
succeeds or you replace the key in Manage... Rate limits, outages and odd
responses are named as such, not as a bad key. Checks skipped because the
Mac was asleep or offline never count. The count survives a relaunch.

## Keychain prompt on rebuilt binaries

The app is unsigned (ad hoc). macOS ties Keychain access to the binary that
wrote the item, so after a rebuild macOS may ask to "allow access" the first
time the new binary reads the saved key. Choose Always Allow, or remove the
connection and connect again.

## Developer modes

- `QUOTACANARY_SYNTHETIC=1 swift run QuotaCanary` - in-memory Keychain and
  storage plus scripted providers: OpenRouter returns $20 credits, $7.50 used;
  Hunter returns no searches in plan and 520 of 1,000 verifications used;
  Tavily a nearly spent plan, pay-as-you-go off and a 500-credit key cap;
  Apollo four credit pools (AI credits not in plan) plus 488 of 500 dialer
  minutes; Prospeo 1,840 of 2,000 credits. Any key works. Nothing touches the real Keychain or disk.
- `QUOTACANARY_SYNTHETIC=fail swift run QuotaCanary` - same, but every
  provider answers 401, to see the error path.
- `QUOTACANARY_KEY=... .build/debug/QuotaCanary --read openrouter` - one live
  read, prints one JSON line (`{"ok":true,"balance":12.5,"unit":"usd"}` or
  `{"ok":false,"error":"..."}`), exits 0 or 1. No UI, nothing saved.
- `QuotaCanary --check-updates` / `--install-update` - one update check (or
  check, install and relaunch) from the command line, one line of JSON.
  `QUOTACANARY_UPDATE_FEED=http://127.0.0.1:<port>/updates.json` points it at
  a local test feed; see docs/BUILDING.md.
- `.build/debug/QuotaCanary --keychain-selftest` - adds, reads, updates and
  deletes one throwaway item under service `com.quotacanary.mac.selftest`.
- `.build/debug/QuotaCanary --check-provider-logos` - decodes the five bundled
  provider logos (the other tools use a monogram) without network or
  credentials. Also works with the packaged executable.
- `.build/debug/QuotaCanary --snapshot <dir>` - renders the panel offscreen in
  each state (connect form for each provider, connected, refresh failed,
  mixed pool statuses, edge statuses, settings, settings with validation
  errors, checking, offline, the start-at-login prompt and its refusal),
  light and dark, to PNGs
  each state (connect form for OpenRouter, Hunter and Apollo, connected,
  refresh failed, mixed pool statuses, edge statuses, Tavily plus Prospeo,
  Apollo, settings, Apollo settings, settings with validation errors, two
  named Hunter connections, adding a second Hunter, the manage window, a
  rename validation error, remove confirmation, three failed checks, a
  rejected key, a rate limit, failures with notifications off, an update ready
  in Settings and in the panel, a bad update signature, the update question),
  light and dark, to PNGs
  in `<dir>`. Synthetic data, no permissions needed; the way to eyeball the UI
  from a session without a screen.

## Updates

The app sends each key directly to its vendor and, if you opt in to an update check, sends only the app version, macOS version and chip to quotacanary.com.

Settings has "Check for updates", and after your first connection the panel
asks once whether to check automatically (daily, off unless you say yes).
The check sends only the app version, macOS version and chip type to
quotacanary.com, never anything about your providers, keys or balances. An
update is downloaded and its signature verified first; it installs and
relaunches only when you click Install. Releasing one: [docs/BUILDING.md](docs/BUILDING.md#releasing-an-update).

## Export diagnostics

The "Export diagnostics..." button in the panel saves a small JSON file: app
version, macOS version and CPU architecture, whether automatic update checks
are on and when the last one succeeded, and per connection the provider,
whether a key is stored (just a yes/no, not the key), the last reading's
timestamp and pool balances, how many checks in a row have failed, and the
last error's type (not its message). It
never includes API keys, connection names, Keychain references, request or
response bodies, or any other account identifier, and it never triggers a
provider refresh, a telemetry event, or a support submission. You choose the
destination and decide whether to share the file.

`.build/debug/QuotaCanary --export-diagnostics <path>` writes the same report
for a fixed synthetic connection: no key, no network, no Keychain.
