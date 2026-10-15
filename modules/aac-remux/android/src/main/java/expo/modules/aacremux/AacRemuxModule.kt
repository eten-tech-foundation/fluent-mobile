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

private const val CSD_0 = "csd-0"

private val AAC_SAMPLE_RATES = intArrayOf(
  96000,
  88200,
  64000,
  48000,
  44100,
  32000,
  24000,
  22050,
  16000,
  12000,
  11025,
  8000,
  7350,
)

/**
 * Repackages a raw ADTS AAC (`.aac`) recording into an MP4/M4A container without
 * re-encoding. ADTS is self-framing (survives process kill; concatenates by
 * byte-append), but players cannot reliably seek a raw ADTS stream. Copying the
 * AAC elementary stream into an MP4 container adds the sample table that makes
 * Review scrubbing seekable — a lossless remux, not a transcode (#233).
 *
 * MP4 samples are raw AAC access units. The ADTS header is stripped from each
 * sample and its AudioSpecificConfig is stored on the track as `csd-0`. A
 * sample that still starts with the ADTS sync word has no decoder config in the
 * container index, so decoders that require extradata report a duration and
 * play silence.
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
    var cleanupError: Exception? = null
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

      val maxInputSize = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
        format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE).coerceAtLeast(64 * 1024)
      } else {
        256 * 1024
      }
      val buffer = ByteBuffer.allocate(maxInputSize)
      buffer.clear()
      var sampleSize = extractor.readSampleData(buffer, 0)
      if (sampleSize < 0) {
        throw CodedException("No audio samples in $srcPath")
      }
      val adtsHeaderSize = prepareRawAacFormat(format, buffer, sampleSize)

      // ADTS carries no container timestamps, so synthesize presentation times
      // from AAC frame index × 1024 samples (rational µs), not by accumulating
      // a truncated per-frame duration (avoids drift vs 1024-sample boundaries).
      val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
        format.getInteger(MediaFormat.KEY_SAMPLE_RATE).takeIf { it > 0 } ?: 44100
      } else {
        44100
      }

      muxer = MediaMuxer(dstPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outputTrackIndex = muxer.addTrack(format)
      muxer.start()
      muxerStarted = true

      val bufferInfo = MediaCodec.BufferInfo()
      var frameIndex = 0L
      var lastPtsUs = -1L

      while (sampleSize >= 0) {
        val payload = aacAccessUnit(buffer, sampleSize, adtsHeaderSize)
        var ptsUs = frameIndex * 1024L * 1_000_000L / sampleRate
        if (ptsUs <= lastPtsUs) {
          ptsUs = lastPtsUs + 1
        }
        lastPtsUs = ptsUs
        bufferInfo.offset = 0
        bufferInfo.size = payload.remaining()
        bufferInfo.presentationTimeUs = ptsUs
        bufferInfo.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
        muxer.writeSampleData(outputTrackIndex, payload, bufferInfo)
        frameIndex += 1
        extractor.advance()
        buffer.clear()
        sampleSize = extractor.readSampleData(buffer, 0)
      }
    } catch (e: CodedException) {
      remuxError = e
    } catch (e: Exception) {
      remuxError = CodedException("Failed to remux AAC to M4A: ${e.message}")
    } finally {
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
    }

    // Throwing from `finally` would swallow anything the try block raised that
    // the catches above miss (e.g. an Error), so report the failure afterwards.
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

/**
 * Returns the ADTS header length to strip from every sample. `0` means the
 * extractor already returned raw AAC access units.
 */
private fun prepareRawAacFormat(
  format: MediaFormat,
  firstSample: ByteBuffer,
  sampleSize: Int,
): Int {
  val headerSize = adtsHeaderSize(firstSample, sampleSize)
  if (headerSize > 0) {
    writeAudioSpecificConfig(format, firstSample)
  } else if (!format.containsKey(CSD_0)) {
    writeAudioSpecificConfigFromExtractor(format)
  }
  if (format.containsKey(MediaFormat.KEY_IS_ADTS)) {
    format.setInteger(MediaFormat.KEY_IS_ADTS, 0)
  }
  return headerSize
}

private fun writeAudioSpecificConfig(format: MediaFormat, adts: ByteBuffer) {
  val b2 = u8(adts, 2)
  val b3 = u8(adts, 3)
  val audioObjectType = (b2 shr 6) + 1
  val samplingFrequencyIndex = (b2 shr 2) and 0x0F
  val channelConfiguration = ((b2 and 0x01) shl 2) or (b3 shr 6)
  if (samplingFrequencyIndex !in AAC_SAMPLE_RATES.indices || channelConfiguration !in 1..7) {
    throw CodedException(
      "Unsupported ADTS AAC config: freqIndex=$samplingFrequencyIndex channels=$channelConfiguration",
    )
  }
  format.setByteBuffer(
    CSD_0,
    ByteBuffer.wrap(
      audioSpecificConfig(audioObjectType, samplingFrequencyIndex, channelConfiguration),
    ),
  )
  format.setInteger(MediaFormat.KEY_SAMPLE_RATE, AAC_SAMPLE_RATES[samplingFrequencyIndex])
  format.setInteger(MediaFormat.KEY_CHANNEL_COUNT, channelConfiguration)
  format.setString(MediaFormat.KEY_MIME, MediaFormat.MIMETYPE_AUDIO_AAC)
  format.setInteger(MediaFormat.KEY_IS_ADTS, 0)
}

private fun writeAudioSpecificConfigFromExtractor(format: MediaFormat) {
  if (!format.containsKey(MediaFormat.KEY_SAMPLE_RATE) ||
    !format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
  ) {
    throw CodedException("AAC track is missing codec config")
  }
  val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
  val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
  val samplingFrequencyIndex = AAC_SAMPLE_RATES.indexOf(sampleRate)
  if (samplingFrequencyIndex < 0 || channels !in 1..7) {
    throw CodedException("Unsupported AAC config: rate=$sampleRate channels=$channels")
  }
  // Capture is AAC-LC. This path runs only when the extractor already stripped
  // ADTS and did not supply csd-0.
  format.setByteBuffer(
    CSD_0,
    ByteBuffer.wrap(audioSpecificConfig(2, samplingFrequencyIndex, channels)),
  )
  format.setString(MediaFormat.KEY_MIME, MediaFormat.MIMETYPE_AUDIO_AAC)
  format.setInteger(MediaFormat.KEY_IS_ADTS, 0)
}

private fun audioSpecificConfig(
  audioObjectType: Int,
  samplingFrequencyIndex: Int,
  channelConfiguration: Int,
): ByteArray {
  return byteArrayOf(
    ((audioObjectType shl 3) or (samplingFrequencyIndex shr 1)).toByte(),
    (((samplingFrequencyIndex and 0x01) shl 7) or (channelConfiguration shl 3)).toByte(),
  )
}

/**
 * Header length of one ADTS frame, or 0 when [buffer] is already a raw access
 * unit. The frame-length field must match [sampleSize], so a raw AAC byte that
 * happens to look like a sync word is left alone.
 */
private fun adtsHeaderSize(buffer: ByteBuffer, sampleSize: Int): Int {
  if (sampleSize < 7) {
    return 0
  }
  val b0 = u8(buffer, 0)
  val b1 = u8(buffer, 1)
  if (b0 != 0xFF || (b1 and 0xF0) != 0xF0 || (b1 and 0x06) != 0) {
    return 0
  }
  val headerSize = if ((b1 and 0x01) == 1) 7 else 9
  if (sampleSize <= headerSize || adtsFrameLength(buffer) != sampleSize) {
    return 0
  }
  if ((u8(buffer, 6) and 0x03) != 0) {
    throw CodedException("ADTS frame contains multiple AAC blocks")
  }
  return headerSize
}

private fun adtsFrameLength(buffer: ByteBuffer): Int {
  val b3 = u8(buffer, 3)
  val b4 = u8(buffer, 4)
  val b5 = u8(buffer, 5)
  return ((b3 and 0x03) shl 11) or (b4 shl 3) or (b5 shr 5)
}

private fun aacAccessUnit(
  buffer: ByteBuffer,
  sampleSize: Int,
  headerSize: Int,
): ByteBuffer {
  if (headerSize == 0) {
    buffer.position(0)
    buffer.limit(sampleSize)
    return buffer
  }
  if (sampleSize <= headerSize) {
    throw CodedException("AAC sample is smaller than its ADTS header")
  }
  val payload = ByteArray(sampleSize - headerSize)
  buffer.position(headerSize)
  buffer.get(payload)
  return ByteBuffer.wrap(payload)
}

private fun u8(buffer: ByteBuffer, index: Int): Int = buffer.get(index).toInt() and 0xFF
