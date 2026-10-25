import AppKit
import QuotaCanaryCore
import SwiftUI

/// "Last check: HTTP 400 · <what the vendor said>" under a failing balance's
/// error line, with a button that copies the whole redacted record (QUO-279).
/// Draws nothing when there is no record to show.
struct LastCheckNote: View {
  let record: CheckRecord?
  @State private var copied = false

  var body: some View {
    if let record {
      VStack(alignment: .leading, spacing: 4) {
        Text(Copy.lastCheck(record.summary))
          .font(.caption).foregroundStyle(.secondary)
          .lineLimit(4).textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
        Button(copied ? Copy.copiedCheckDetails : Copy.copyCheckDetails) {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(record.clipboardText, forType: .string)
          copied = true
        }
        .buttonStyle(.link).font(.caption)
      }
    }
  }
}
