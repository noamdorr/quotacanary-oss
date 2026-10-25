// Every user-facing string lives here so copy can be reviewed and swapped
// in one place. No em dashes: use hyphens or restructure.
public enum Copy {
  public static let appName = "QuotaCanary"
  public static let birdAccessibility = "QuotaCanary"

  // Connect form
  public static let providerPicker = "Provider"
  public static let providerSearchPlaceholder = "Search tools"
  public static let noMatchingTools = "No matching tools"
  public static let clearSearch = "Clear search"
  public static let catalogUnavailable =
    "The tool catalog in this build couldn't be read, so only the built-in tools are listed."
  public static func connectTitle(_ provider: String) -> String { "Connect \(provider)" }
  public static func keyLabel(_ provider: String) -> String { "\(provider) API key" }
  /// What a key must be or allow before the check can work (QUO-278).
  /// Where to find the key is left to the person: those paths went stale.
  /// Keyed by provider id so catalog entries can carry one too.
  public static func keyRequirement(_ provider: String) -> String? { keyRequirements[provider] }
  static let keyRequirements: [String: String] = [
    "apollo": "Create the key with only the api/v1/usage_stats/credit_usage_stats endpoint enabled. No master key needed: it only reads credit usage.",
    "builtwith": "Enable Agent API Billing first, then use the Agent API Key.",
    "crawlbase": "For subscription products only. Enter one product slug: crawling-api, crawler, smartproxy, scraper-api, leads-api, or screenshot-api. Allow five minutes between checks.",
    "deepgram": "Give the key the Admin or Owner role: a Member key can list projects but cannot read billing.",
    "deepl": "Only DeepL API Pro keys work here. Free keys (ending in :fx) are not supported yet.",
    "dropleads": "Use your Prime-DB API key. Keys for other DropLeads products do not work here.",
    "enrichlayer": "Former Proxycurl keys do not work here, since Enrich Layer issues new keys.",
    "fal": "Use the Read Only, Billing or Full preset: the balance needs billing:usage:read.",
    "heygen": "Enterprise wallets billed in credits are not supported yet.",
    "hubspot": "Use a private legacy app's access token. This watches the daily API call limit your private apps share, not HubSpot credits.",
    "instantly": "Create the key with the workspace_billing:read scope (all:read works too).",
    "iproyal": "Only residential traffic shows here. Datacenter, ISP and mobile proxies are not supported yet.",
    "kickbox": "Use a production key (it starts with live_).",
    "scrapedo": "An inactive subscription reads as a rejected key.",
    "sendgrid": "The key needs the user.credits.read permission. EU regional subusers are not supported yet.",
    "similarweb": "The REST API is a paid add-on, so the key needs an API subscription.",
    "telnyx": "Use a v2 API key. Accounts billed in a currency other than US dollars are not supported yet.",
    "twilio": "Use the parent account: subaccounts have no balance of their own. Accounts billed in a currency other than US dollars are not supported yet.",
    "valyu": "Create the key with the billing:read scope. Data keys lack it by default and are rejected here.",
  ]
  public static func keyStorageNote(_ provider: String) -> String {
    "Stored in your Mac's Keychain. Sent only to \(provider)."
  }
  public static let connectButton = "Connect"
  public static let connecting = "Checking key..."
  public static let addConnectionButton = "Add connection"
  public static let cancelButton = "Cancel"

  // Connected view
  public static let refreshButton = "Refresh"
  public static let refreshing = "Checking..."
  public static let removeButton = "Remove connection"
  public static let quitButton = "Quit QuotaCanary"
  public static let accountWideNote = "Account balance. Per-key limits are not tracked."
  public static let hunterAllowanceNote = "Monthly allowances. Hunter resets them each billing month."
  public static let tavilyScopeNote =
    "Plan and pay-as-you-go are account-wide. API key credits are this key's own cap, shown only when it has one."
  public static let apolloAllowanceNote =
    "Separate allowances for this billing cycle. Not added together; dialer is minutes."
  public static let prospeoAccountNote = "Account credits, shared by every key."
  public static let notCheckedYet = "Not checked yet"
  public static let justNow = "just now"
  public static func checked(_ relative: String) -> String { "Checked \(relative)" }

  // Errors
  public static let missingKey = "Paste a key first."
  public static func unreachable(_ provider: String) -> String { "Couldn't reach \(provider)." }
  public static func keyRejected(_ provider: String) -> String { "\(provider) rejected this key." }
  public static func httpStatus(_ provider: String, _ status: Int) -> String {
    "\(provider) returned \(status)."
  }
  public static func unexpectedResponse(_ provider: String) -> String {
    "\(provider) returned an unexpected response."
  }
  /// Apollo's 403 has a known fix, so it keeps its own hint; every other
  /// provider gets the generic line.
  public static func keyLacksScope(_ provider: ProviderID) -> String {
    if provider == .apollo {
      return "This Apollo key can't read credit usage. Enable the credit usage stats endpoint on the key."
    }
    return "This \(provider.displayName) key can't read its balance. Check its permissions."
  }
  public static func reportedError(_ provider: String) -> String {
    "\(provider) returned an error instead of a balance. Try again later."
  }
  public static let credentialWriteFailed = "Couldn't save the key to Keychain. Nothing was saved."
  public static let credentialReadFailed = "Couldn't read the key from Keychain."
  public static let credentialMissing =
    "The saved key is gone from Keychain. Remove this connection and add it again."
  public static let credentialDeleteFailed = "Couldn't remove the key from Keychain."
  public static let saveFailed = "Couldn't save to disk. Nothing changed."
  public static let loadFailed = "Couldn't read saved settings."
  public static let notConnected = "Nothing connected yet."

  // Pool rows and statuses
  public static func ofCap(_ amount: String, _ cap: String) -> String { "\(amount) of \(cap)" }

  // Watched balances (QUO-283)
  public static let watchChecklistTitle = "Which balances should we watch?"
  public static let watchChecklistNote = "Unticked balances stay hidden and never alert. You can change this later."
  public static let watchChecklistDone = "Watch selected"
  public static func showHiddenBalances(_ count: Int) -> String {
    count == 1 ? "Show 1 hidden balance" : "Show \(count) hidden balances"
  }
  public static let watchedBalancesHeading = "Balances to watch"
  public static let notInPlan = "Not in plan"
  public static let noData = "No data"
  public static let notMonitored = "Not monitored"
  public static let statusHealthy = "Healthy"
  public static let statusLow = "Low"
  public static let statusCritical = "Critical"
  public static let statusEmpty = "Empty"
  public static let statusUnavailable = "Not in your plan"
  public static let statusUnknown = "No data"

  // Settings
  public static let settingsButton = "Settings..."
  // Placeholder navigation copy, pending visual/copy sign-off (QUO-158).
  public static let settingsGeneral = "General"
  public static let settingsBalances = "Balance warnings"
  public static let settingsSearch = "Search connections or balances"
  public static let settingsIntro =
    "Set a warning amount for each balance you watch."
  public static let settingsEmpty = "Connect a provider first, then set its thresholds here."
  public static let monitorToggle = "Monitor this balance"
  public static let warnBelowField = "Warn below"
  // Picked by Noam 2026-10-18 (QUO-264).
  public static func criticalHint(_ current: String, afterSave: String?) -> String {
    "Critical at or below \(current)." + (afterSave.map { " Saving sets it to \($0)." } ?? "")
  }
  public static let unitUSD = "USD"
  public static let unitEUR = "EUR"
  public static let unitCredits = "credits"
  public static let unitMinutes = "minutes"
  public static let unitGB = "GB"
  public static func gigabytes(_ amount: String) -> String { "\(amount) GB" }
  public static func minutes(_ amount: String) -> String { "\(amount) min" }
  public static let unavailableHint = "Your plan has no allowance here, so it will not alert."
  public static let unknownHint = "No reading for this balance yet. Settings apply once it reports."
  public static let saveButton = "Save"
  public static let closeButton = "Close"
  public static let saved = "Saved."
  // Unsaved balance edits (QUO-263). Picked by Noam 2026-10-18.
  public static let settingsGeneralNote = "Changes on this tab apply right away."
  public static let settingsBalancesNote = "Nothing on this tab applies until you click Save."
  public static func unsavedChanges(_ count: Int) -> String {
    count > 1 ? "Unsaved changes to \(count) balances" : "Unsaved changes"
  }
  // Hidden validation errors that disable Save (QUO-272). Picked by Noam 2026-10-18.
  public static func balancesNeedAttention(_ count: Int) -> String {
    count == 1 ? "1 balance needs attention" : "\(count) balances need attention"
  }
  public static let balancesNeedAttentionHint = "Jumps to the first Warn below that is not a number."
  public static let unsavedCloseTitle = "Save your balance warning changes?"
  public static func unsavedCloseMessage(_ count: Int) -> String {
    count > 1
      ? "\(count) balances have edits you have not saved. If you don't save, they're gone."
      : "One balance has edits you have not saved. If you don't save, they're gone."
  }
  public static let discardButton = "Don't Save"
  public static let thresholdNotANumber = "Enter a number above zero."

  // Providers and pools
  public static let creditsPoolLabel = "Credits"
  public static let webshareTrafficPoolLabel = "Traffic"
  public static let webshareFreeCreditsPoolLabel = "Free credits"
  public static let webshareNothingToWatch = "Webshare has no capped traffic or credits to watch."
  public static let decodoTrafficPoolLabel = "Residential traffic"
  public static let brevoEmailsPoolLabel = "Email credits"
  public static let brevoSMSPoolLabel = "SMS credits"
  public static let brevoFreeEmailsPoolLabel = "Free daily emails"
  public static let balanceUSDPoolLabel = "Balance (USD)"
  public static let balanceEURPoolLabel = "Balance (EUR)"
  // Credential field labels mirror tools.credential_fields (migration 081).
  public static let twilioAccountSIDLabel = "Account SID"
  public static let plivoAuthIDLabel = "Auth ID"
  public static let authTokenLabel = "Auth token"
  public static let vonageAPIKeyLabel = "API key"
  public static let vonageAPISecretLabel = "API secret"
  // Pool labels mirror tools.pools for the QUO-253 twins.
  public static let accountBalancePoolLabel = "Account Balance"
  public static let tombaSearchesPoolLabel = "Searches"
  public static let tombaVerificationsPoolLabel = "Verifications"
  public static let tombaPhonesPoolLabel = "Phones"
  public static let tombaB2BPoolLabel = "B2B"
  public static let verifaliaCreditPacksPoolLabel = "Credit Packs"
  public static let verifaliaFreeDailyPoolLabel = "Free Daily Credits"
  public static let monthlyCreditsPoolLabel = "Monthly credits"
  // Pool labels mirror the QUO-257 web adapters.
  public static let hyperbolicBalancePoolLabel = "Balance"
  public static let orthogonalBalancePoolLabel = "Credit Balance"
  public static let zeroBounceCreditsPoolLabel = "Credits"
  // Pool labels mirror the QUO-258 web adapters (RocketReach: its humanize()).
  public static let rocketReachStandardLookupPoolLabel = "Standard Lookup"
  public static let rocketReachPremiumLookupPoolLabel = "Premium Lookup"
  public static let rocketReachPhoneLookupPoolLabel = "Phone Lookup"
  public static let rocketReachPersonEnrichPoolLabel = "Person Enrich"
  public static let rocketReachPersonExportPoolLabel = "Person Export"
  public static let rocketReachCompanyExportPoolLabel = "Company Export"
  public static let majesticAnalysisPoolLabel = "Analysis units"
  public static let majesticRetrievalPoolLabel = "Retrieval units"
  public static let majesticIndexItemInfoPoolLabel = "Index item info units"
  public static let mangoolsKeywordLookupsPoolLabel = "Keyword lookups"
  public static let mangoolsSERPLookupsPoolLabel = "SERP lookups"
  public static let mangoolsBacklinkRowsPoolLabel = "Backlink rows"
  public static let semrushUnitsPoolLabel = "API Units"
  // Pool labels mirror the QUO-255 web adapters (Diffbot reuses "Monthly credits").
  public static let ahrefsUnitsPoolLabel = "API Units"
  public static let netNutBandwidthPoolLabel = "Bandwidth"
  // Pool labels mirror the QUO-256 web adapters.
  public static let contactOutEmailPoolLabel = "Email Credits"
  public static let contactOutPhonePoolLabel = "Phone Credits"
  public static let contactOutSearchPoolLabel = "Search Credits"
  public static let meltlySubscriptionPoolLabel = "Subscription Credits"
  public static let meltlyPaygPoolLabel = "Pay-as-you-go Credits"
  public static let deepSeekBalancePoolLabel = "Balance"
  public static let firecrawlCreditsPoolLabel = "Credits"
  public static let apifyUsagePoolLabel = "Monthly Usage Left"
  // Pool label mirrors the QUO-249 web adapter (youcom.ts).
  public static let youComBalancePoolLabel = "Balance"
  // Vendor-error copy, verbatim from the web adapters (contactout.ts, meltly.ts, firecrawl.ts).
  public static let contactOutError = "ContactOut returned an error."
  public static let meltlyError = "Melt.ly returned an error."
  public static let firecrawlRejected = "Firecrawl rejected the credit usage request."
  // Vendor-error copy, verbatim from the web adapters (enrichcrm.ts, majestic.ts).
  public static let enrichCRMCreditsUnreadable = "Enrich CRM couldn't read credits for this key."
  public static let enrichCRMError = "Enrich CRM returned an error."
  public static func majesticReturned(_ code: String) -> String { "Majestic returned \(code)." }
  // Credential field labels mirror tools.credential_fields (supabase/seed.sql).
  public static let apiKeyLabel = "API key"
  public static let apiSecretLabel = "API secret"
  public static let apiLoginLabel = "API login"
  public static let apiPasswordLabel = "API password"
  public static let apiUsernameLabel = "API username"
  public static let snovUserIDLabel = "API User ID"
  public static let snovSecretLabel = "API Secret"
  public static let apiTokenLabel = "API token"
  public static let crawlbaseTokenLabel = "Token"
  public static let crawlbaseProductLabel = "Product slug"
  public static let tavilyPlanPoolLabel = "Plan Credits"
  public static let tavilyPaygoPoolLabel = "Pay-as-you-go Credits"
  public static let tavilyKeyPoolLabel = "API Key Credits"
  public static let apolloDialerPoolLabel = "Dialer Minutes"
  public static let lemlistCreditsPoolLabel = "Credits"
  public static let peopleDataLabsCreditsPoolLabel = "Credits"
  public static let phantomBusterExecutionTimePoolLabel = "Execution time"
  public static let phantomBusterAICreditsPoolLabel = "AI credits"
  public static let phantomBusterEmailsPoolLabel = "Emails"
  /// Apollo's own credit-type key, humanized: "lead_credit" -> "Lead Credits".
  public static func apolloCreditsLabel(_ words: String) -> String { "\(words) Credits" }

  // Diagnostics export
  // Last check details in the inspector (QUO-279)
  public static let lastCheckNoResponse = "no response"
  public static func lastCheck(_ summary: String) -> String { "Last check: \(summary)" }
  public static let copyCheckDetails = "Copy details"
  public static let copiedCheckDetails = "Copied"

  public static let exportDiagnosticsButton = "Export diagnostics..."
  public static func diagnosticsSaved(folder: String) -> String { "Saved to \(folder)." }
  public static let diagnosticsCancelled = "Export cancelled."
  public static let diagnosticsExportFailed = "Couldn't save diagnostics. Nothing was written."

  // Multiple named connections (QUO-129)
  public static let nameField = "Name"
  public static func numberedName(_ provider: String, _ n: Int) -> String { "\(provider) \(n)" }
  public static let nameEmpty = "Give it a name."
  public static func nameTooLong(_ max: Int) -> String { "Keep it to \(max) characters." }
  public static func nameTaken(_ provider: String, _ name: String) -> String {
    "Another \(provider) connection is already called \(name)."
  }
  public static let manageButton = "Manage..."
  public static func manageAccessibility(_ name: String) -> String { "Manage \(name)" }
  public static let renameButton = "Save name"
  public static let nameSaved = "Name saved."
  public static let replaceKeyTitle = "Replace API key"
  public static func replaceKeyPlaceholder(_ provider: String) -> String { "New \(provider) API key" }
  public static func replaceKeyNote(_ provider: String) -> String {
    "Checked with \(provider) first. The current key stays until the new one works. Thresholds are kept."
  }
  public static let updateKeyButton = "Update key"
  public static let keyUpdated = "Key updated. Balances refreshed."
  public static let keyReplacedReadingNotSaved =
    "New key saved to Keychain, but its balances couldn't be saved to disk."
  public static let removeConfirmPrompt = "Remove this connection and delete its key from Keychain?"
  public static let removeConfirmButton = "Remove"
  public static let busyTryAgain = "Still checking. Try again in a moment."
  // Freshness and start at login (QUO-132)
  public static let checkingNow = "Checking..."
  public static func lastGoodCheck(_ relative: String) -> String { "Last good check \(relative)" }
  public static let noGoodCheckYet = "No good check yet"
  public static func offlineLastGoodCheck(_ relative: String) -> String {
    "Offline. Last good check \(relative)"
  }
  public static let offlineNotCheckedYet = "Offline. Not checked yet"
  // Manual Refresh result (QUO-268), shown briefly beside the Refresh control.
  public static func refreshFailed(_ count: Int) -> String {
    count == 1 ? "1 check failed" : "\(count) checks failed"
  }
  public static let refreshOffline = "Offline. Nothing checked"
  public static let startAtLoginToggle = "Start QuotaCanary at login"
  public static let startAtLoginPromptTitle = "Start at login?"
  public static let startAtLoginPromptBody =
    "Checks only run while QuotaCanary is open on an awake, online Mac."
  public static let startAtLoginEnable = "Enable"
  public static let startAtLoginNotNow = "Not now"
  public static let startAtLoginFailed = "macOS would not enable start at login."
  public static let startAtLoginDisableFailed = "macOS would not turn off start at login."
  public static let startAtLoginNeedsApproval =
    "Waiting for your OK in System Settings, General, Login Items."
  public static let monitoringLimits =
    "QuotaCanary checks about every 15 minutes, but only while it is running on an awake, online Mac. Nothing is checked while the Mac sleeps, is offline, or is shut down, and a fast spender can drain a balance between two checks."

  // Notifications (QUO-131)
  /// "Hunter" or "Hunter · Client work". A middle dot, never an em dash.
  public static func alertTitle(provider: String, name: String) -> String { "\(provider) · \(name)" }
  public static let severityLow = "low"
  public static let severityCritical = "critical"
  /// "Verifications low: 480 of 1,000 left", "Credits critical: $4.20 left".
  public static func alertBody(_ pool: String, _ severity: String, _ amount: String) -> String {
    "\(pool) \(severity): \(amount) left"
  }
  /// "Searches empty".
  public static func alertBodyEmpty(_ pool: String) -> String { "\(pool) empty" }
  public static let birdLowAccessibility = "QuotaCanary, a balance is low"
  public static let birdCriticalAccessibility = "QuotaCanary, a balance is critical"
  public static let birdEmptyAccessibility = "QuotaCanary, a balance is empty"
  public static let alertsPromptTitle = "Turn on alerts?"
  public static let alertsPromptBody =
    "A macOS notification when a balance goes low, critical or empty. Warnings show here either way."
  public static let alertsEnable = "Enable"
  public static let alertsNotNow = "Not now"
  public static let alertsPromptFailed = "macOS didn't ask. Try again from Settings."
  public static let alertsSection = "Alerts"
  public static let alertsAllowed = "macOS notifications: allowed."
  public static let alertsDenied =
    "macOS notifications: off. Turn them on in System Settings > Notifications > QuotaCanary."
  public static let alertsNotAsked = "macOS notifications: not asked yet."
  public static let alertsUnavailable =
    "macOS notifications aren't available to this copy of the app. Run the bundled QuotaCanary.app."
  public static let alertsTurnOn = "Turn on alerts"
  public static let alertsOpenSettings = "Open Notification Settings"
  public static let alertsSendTest = "Send test notification"
  public static let alertsPanelNote =
    "Warnings always show in the panel and on the menu bar bird, notifications or not."
  public static let testNotificationTitle = "QuotaCanary"
  public static let testNotificationBody =
    "Test alert. Real ones name the connection, the balance and what's left."
  public static let testHandedToMacOS =
    "Handed to macOS. Focus or notification settings can still keep it off screen."
  public static let testDenied = "Notifications are off for QuotaCanary, so nothing was sent."
  public static let testNotAsked = "No permission yet, so nothing was sent."
  public static let testFailed = "macOS didn't accept the test notification."
  public static let undeliveredDenied = "macOS notifications are off, so warnings only show here."
  public static let undeliveredNotAsked = "Alerts aren't on yet, so warnings only show here."
  public static let undeliveredUnavailable = "macOS notifications aren't available, so warnings only show here."
  public static let undeliveredFailed = "macOS didn't accept the last alert. It retries on the next check."

  // Monitoring health (QUO-133)
  public static func rateLimited(_ provider: String) -> String {
    "\(provider) is rate limiting this key. Try again in a minute."
  }
  /// Panel line under a connection whose check failed: what happened, what to do.
  public static func checkKeyRejected(_ provider: String) -> String {
    "\(provider) rejected the saved key. Replace it in Manage..."
  }
  public static func checkKeyLacksScope(_ provider: ProviderID) -> String {
    if provider == .apollo {
      return "This Apollo key can't read credit usage. Enable the credit usage stats endpoint on it, or replace it in Manage..."
    }
    return "This \(provider.displayName) key can't read its balance. Check its permissions or replace it in Manage..."
  }
  public static func checkRateLimited(_ provider: String) -> String {
    "\(provider) is rate limiting this key. Retrying on the next check."
  }
  public static func checkUnreachable(_ provider: String) -> String {
    "Couldn't reach \(provider). Retrying on the next check."
  }
  public static func checkHTTPStatus(_ provider: String, _ status: Int) -> String {
    "\(provider) had a problem (HTTP \(status)). Retrying on the next check."
  }
  public static func checkReportedError(_ provider: String) -> String {
    "\(provider) returned an error instead of a balance. Retrying on the next check."
  }
  public static func checkUnexpected(_ provider: String) -> String {
    "\(provider) sent something that isn't a balance. Retrying on the next check."
  }
  /// Panel note once a connection reaches the failure threshold.
  public static func failuresInARow(_ count: Int) -> String {
    "\(count) checks in a row failed. The balances above are from the last good check."
  }
  /// Notification bodies. Title is the connection, as for credit alerts.
  public static func monitorFailuresBody(_ count: Int, _ reason: String) -> String {
    "\(count) checks in a row failed: \(reason). Balances shown are from the last good check."
  }
  public static func monitorKeyRejectedBody(_ provider: String) -> String {
    "\(provider) rejected the saved key, so balances aren't being checked. Replace it in Manage..."
  }
  public static func monitorScopeBody(_ provider: ProviderID) -> String {
    if provider == .apollo {
      return "This Apollo key can't read credit usage, so balances aren't being checked. Fix its scope or replace it in Manage..."
    }
    return "This \(provider.displayName) key can't read its balance, so balances aren't being checked. Check its permissions or replace it in Manage..."
  }
  public static func reasonKeyRejected(_ provider: String) -> String { "\(provider) rejected the saved key" }
  public static func reasonKeyLacksScope(_ provider: ProviderID) -> String {
    provider == .apollo ? "the key can't read credit usage" : "the key can't read its balance"
  }
  public static func reasonRateLimited(_ provider: String) -> String { "\(provider) is rate limiting this key" }
  public static func reasonUnreachable(_ provider: String) -> String { "couldn't reach \(provider)" }
  public static func reasonProviderError(_ provider: String) -> String { "\(provider) returned an error" }
  public static func reasonUnexpected(_ provider: String) -> String { "\(provider) sent something that isn't a balance" }

  // Updates (QUO-139)
  public static let updatesSection = "Updates"
  public static let updatesAutomaticToggle = "Check for updates automatically"
  public static let updatesPrivacyNote =
    "Once a day, QuotaCanary asks \(UpdateFeed.url.host!) for a newer version. It sends the app version, macOS version and chip type, nothing else. Nothing installs until you say so."
  public static let updatesCheckButton = "Check for updates"
  public static func updatesInstalledVersion(_ version: String) -> String { "You have version \(version)." }
  public static let updatesNotChecked = "Not checked yet."
  public static func updatesLastChecked(_ when: String) -> String { "Last checked \(when)." }
  public static let updatesChecking = "Checking for updates..."
  public static func updatesDownloading(_ version: String) -> String { "Downloading version \(version)..." }
  public static func updatesUpToDate(_ when: String) -> String { "Up to date as of \(when)." }
  public static func updatesNeedsNewerMacOS(_ version: String, _ minimum: String) -> String {
    "Version \(version) needs macOS \(minimum) or later. Nothing to install on this Mac."
  }
  public static func updatesReady(_ version: String) -> String { "Version \(version) is ready. Install and relaunch?" }
  public static func updatesReadyLater(_ version: String) -> String { "Version \(version) is downloaded and checked." }
  public static func updatesInstalling(_ version: String) -> String { "Installing version \(version)..." }
  public static let updatesInstallButton = "Install"
  public static let updatesInstallRelaunchButton = "Install and relaunch"
  public static let updatesLaterButton = "Later"
  /// The one panel line, only once an update is downloaded and verified.
  public static func updatesPanelReady(_ version: String) -> String {
    "QuotaCanary \(version) is ready. Install in Settings."
  }
  public static let updatesPromptTitle = "Check for updates automatically?"
  public static let updatesPromptBody =
    "Once a day, sending only the app version, macOS version and chip type. Nothing installs without you."
  public static let updatesEnable = "Enable"
  public static let updatesNotNow = "Not now"
  public static let updateUnreachable = "Couldn't reach the update server. Nothing changed."
  public static let updateFeedUnreadable = "The update feed didn't make sense. Nothing was downloaded."
  public static let updateBadSignature = "That update isn't signed by QuotaCanary, so it was thrown away."
  public static let updateChecksumMismatch =
    "The download didn't match the signed release, so it was thrown away."
  public static let updateDownloadFailed = "The download failed. Nothing was installed."
  public static let updateNotInBundle =
    "This copy isn't running as QuotaCanary.app, so it can't update itself."
  public static let updateReadOnlyLocation =
    "QuotaCanary can't replace itself where it is. Move it to your Applications folder and try again."
  public static let updateBundleMismatch =
    "The download isn't an intact QuotaCanary build of that version, so nothing was installed."
  public static let updateUnsupportedArchitecture =
    "That version doesn't run on this Mac's chip, so nothing was installed."
  public static let updateInstallFailed = "Couldn't replace the app. This version keeps running as it was."
  public static let updateRelaunchFailed =
    "Installed, but macOS didn't reopen it. Quit QuotaCanary and open it again."
}


public extension Copy {
  static let attentionSection = "Needs attention"
  static let connectionsSection = "Connections"
  static let openWindowButton = "Open window"
  static func moreConnections(_ count: Int) -> String { "\(count) more in your stack" }
  static func moreConnectionsAccessibility(_ count: Int) -> String {
    "Open the full window: \(count) more \(count == 1 ? "connection" : "connections") in your stack"
  }
  static func menuBarCount(_ count: Int) -> String { "\(count)" }
  static func menuBarCountAccessibility(_ count: Int, severity: AlertSeverity) -> String {
    let worst: String
    switch severity {
    case .none: return birdAccessibility
    case .low: worst = statusLow
    case .critical: worst = statusCritical
    case .empty: worst = statusEmpty
    }
    return "QuotaCanary, \(count) \(count == 1 ? "balance" : "balances") running low, worst: \(worst)"
  }
}

// Full-window wording staged for the design review.
extension Copy {
  public static let balanceColumn = "Balance"
  public static let remainingColumn = "Remaining"
  public static let checkedColumn = "Checked"
  public static let connectionColumn = "Connection"
  public static let selectBalance = "Select a balance"
  public static let noMatchingBalances = "No matching balances"
  public static func failingChecked(_ relative: String) -> String { "Failing, \(relative)" }

  public static let stackTitle = "Your stack"
  public static let stackSearch = "Search connections and balances"
  // The inspector toggle (QUO-269).
  public static let stackShowDetails = "Show details"
  public static let stackHideDetails = "Hide details"
  public static let stackFilter = "Show connections"
  public static let stackAll = "All"
  public static let stackAtRisk = "At risk"
  public static let stackFailing = "Failing"
  public static let stackNoMatchesNote = "Try another search or filter."
  public static let stackEmptyNote = "Add a connection from the menu bar bird to start watching its balances."
  public static let stackThresholds = "Balance warnings"
}

// Quiet-menu wording is staged for visual/copy review.
public extension Copy {
  static let healthySection = "Healthy"
  static let allHealthySection = "All healthy"
  // Neutral headings when a balance is unread or low with monitoring off
  // (QUO-160); approved by Noam 2026-10-10.
  static let otherConnectionsSection = "Other connections"
  static let addConnectionMenu = "Add connection..."
  static func additionalBalances(_ count: Int) -> String { "\(count) more balances" }
}

public extension Copy {
  static func lastGoodShort(_ when: String) -> String { "Last good \(when)" }
  /// Beside a connection name while its checks fail (QUO-262).
  static func checkFailedCue(_ lastGood: String?) -> String {
    lastGood.map { "Check failed · last good \($0)" } ?? "Check failed · no good check yet"
  }
  // The short failure word on a failing connection's panel line; the rule is
  // `BalancesAsShown.compactFailure` (QUO-309).
  static let compactKeyRejected = "Key rejected"
  static let compactKeyPermissions = "Key permissions"
  static let compactRateLimited = "Rate limited"
  static let compactUnreachable = "Unreachable"
  static func compactHTTPStatus(_ code: Int) -> String { "HTTP \(code)" }
  static let compactInvalidResponse = "Invalid response"
  static let compactProviderError = "Provider error"
  static let compactKeyUnavailable = "Key unavailable"
  static let compactSaveFailed = "Save failed"
  static let compactCheckFailed = "Check failed"
}

// Burn rate and ETA (QUO-186). Bands and wording match src/lib/burn-eta.ts,
// except the 1.5 to 7 day band, which is relative per QUO-184 (its final
// pick is pending; the default proposed there is used until then).
public extension Copy {
  static let etaNoBurnShort = "no burn yet"
  static let etaNoBurnLong = "Not draining yet."
  // QUO-271: estimates from local reading history.
  static let etaCollectingShort = "collecting history"
  static let etaCollectingLong = "Collecting history."
  static let etaNoConsumptionShort = "not draining"
  static let etaNoConsumptionLong = "Not draining."
  /// The compact history range under the inspector sparkline.
  static func historyRange(days: Double) -> String {
    if days < 1 {
      let hours = max(1, Int((days * 24).rounded()))
      return "Last \(hours) hour\(hours == 1 ? "" : "s")"
    }
    let d = Int(days.rounded())
    return "Last \(d) day\(d == 1 ? "" : "s")"
  }
  static let etaGoneShort = "already gone"
  static let etaGoneLong = "Already empty."
  static func etaHoursShort(_ hours: Int) -> String { "~\(hours)h" }
  static func etaHoursLong(_ hours: Int) -> String { "Empties in ~\(hours) hour\(hours == 1 ? "" : "s")." }
  static let etaTomorrowShort = "burns out tomorrow"
  static let etaTomorrowLong = "Empties tomorrow."
  static func etaDaysShort(_ days: Int) -> String { "in ~\(days) day\(days == 1 ? "" : "s")" }
  static func etaDaysLong(_ days: Int) -> String { "Empties in ~\(days) day\(days == 1 ? "" : "s")." }
  static func etaWeeksShort(_ weeks: Int) -> String { "~\(weeks) week\(weeks == 1 ? "" : "s")" }
  static func etaMonthsShort(_ months: Int) -> String { "~\(months) month\(months == 1 ? "" : "s")" }
  static func etaMonthsLong(_ months: Int) -> String { "Empties in ~\(months) month\(months == 1 ? "" : "s")." }
  static let etaNextYearShort = "~next year"
  static let etaNextYearLong = "Plenty of runway."
  /// The web drawer's line under the ETA: "Burning ~200/day".
  static func burningPerDay(_ amount: String) -> String { "Burning ~\(amount)/day" }
}

// Erase everything from this Mac (QUO-297). Staged for Noam's pick; the first
// wording is wired. The confirm lists what goes and what stays.
public extension Copy {
  static let eraseSection = "Leave no trace"
  // Alternatives for the section title: "Erase data" / "Uninstall cleanly"
  static let eraseIntro =
    "Removes everything QuotaCanary keeps on this Mac. Do this before you delete the app, or the keys stay in Keychain."
  // Alternative: "Deleting the app leaves its keys in Keychain. This clears them first."
  static let eraseButton = "Erase QuotaCanary data from this Mac..."
  // Alternatives: "Erase all data on this Mac..." / "Remove all keys and settings from this Mac..."
  static func eraseGoes(_ summary: EraseSummary) -> String {
    var parts = [summary.keys == 1 ? "1 provider key" : "\(summary.keys) provider keys"]
    parts += ["your reading history", "your settings"]
    return "This deletes " + parts.dropLast().joined(separator: ", ") + " and " + parts[parts.count - 1]
      + " from this Mac, then QuotaCanary starts over like a first launch."
  }
  // Alternative: "Gone from this Mac: ..., then the app is back to first run."
  static let eraseStays =
    "Nothing is sent anywhere."
  static let eraseConfirmButton = "Erase everything"
  // Alternative: "Erase and start over"
  static let eraseFailed = "Couldn't erase everything. Some data is still on this Mac. Try again, or see the README."
  // Alternative: "Erase didn't finish. Nothing was reported as gone that isn't. Try again."
  static func eraseReport(_ summary: EraseSummary) -> String {
    let keys = summary.keys == 1 ? "1 provider key" : "\(summary.keys) provider keys"
    return "Erased \(keys), history and settings from this Mac."
  }
}

public extension Copy {
  static let topUpButton = "Top up"
}
