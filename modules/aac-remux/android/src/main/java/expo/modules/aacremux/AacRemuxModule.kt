package expo.modules.aacremux

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
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

      // ADTS carries no container timestamps, so synthesize monotonically
      // increasing presentation times from the fixed AAC frame length
      // (1024 samples per frame). MP4 requires increasing timestamps.
      val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
        format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      } else {
        44100
      }
      val frameDurationUs = 1_000_000L * 1024L / sampleRate

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
      var presentationTimeUs = 0L

      while (true) {
        val sampleSize = extractor.readSampleData(buffer, 0)
        if (sampleSize < 0) {
          break
        }
        bufferInfo.offset = 0
        bufferInfo.size = sampleSize
        bufferInfo.presentationTimeUs = presentationTimeUs
        bufferInfo.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
        muxer.writeSampleData(outputTrackIndex, buffer, bufferInfo)
        presentationTimeUs += frameDurationUs
        extractor.advance()
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw CodedException("Failed to remux AAC to M4A: ${e.message}")
    } finally {
      if (muxerStarted) {
        try {
          muxer?.stop()
        } catch (_: Exception) {
        }
      }
      try {
        muxer?.release()
      } catch (_: Exception) {
      }
      extractor.release()
    }
  }
}
