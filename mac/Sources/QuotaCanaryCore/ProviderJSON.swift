import Foundation

enum ProviderJSON {
  /// Same intent as the web's finiteOrNull: a number or numeric string that is
  /// finite, else nil. Booleans are rejected rather than read as 0 or 1.
  static func finiteOrNil(_ value: Any?) -> Double? {
    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
      let d = number.doubleValue
      return d.isFinite ? d : nil
    }
    if let string = value as? String, let d = Double(string.trimmingCharacters(in: .whitespaces)) {
      return d.isFinite ? d : nil
    }
    return nil
  }
}
