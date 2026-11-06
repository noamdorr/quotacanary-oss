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
      // QUO-444: from zero, so a 0.1% dip is drawn as small as it is.
      let low = min(points.map(\.balance).min() ?? 0, 0)
      let high = max(points.map(\.balance).max() ?? 0, 1)
      Chart(points, id: \.recordedAt) { point in
        AreaMark(x: .value("Time", point.recordedAt), y: .value("Balance", point.balance))
          .foregroundStyle(tone.opacity(0.15))
        LineMark(x: .value("Time", point.recordedAt), y: .value("Balance", point.balance))
          .foregroundStyle(tone)
          .lineStyle(StrokeStyle(lineWidth: 1.5))
      }
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartYScale(domain: low...(high * 1.05))
      .chartPlotStyle { $0.frame(height: 48).clipped() }
      .frame(height: 48)
      .accessibilityHidden(true)
    }
  }
}
