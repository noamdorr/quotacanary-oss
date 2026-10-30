import AppKit
import QuotaCanaryCore
import SwiftUI

/// Bundled copies of public/logos, one per provider the app knows (QUO-241;
/// Apify too, for the site hero, QUO-213). A provider without one gets a monogram.
/// Never downloads a logo or embeds a build-machine path.
struct ProviderLogo: View {
  let provider: ProviderID

  /// The providers with a PNG under Resources/ProviderLogos.
  static let bundled: [ProviderID] = ProviderID.allCases

  /// Black-only marks: drawn in the text color so they show in dark mode.
  static let templated: Set<ProviderID> = [
    .apollo, .decodo, .deepgram, ProviderID("elevenlabs"), ProviderID("linkup"), .meltly, .plivo,
    ProviderID("runway"), ProviderID("scrapingdog"), .vonage, ProviderID("x"),
  ]

  /// Dark marks that vanish on a dark background (QUO-288): drawn on a light plate.
  static let plated: Set<ProviderID> = [
    ProviderID("oceanio"), ProviderID("myemailverifier"), ProviderID("tavily"), ProviderID("fishaudio"),
  ]

  static let images: [ProviderID: NSImage] = {
    // The packaged app has these in Contents/Resources. SwiftPM puts a resource
    // bundle beside the executable; resolve it relatively so moved builds work too.
    let packageBundle = Bundle.main.executableURL?.deletingLastPathComponent()
      .appendingPathComponent("QuotaCanary_QuotaCanary.bundle")
    let resourceRoots = [Bundle.main.resourceURL, packageBundle.flatMap { Bundle(url: $0)?.resourceURL }]
      .compactMap { $0 }
    return Dictionary(uniqueKeysWithValues: bundled.compactMap { provider in
      for root in resourceRoots {
        let url = root.appendingPathComponent("ProviderLogos/\(provider.rawValue).png")
        if let image = NSImage(contentsOf: url), image.isValid {
          return (provider, image)
        }
      }
      return nil
    })
  }()

  /// The first letter of the display name, for providers without a bundled logo.
  static func monogram(_ provider: ProviderID) -> String {
    provider.displayName.first.map { String($0).uppercased() } ?? "?"
  }

  var body: some View {
    Group {
      if let image = Self.images[provider] {
        Image(nsImage: image)
          .renderingMode(Self.templated.contains(provider) ? .template : .original)
          .resizable()
          .scaledToFit()
          .padding(Self.plated.contains(provider) ? 2 : 0)
          .background(Self.plated.contains(provider) ? Color.white : .clear, in: RoundedRectangle(cornerRadius: 5))
      } else {
        RoundedRectangle(cornerRadius: 5)
          .fill(Color(nsColor: .quaternaryLabelColor))
          .overlay(Text(Self.monogram(provider)).font(.system(size: 11, weight: .semibold, design: .rounded)))
      }
    }
    .foregroundStyle(.primary)
    .frame(width: 20, height: 20)
    .accessibilityHidden(true)
  }
}
