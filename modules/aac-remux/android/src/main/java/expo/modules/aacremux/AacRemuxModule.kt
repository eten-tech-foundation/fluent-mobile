package expo.modules.aacremux

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

/**
 * Repackages a raw ADTS AAC (`.aac`) recording into an MP4/M4A container without
 * re-encoding. ADTS is self-framing (survives process kill; concatenates by
 * byte-append), but players cannot reliably seek a raw ADTS stream. Copying the
 * AAC elementary stream into an MP4 container adds the sample table that makes
 * Review scrubbing seekable — a lossless remux, not a transcode (#233).
 */
class AacRemuxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AacRemux")

    AsyncFunction("remuxAacToM4a") { sourceUri: String, destUri: String ->
      remux(toFilePath(sourceUri), toFilePath(destUri))
      destUri
    }
  }

  private fun toFilePath(uri: String): String =
    if (uri.startsWith("file://")) {
      Uri.parse(uri).path ?: uri.removePrefix("file://")
    } else {
      uri
    }

  private fun remux(srcPath: String, dstPath: String) {
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    var remuxError: Exception? = null
    try {
      extractor.setDataSource(srcPath)

      var audioTrackIndex = -1
      var trackFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val candidate = extractor.getTrackFormat(i)
        val mime = candidate.getString(MediaFormat.KEY_MIME)
        if (mime != null && mime.startsWith("audio/")) {
          audioTrackIndex = i
          trackFormat = candidate
          break
        }
      }

      val format = trackFormat
        ?: throw CodedException("No audio track found in $srcPath")
      extractor.selectTrack(audioTrackIndex)

      // ADTS carries no container timestamps, so synthesize presentation times
      // from AAC frame index × 1024 samples (rational µs), not by accumulating
      // a truncated per-frame duration (avoids drift vs 1024-sample boundaries).
      val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
        format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      } else {
        44100
      }

      muxer = MediaMuxer(dstPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outputTrackIndex = muxer.addTrack(format)
      muxer.start()
      muxerStarted = true

      val maxInputSize = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
        format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE).coerceAtLeast(64 * 1024)
      } else {
        256 * 1024
      }
      val buffer = ByteBuffer.allocate(maxInputSize)
      val bufferInfo = MediaCodec.BufferInfo()
      var frameIndex = 0L
      var lastPtsUs = -1L

      while (true) {
        val sampleSize = extractor.readSampleData(buffer, 0)
        if (sampleSize < 0) {
          break
        }
        var ptsUs = frameIndex * 1024L * 1_000_000L / sampleRate
        if (ptsUs <= lastPtsUs) {
          ptsUs = lastPtsUs + 1
        }
        lastPtsUs = ptsUs
        bufferInfo.offset = 0
        bufferInfo.size = sampleSize
        bufferInfo.presentationTimeUs = ptsUs
        bufferInfo.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
        muxer.writeSampleData(outputTrackIndex, buffer, bufferInfo)
        frameIndex += 1
        extractor.advance()
      }
    } catch (e: CodedException) {
      remuxError = e
    } catch (e: Exception) {
      remuxError = CodedException("Failed to remux AAC to M4A: ${e.message}")
    } finally {
      var cleanupError: Exception? = null
      if (muxerStarted) {
        try {
          muxer?.stop()
        } catch (e: Exception) {
          if (remuxError == null) {
            cleanupError = CodedException(
              "Failed to finalize M4A muxer: ${e.message}",
            )
          }
        }
      }
      try {
        muxer?.release()
      } catch (e: Exception) {
        if (remuxError == null && cleanupError == null) {
          cleanupError = CodedException(
            "Failed to release M4A muxer: ${e.message}",
          )
        }
      }
      try {
        extractor.release()
      } catch (_: Exception) {
      }

      val failure = remuxError ?: cleanupError
      if (failure != null) {
        File(dstPath).delete()
        when (failure) {
          is CodedException -> throw failure
          else -> throw CodedException(failure.message ?: "Remux failed")
        }
      }
    }
  }
}
