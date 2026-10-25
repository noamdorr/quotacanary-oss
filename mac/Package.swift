// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "QuotaCanary",
  platforms: [.macOS("26.0")],
  products: [
    .executable(name: "QuotaCanary", targets: ["QuotaCanary"]),
  ],
  targets: [
    .target(name: "QuotaCanaryCore", resources: [.copy("Resources/tools.json")]),
    .executableTarget(
      name: "QuotaCanary", dependencies: ["QuotaCanaryCore"],
      resources: [.copy("Resources/ProviderLogos")]
    ),
    .testTarget(name: "QuotaCanaryCoreTests", dependencies: ["QuotaCanaryCore"]),
  ]
)
