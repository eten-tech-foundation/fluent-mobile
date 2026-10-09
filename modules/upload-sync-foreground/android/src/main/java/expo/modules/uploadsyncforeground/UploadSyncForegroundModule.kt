package expo.modules.uploadsyncforeground

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UploadSyncForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UploadSyncForeground")

    AsyncFunction("start") { title: String, body: String ->
      dispatch(
        UploadSyncForegroundService.startIntent(requireContext(), title, body),
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("update") { title: String, body: String ->
      dispatch(
        UploadSyncForegroundService.startIntent(requireContext(), title, body),
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      // Deliver stop through onStartCommand so startForeground() always runs
      // before the service stops. context.stopService() can win the race
      // against a pending startForegroundService() and crash the app (#599).
      dispatch(UploadSyncForegroundService.stopIntent(requireContext()))
    }.runOnQueue(Queues.MAIN)
  }

  private fun dispatch(intent: Intent) {
    val context = requireContext()
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
