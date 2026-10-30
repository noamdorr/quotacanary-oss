import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-356: English UI, numbers in the system locale everywhere.
private let fr = Locale(identifier: "fr_FR")
private let de = Locale(identifier: "de_DE")
private let us = Locale(identifier: "en_US")

struct LocalePolicyTests {
  @Test func warnBelowParsesTheDecimalMarkOfItsLocale() {
    #expect(Thresholds.parse("12,5", locale: fr) == 12.5)
    #expect(Thresholds.parse("12,5", locale: de) == 12.5)
    #expect(Thresholds.parse("1.000", locale: de) == 1000)
    #expect(Thresholds.parse("1 000,5", locale: fr) == 1000.5)
    #expect(Thresholds.parse("1,000", locale: us) == 1000)
    #expect(Thresholds.parse("12.5", locale: us) == 12.5)
  }

  @Test func aForeignDecimalMarkIsRejectedNotTruncated() {
    // A lenient parse reads "12.5" as 12 under fr_FR and "12,5" as 12 under en_US.
    #expect(Thresholds.parse("12.5", locale: fr) == nil)
    #expect(Thresholds.parse("12.5", locale: de) == nil)
    #expect(Thresholds.parse("12,5", locale: us) == nil)
    #expect(Thresholds.parse("12abc", locale: us) == nil)
  }

  @Test func garbageZeroAndNegativesAreNotThresholds() {
    for locale in [fr, de, us] {
      #expect(Thresholds.parse("ten", locale: locale) == nil)
      #expect(Thresholds.parse("", locale: locale) == nil)
      #expect(Thresholds.parse("0", locale: locale) == nil)
      #expect(Thresholds.parse("-5", locale: locale) == nil)
      #expect(Thresholds.parse("nan", locale: locale) == nil)
    }
  }

  @Test func savedThresholdTextRoundTripsThroughItsOwnLocale() {
    for locale in [fr, de, us] {
      for value in [0.0001, 0.33, 12.5, 100, 1500, 1_234_567.89] {
        let text = Thresholds.text(value, locale: locale)
        #expect(Thresholds.parse(text, locale: locale) == value, "\(text) in \(locale.identifier)")
      }
    }
    #expect(Thresholds.text(12.5, locale: fr) == "12,5")
    #expect(Thresholds.text(1500, locale: us) == "1500")
  }

  @Test func currencyAndPlainNumbersShareGroupingUnderOneLocale() {
    let credits = Pool(creditType: "c", label: "C", unit: .credits, cap: nil)
    let usd = Pool(creditType: "u", label: "U", unit: .usd, cap: nil)
    let eur = Pool(creditType: "e", label: "E", unit: .eur, cap: nil)
    #expect(Format.amount(1000, pool: usd, locale: us) == "$1,000.00")
    #expect(Format.amount(1000, pool: credits, locale: us) == "1,000")
    let frUSD = Format.amount(1000.5, pool: usd, locale: de)
    #expect(frUSD.contains("1.000,50"), "\(frUSD)")
    #expect(Format.amount(1000.5, pool: credits, locale: de) == "1.000,5")
    #expect(Format.amount(1000.5, pool: eur, locale: de).contains("€"))
    #expect(Format.balance(-1, unit: .usd, locale: us) == "-$1.00")
  }
}
