package expo.modules.filesha256

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val READ_BYTES = 1024 * 1024

private class HashAbortedException : CodedException("ERR_HASH_ABORTED", "File validation aborted", null)

private class FileMissingException : CodedException("ERR_FILE_MISSING", "Audio file is missing", null)

private class FileChangedException :
  CodedException("ERR_FILE_CHANGED", "Audio file changed or was truncated during validation", null)

/**
 * SHA-256 of exactly `size` bytes of a local file, streamed through one
 * bounded buffer on the IO dispatcher, so a long hash does not hold the
 * shared Expo async queue (SecureStore, file reads). A file shorter or longer
 * than `size` is an error, matching the JS fallback in `src/services/fileSha256.ts`.
 */
class FileSha256Module : Module() {
  /** Cancel flags of running jobs only; a late cancel finds nothing and leaks nothing. */
  private val jobs = ConcurrentHashMap<String, AtomicBoolean>()

  override fun definition() = ModuleDefinition {
    Name("FileSha256")

    AsyncFunction("sha256File") Coroutine { uri: String, size: Double, jobId: String ->
      val cancelled = AtomicBoolean(false)
      jobs[jobId] = cancelled
      try {
        withContext(Dispatchers.IO) { hash(toFilePath(uri), size.toLong(), cancelled) }
      } finally {
        jobs.remove(jobId, cancelled)
      }
    }

    Function("cancel") { jobId: String ->
      jobs[jobId]?.set(true)
    }
  }

  private fun toFilePath(uri: String): String =
    if (uri.startsWith("file://")) {
      Uri.parse(uri).path ?: uri.removePrefix("file://")
    } else {
      uri
    }

  private fun hash(path: String, size: Long, cancelled: AtomicBoolean): String {
    if (size < 0) {
      throw CodedException("ERR_HASH_SIZE", "Cannot determine audio file size", null)
    }
    val file = File(path)
    if (!file.isFile) {
      throw FileMissingException()
    }
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(READ_BYTES)
    try {
      FileInputStream(file).use { input ->
        var remaining = size
        while (remaining > 0) {
          if (cancelled.get()) {
            throw HashAbortedException()
          }
          val read = input.read(buffer, 0, minOf(remaining, READ_BYTES.toLong()).toInt())
          if (read < 0) {
            throw FileChangedException()
          }
          digest.update(buffer, 0, read)
          remaining -= read
        }
        if (input.read() != -1) {
          throw FileChangedException()
        }
      }
    } catch (e: FileNotFoundException) {
      throw FileMissingException()
    }
    if (cancelled.get()) {
      throw HashAbortedException()
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
