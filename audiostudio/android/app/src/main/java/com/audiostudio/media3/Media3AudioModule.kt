package com.audiostudio.media3

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.*
import androidx.media3.common.MediaItem
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

class Media3AudioModule(private val reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext) {
  private val tag = "Media3AudioModule"

  override fun getName() = "Media3Audio"

  // -------- MERGE MULTIPLE FILES --------
  @ReactMethod
  fun merge(recordings: ReadableArray, outputPath: String, promise: Promise) {
    try {
      val mediaItems = mutableListOf<MediaItem>()

      for (i in 0 until recordings.size()) {
        val path = recordings.getString(i)
          ?: throw IllegalArgumentException("Recording path at index $i is null")
        val inputUri = toInputUri(path)
        Log.d(tag, "merge input[$i] path=$path uri=$inputUri")
        mediaItems.add(MediaItem.fromUri(inputUri))
      }

      val editedItems = mediaItems.map { mediaItem ->
        EditedMediaItem.Builder(mediaItem).build()
      }
      val sequence = EditedMediaItemSequence(editedItems)
      val composition = Composition.Builder(sequence).build()

      val transformer = Transformer.Builder(reactContext).build()

      transformer.start(composition, outputPath)

      promise.resolve(outputPath)

    } catch (e: Exception) {
      promise.reject("MERGE_ERROR", e)
    }
  }

  // -------- TRIM / SPLICE --------
  @ReactMethod
  fun trim(inputPath: String, startMs: Double, endMs: Double, outputPath: String, promise: Promise) {
    try {
      val inputUri = toInputUri(inputPath)
      Log.d(tag, "trim inputPath=$inputPath inputUri=$inputUri")
      val item = MediaItem.Builder()
        .setUri(inputUri)
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs(startMs.toLong())
            .setEndPositionMs(endMs.toLong())
            .build()
        )
        .build()

      val transformer = Transformer.Builder(reactContext).build()
      transformer.start(item, outputPath)

      promise.resolve(outputPath)

    } catch (e: Exception) {
      promise.reject("TRIM_ERROR", e)
    }
  }

  // -------- EXPORT / TRANSCODE --------
  @ReactMethod
  fun exportAudio(inputPath: String, outputPath: String, promise: Promise) {
    try {
      val inputUri = toInputUri(inputPath)
      val item = MediaItem.fromUri(inputUri)
      val extension = extensionFromPath(outputPath).ifEmpty { "m4a" }
      val tempOutput = File(reactContext.cacheDir, "media3_export_${System.currentTimeMillis()}.$extension")
      val outputFileName = fileNameFromPath(outputPath, extension)
      val mimeType = mimeTypeForExtension(extension)

      Log.d(tag, "exportAudio inputPath=$inputPath inputUri=$inputUri")
      Log.d(tag, "exportAudio requestedOutputPath=$outputPath extension=$extension mimeType=$mimeType")
      Log.d(tag, "exportAudio tempOutput=${tempOutput.absolutePath}")

      val editedMediaItem = EditedMediaItem.Builder(item).build()
      val composition = Composition.Builder(EditedMediaItemSequence(listOf(editedMediaItem))).build()
      val settled = AtomicBoolean(false)
      val transformer = Transformer.Builder(reactContext).build()
      transformer.addListener(
        object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            if (!settled.compareAndSet(false, true)) return
            try {
              val finalLocation =
                if (isDownloadsPath(outputPath)) {
                  copyFileToDownloads(tempOutput, outputFileName, mimeType)
                } else {
                  copyFileToPath(tempOutput, outputPath)
                }
              Log.d(tag, "exportAudio completed finalLocation=$finalLocation")
              promise.resolve(finalLocation)
            } catch (copyError: Exception) {
              Log.e(tag, "exportAudio copy failed", copyError)
              promise.reject("EXPORT_COPY_ERROR", copyError)
            } finally {
              tempOutput.delete()
            }
          }

          override fun onError(
            composition: Composition,
            exportResult: ExportResult,
            exportException: ExportException,
          ) {
            if (!settled.compareAndSet(false, true)) return
            Log.e(tag, "exportAudio transform failed", exportException)
            tempOutput.delete()
            promise.reject("EXPORT_ERROR", exportException)
          }
        },
      )
      transformer.start(composition, tempOutput.absolutePath)
    } catch (e: Exception) {
      Log.e(tag, "exportAudio start failed", e)
      promise.reject("EXPORT_ERROR", e)
    }
  }

  private fun extensionFromPath(path: String): String {
    val dot = path.lastIndexOf('.')
    return if (dot >= 0 && dot < path.length - 1) path.substring(dot + 1).lowercase() else ""
  }

  private fun fileNameFromPath(path: String, fallbackExt: String): String {
    val slash = path.lastIndexOf('/')
    val fromPath = if (slash >= 0 && slash < path.length - 1) path.substring(slash + 1) else path
    return if (fromPath.isBlank()) "export_${System.currentTimeMillis()}.$fallbackExt" else fromPath
  }

  private fun isDownloadsPath(path: String): Boolean {
    return path.startsWith("/storage/emulated/0/Download/") ||
      path.startsWith("/sdcard/Download/")
  }

  private fun mimeTypeForExtension(extension: String): String {
    return when (extension.lowercase()) {
      "mp3" -> "audio/mpeg"
      "mp4" -> "audio/mp4"
      "m4a" -> "audio/mp4"
      "aac" -> "audio/aac"
      "wav" -> "audio/wav"
      else -> "audio/*"
    }
  }

  private fun copyFileToPath(source: File, targetPath: String): String {
    val target = File(targetPath)
    target.parentFile?.mkdirs()
    FileInputStream(source).use { input ->
      FileOutputStream(target).use { output ->
        input.copyTo(output)
      }
    }
    return target.absolutePath
  }

  private fun copyFileToDownloads(source: File, fileName: String, mimeType: String): String {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = reactContext.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
        put(MediaStore.Downloads.MIME_TYPE, mimeType)
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Failed to create MediaStore download item")
      try {
        resolver.openOutputStream(uri)?.use { output ->
          FileInputStream(source).use { input ->
            input.copyTo(output)
          }
        } ?: throw IllegalStateException("Failed to open output stream for $uri")
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        uri.toString()
      } catch (e: Exception) {
        resolver.delete(uri, null, null)
        throw e
      }
    } else {
      val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      if (!downloads.exists()) downloads.mkdirs()
      val target = File(downloads, fileName)
      FileInputStream(source).use { input ->
        FileOutputStream(target).use { output ->
          input.copyTo(output)
        }
      }
      target.absolutePath
    }
  }

  private fun toInputUri(path: String): Uri {
    return if (path.contains("://")) {
      Uri.parse(path)
    } else {
      Uri.fromFile(File(path))
    }
  }
}
