import Charts
import QuotaCanaryCore
import SwiftUI

/// Seven days of one pool at one point per six hours (QUO-186), in the
/// row's status color like the web's Sparkline. Nothing is drawn under two
/// points, so a fresh install shows no empty chart.
struct BalanceSparkline: View {
  let points: [HistoryPoint]
  let status: PoolStatus

  private var tone: Color {
    switch status {
    case .healthy: return .green
    case .low: return Brand.gold
    case .critical, .empty: return .red
    case .unavailable, .unknown: return .secondary
    }
  }

  var body: some View {
    if points.count >= 2 {
      let low = points.map(\.balance).min() ?? 0
      let high = points.map(\.balance).max() ?? 0
      let pad = max((high - low) * 0.1, high == low ? 1 : 0)
      Chart(points, id: \.recordedAt) { point in
        AreaMark(x: .value("Time", point.recordedAt), y: .value("Balance", point.balance))
          .foregroundStyle(tone.opacity(0.15))
        LineMark(x: .value("Time", point.recordedAt), y: .value("Balance", point.balance))
          .foregroundStyle(tone)
          .lineStyle(StrokeStyle(lineWidth: 1.5))
      }
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartYScale(domain: (low - pad)...(high + pad))
      .chartPlotStyle { $0.frame(height: 48).clipped() }
      .frame(height: 48)
      .accessibilityHidden(true)
    }
  }
}
