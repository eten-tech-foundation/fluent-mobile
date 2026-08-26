package expo.modules.uploadsyncforeground

import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UploadSyncForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UploadSyncForeground")

    AsyncFunction("start") { title: String, body: String ->
      startOrUpdate(title, body)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("update") { title: String, body: String ->
      startOrUpdate(title, body)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      val context = requireContext()
      context.stopService(UploadSyncForegroundService.stopIntent(context))
    }.runOnQueue(Queues.MAIN)
  }

  private fun startOrUpdate(title: String, body: String) {
    val context = requireContext()
    val intent = UploadSyncForegroundService.startIntent(context, title, body)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext?.applicationContext
      ?: throw CodedException("React context is not available")
}
