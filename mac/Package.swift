// swift-tools-version:5.9
import PackageDescription

// Full data-race checking for the shipped code, still in Swift 5 mode so a
// finding is a warning; the build is expected to stay at zero (QUO-355).
let strictConcurrency: [SwiftSetting] = [.enableUpcomingFeature("StrictConcurrency")]

let package = Package(
  name: "QuotaCanary",
  platforms: [.macOS("26.0")],
  products: [
    .executable(name: "QuotaCanary", targets: ["QuotaCanary"]),
  ],
  targets: [
    .target(
      name: "QuotaCanaryCore", resources: [.copy("Resources/tools.json")], swiftSettings: strictConcurrency
    ),
    .executableTarget(
      name: "QuotaCanary", dependencies: ["QuotaCanaryCore"],
      resources: [.copy("Resources/ProviderLogos")], swiftSettings: strictConcurrency
    ),
    .testTarget(name: "QuotaCanaryCoreTests", dependencies: ["QuotaCanaryCore"]),
    .testTarget(name: "QuotaCanaryAppTests", dependencies: ["QuotaCanary", "QuotaCanaryCore"]),
  ]
)
