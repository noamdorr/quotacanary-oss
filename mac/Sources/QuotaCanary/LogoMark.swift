import AppKit
import SwiftUI

/// The approved Q/canary mark (QUO-171), drawn from the brand package's source
/// geometry so it stays crisp at any size and can be a native template image.
/// Never change the numbers here by eye.
enum LogoMark {
  /// Width over height of the source's 100 x 96 view box.
  static let aspect: CGFloat = 100 / 96

  /// The mark in source units (y down): head circle at (46, 48) radius 40,
  /// transparent opening radius 20.4, beak tip at (94, 73).
  /// `nonisolated(unsafe)`: never mutated after this initializer; `path(in:)`
  /// copies it, and NSImage may call that from any thread.
  private nonisolated(unsafe) static let source: NSBezierPath = {
    let path = NSBezierPath()
    path.windingRule = .evenOdd
    let center = NSPoint(x: 46, y: 48)
    let beakTop = NSPoint(x: 83.087, y: 62.984)
    path.move(to: beakTop)
    path.line(to: NSPoint(x: 94, y: 73))
    path.line(to: NSPoint(x: 74.284, y: 76.284))
    // The long way round the head, from the beak's lower edge back to its upper one.
    path.appendArc(
      withCenter: center, radius: 40, startAngle: 45,
      endAngle: atan2(beakTop.y - center.y, beakTop.x - center.x) * 180 / .pi,
      clockwise: false
    )
    path.close()
    path.appendOval(in: NSRect(x: center.x - 20.4, y: center.y - 20.4, width: 40.8, height: 40.8))
    return path
  }()

  /// The mark fitted to `rect` (height-driven) in AppKit's y-up space.
  static func path(in rect: NSRect) -> NSBezierPath {
    let scale = rect.height / 96
    let path = source.copy() as! NSBezierPath
    var transform = AffineTransform(translationByX: rect.minX, byY: rect.maxY)
    transform.scale(x: scale, y: -scale)
    path.transform(using: transform)
    return path
  }

  /// A single-color mark; template by default so AppKit tints it for the menu bar.
  static func image(height: CGFloat, color: NSColor? = nil) -> NSImage {
    let image = NSImage(size: NSSize(width: height * aspect, height: height), flipped: false) { rect in
      (color ?? .black).setFill()
      path(in: rect).fill()
      return true
    }
    image.isTemplate = color == nil
    return image
  }
}

/// The mark as a SwiftUI image, tinted by the surrounding foreground style.
struct LogoMarkImage: View {
  var height: CGFloat

  var body: some View {
    Image(nsImage: LogoMark.image(height: height))
      .renderingMode(.template)
      .accessibilityHidden(true)
  }
}
