import ExpoModulesCore
import AVFoundation
import UIKit

public class RankVideoModule: Module {
  private var session: AVAssetExportSession?

  public func definition() -> ModuleDefinition {
    Name("RankVideo")
    AsyncFunction("cancelExport") { self.session?.cancelExport() }
    OnDestroy { self.session?.cancelExport() }
    AsyncFunction("exportVideo") { (source: String, sticker: String, placement: [String: Double]) async throws -> String in
      guard self.session == nil else { throw self.error("Video export already running") }
      guard let sourceURL = URL(string: source), sourceURL.isFileURL,
            let stickerURL = URL(string: sticker), stickerURL.isFileURL,
            let image = UIImage(contentsOfFile: stickerURL.path)?.cgImage else { throw self.error("Invalid media") }
      let asset = AVURLAsset(url: sourceURL)
      guard let sourceTrack = try await asset.loadTracks(withMediaType: .video).first else { throw self.error("No video track") }
      let duration = try await asset.load(.duration)
      let naturalSize = try await sourceTrack.load(.naturalSize)
      let transform = try await sourceTrack.load(.preferredTransform)
      let oriented = CGRect(origin: .zero, size: naturalSize).applying(transform)
      let scale = min(1, 1920 / max(abs(oriented.width), abs(oriented.height)))
      let size = CGSize(width: max(2, floor(abs(oriented.width) * scale / 2) * 2), height: max(2, floor(abs(oriented.height) * scale / 2) * 2))
      let composition = AVMutableComposition()
      guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw self.error("Cannot create video track") }
      let range = CMTimeRange(start: .zero, duration: duration)
      try track.insertTimeRange(range, of: sourceTrack, at: .zero)
      for sourceAudio in try await asset.loadTracks(withMediaType: .audio) {
        if let audio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
          let audioRange = try await sourceAudio.load(.timeRange)
          try audio.insertTimeRange(CMTimeRangeGetIntersection(range, otherRange: audioRange), of: sourceAudio, at: audioRange.start)
        }
      }
      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
      let normalized = transform.concatenating(CGAffineTransform(translationX: -oriented.minX, y: -oriented.minY)).concatenating(CGAffineTransform(scaleX: size.width / abs(oriented.width), y: size.height / abs(oriented.height)))
      layerInstruction.setTransform(normalized, at: .zero)
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = range
      instruction.layerInstructions = [layerInstruction]
      let videoComposition = AVMutableVideoComposition()
      videoComposition.instructions = [instruction]
      videoComposition.renderSize = size
      let fps = try await sourceTrack.load(.nominalFrameRate)
      videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps > 0 ? min(60, fps.rounded()) : 30))
      let parent = CALayer()
      parent.frame = CGRect(origin: .zero, size: size)
      let video = CALayer()
      video.frame = parent.bounds
      parent.addSublayer(video)
      let overlay = CALayer()
      let x = CGFloat(placement["x"] ?? 0), y = CGFloat(placement["y"] ?? 0)
      let w = CGFloat(placement["width"] ?? 0.3), h = CGFloat(placement["height"] ?? 0.4)
      guard x.isFinite, y.isFinite, w.isFinite, h.isFinite, x >= 0, y >= 0, w > 0, h > 0, x + w <= 1.001, y + h <= 1.001 else { throw self.error("Invalid sticker position") }
      // Core Animation export uses a bottom-left origin; the editor uses top-left.
      overlay.frame = CGRect(x: x * size.width, y: (1 - y - h) * size.height, width: w * size.width, height: h * size.height)
      overlay.contents = image
      overlay.contentsGravity = .resize
      parent.addSublayer(overlay)
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: video, in: parent)
      guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw self.error("Cannot start export") }
      let destination = FileManager.default.temporaryDirectory.appendingPathComponent("gymbodyai-\(UUID().uuidString).mp4")
      exporter.outputURL = destination
      exporter.outputFileType = .mp4
      exporter.shouldOptimizeForNetworkUse = true
      exporter.videoComposition = videoComposition
      self.session = exporter
      defer { self.session = nil }
      do {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
          exporter.exportAsynchronously {
            if exporter.status == .completed { continuation.resume() }
            else { continuation.resume(throwing: exporter.error ?? self.error("Video export cancelled")) }
          }
        }
        return destination.absoluteString
      } catch {
        try? FileManager.default.removeItem(at: destination)
        throw error
      }
    }
  }
  private func error(_ message: String) -> NSError { NSError(domain: "RankVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
