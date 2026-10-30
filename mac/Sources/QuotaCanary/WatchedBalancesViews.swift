import QuotaCanaryCore
import SwiftUI

/// The connect form, or, right after a connect that read more than one
/// balance, the checklist of which to watch (QUO-283). Panel and stack both
/// show this in place of the bare form.
struct ConnectStep: View {
  var model: AppModel

  var body: some View {
    if let id = model.watchChoiceID, let connection = model.connections.first(where: { $0.id == id }) {
      WatchedBalancesChecklist(model: model, connection: connection)
    } else {
      ConnectForm(model: model)
    }
  }
}

/// One tick per balance, starting from what connect saved: catalog pools
/// ticked, extras unticked. At least one stays ticked.
struct WatchedBalancesChecklist: View {
  var model: AppModel
  let connection: Connection
  @State private var chosen: Set<String>
  @State private var error: String?

  init(model: AppModel, connection: Connection) {
    self.model = model
    self.connection = connection
    _chosen = State(initialValue: Set(connection.poolRows.map(\.key.creditType)))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ConnectionTitle(connection: connection, font: .headline)
      Text(Copy.watchChecklistTitle).font(.subheadline.weight(.semibold))
      WatchedBalanceToggles(rows: connection.allPoolRows, chosen: $chosen)
      Text(Copy.watchChecklistNote)
        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      HStack {
        Spacer()
        Button(Copy.watchChecklistDone) {
          error = model.finishWatchChoice(creditTypes: order(chosen))
        }
        .keyboardShortcut(.defaultAction)
        .disabled(chosen.isEmpty)
      }
      ErrorLine(message: error)
    }
  }

  private func order(_ set: Set<String>) -> [String] {
    connection.allPoolRows.map(\.key.creditType).filter(set.contains)
  }
}

/// The connection inspector's "Show N hidden balances": the same ticks,
/// saved as soon as one changes.
struct WatchedBalancesSection: View {
  var model: AppModel
  let connection: Connection
  @State private var expanded = false
  @State private var error: String?

  var body: some View {
    if WatchedBalances.offersChoice(connection) {
      let hidden = connection.hiddenPoolRows.count
      DisclosureGroup(isExpanded: $expanded) {
        VStack(alignment: .leading, spacing: 6) {
          WatchedBalanceToggles(rows: connection.allPoolRows, chosen: binding)
          ErrorLine(message: error)
        }
        .padding(.top, 4)
      } label: {
        Text(hidden > 0 ? Copy.showHiddenBalances(hidden) : Copy.watchedBalancesHeading)
          .font(.subheadline.weight(.semibold))
      }
    }
  }

  private var binding: Binding<Set<String>> {
    Binding(
      get: { Set(connection.poolRows.map(\.key.creditType)) },
      set: { chosen in
        let ordered = connection.allPoolRows.map(\.key.creditType).filter(chosen.contains)
        error = model.setWatched(id: connection.id, creditTypes: ordered)
      }
    )
  }
}

/// A checkbox per balance with its current amount. The last ticked one
/// cannot be unticked.
struct WatchedBalanceToggles: View {
  let rows: [PoolRow]
  @Binding var chosen: Set<String>

  var body: some View {
    ForEach(rows) { row in
      let creditType = row.key.creditType
      Toggle(isOn: Binding(
        get: { chosen.contains(creditType) },
        set: { on in
          var next = chosen
          if on { next.insert(creditType) } else { next.remove(creditType) }
          chosen = next
        }
      )) {
        HStack {
          Text(row.pool.label)
          Spacer(minLength: 8)
          Text(PoolRowView.amount(row)).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      .toggleStyle(.checkbox)
      .disabled(chosen == [creditType])
    }
  }
}
