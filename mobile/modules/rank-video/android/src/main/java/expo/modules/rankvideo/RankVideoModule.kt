package expo.modules.rankvideo

import android.content.ContentValues
import android.provider.MediaStore
import android.os.Build
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.Size
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.TextureOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableList
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class RankVideoModule : Module() {
  private var transformer: Transformer? = null
  private var pending: Promise? = null
  private var output: File? = null

  override fun definition() = ModuleDefinition {
    Name("RankVideo")
    AsyncFunction("saveMedia") { source: String ->
      require(Build.VERSION.SDK_INT >= 29)
      val context = appContext.reactContext ?: throw IllegalStateException("No application context")
      val sourceUri = Uri.parse(source)
      require(sourceUri.scheme == "file")
      val file = File(requireNotNull(sourceUri.path))
      val isVideo = file.extension.lowercase() == "mp4"
      val collection = if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
        put(MediaStore.MediaColumns.MIME_TYPE, if (isVideo) "video/mp4" else "image/jpeg")
        put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) "Movies/GymBodyAI" else "Pictures/GymBodyAI")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val resolver = context.contentResolver
      val destination = resolver.insert(collection, values) ?: throw IllegalStateException("Cannot save media")
      try {
        resolver.openOutputStream(destination).use { output ->
          requireNotNull(output)
          file.inputStream().use { it.copyTo(output) }
        }
        values.clear(); values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(destination, values, null, null)
      } catch (error: Exception) { resolver.delete(destination, null, null); throw error }
    }
    AsyncFunction("cancelExport") { cancel() }.runOnQueue(Queues.MAIN)
    OnDestroy { Handler(Looper.getMainLooper()).post { cancel() } }
    AsyncFunction("exportVideo") { source: String, sticker: String, placement: Map<String, Double>, promise: Promise ->
      if (transformer != null) { promise.reject("BUSY", "Video export already running", null); return@AsyncFunction }
      try {
        val context = appContext.reactContext ?: throw IllegalStateException("No application context")
        val uri = Uri.parse(source)
        require(uri.scheme == "file" || uri.scheme == "content")
        val stickerUri = Uri.parse(sticker)
        require(stickerUri.scheme == "file")
        val bitmap = BitmapFactory.decodeFile(stickerUri.path) ?: throw IllegalArgumentException("Invalid sticker")
        val x = (placement["x"] ?: 0.0).toFloat()
        val y = (placement["y"] ?: 0.0).toFloat()
        val w = (placement["width"] ?: 0.3).toFloat()
        val h = (placement["height"] ?: 0.4).toFloat()
        require(listOf(x,y,w,h).all { it.isFinite() } && x >= 0 && y >= 0 && w > 0 && h > 0 && x+w <= 1.001f && y+h <= 1.001f)
        val overlay = object : BitmapOverlay() {
          private var frame: Bitmap? = null
          override fun configure(videoSize: Size) {
            super.configure(videoSize)
            frame?.recycle()
            frame = Bitmap.createBitmap(videoSize.width, videoSize.height, Bitmap.Config.ARGB_8888).also {
              Canvas(it).drawBitmap(bitmap, null, RectF(x*videoSize.width, y*videoSize.height, (x+w)*videoSize.width, (y+h)*videoSize.height), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
            }
          }
          override fun getBitmap(presentationTimeUs: Long): Bitmap = requireNotNull(frame)
        }
        val item = EditedMediaItem.Builder(MediaItem.fromUri(uri))
          .setEffects(Effects(emptyList(), listOf(OverlayEffect(ImmutableList.of<TextureOverlay>(overlay)))))
          .build()
        val destination = File(context.cacheDir, "gymbodyai-${UUID.randomUUID()}.mp4")
        output = destination
        pending = promise
        transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setAudioMimeType(MimeTypes.AUDIO_AAC)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              pending?.resolve(Uri.fromFile(destination).toString())
              pending = null; transformer = null; output = null
            }
            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
              destination.delete()
              pending?.reject("EXPORT_FAILED", exportException.message, exportException)
              pending = null; transformer = null; output = null
            }
          }).build()
        transformer!!.start(item, destination.absolutePath)
      } catch (error: Exception) {
        transformer?.cancel(); transformer = null
        output?.delete(); output = null; pending = null
        promise.reject("EXPORT_FAILED", error.message, error)
      }
    }.runOnQueue(Queues.MAIN)
  }
  private fun cancel() {
    transformer?.cancel(); transformer = null
    output?.delete(); output = null
    pending?.reject("CANCELLED", "Video export cancelled", null); pending = null
  }
}
