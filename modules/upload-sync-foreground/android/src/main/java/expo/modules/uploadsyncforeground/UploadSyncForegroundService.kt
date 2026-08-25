package expo.modules.uploadsyncforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder

/**
 * Ongoing system notification + dataSync foreground service so chapter
 * uploads can continue while the app is backgrounded (#152).
 */
class UploadSyncForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
    val body = intent?.getStringExtra(EXTRA_BODY) ?: ""
    val notification = buildNotification(title, body)
    startAsForeground(notification)
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun startAsForeground(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(title: String, body: String): Notification {
    ensureChannel()
    val pendingIntent = tapPendingIntent()
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }
    builder
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setColor(BRAND_COLOR)
    return builder.build()
  }

  private fun tapPendingIntent(): PendingIntent {
    val view = Intent(Intent.ACTION_VIEW, Uri.parse(TAP_DEEP_LINK)).apply {
      setPackage(packageName)
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(this, 0, view, flags)
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) {
      return
    }
    val channel = NotificationChannel(
      CHANNEL_ID,
      CHANNEL_NAME,
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = CHANNEL_DESCRIPTION
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val CHANNEL_ID = "upload-sync"
    const val CHANNEL_NAME = "Upload progress"
    const val CHANNEL_DESCRIPTION =
      "Shows chapter upload progress while recordings sync in the background."
    const val TAP_DEEP_LINK = "fluent:///(app)/(stack)/sync"
    const val DEFAULT_TITLE = "Uploading your recordings"
    const val NOTIFICATION_ID = 15201
    const val BRAND_COLOR = 0xFF0B50D0.toInt()

    fun startIntent(context: Context, title: String, body: String): Intent =
      Intent(context, UploadSyncForegroundService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_BODY, body)
      }

    fun stopIntent(context: Context): Intent =
      Intent(context, UploadSyncForegroundService::class.java)
  }
}
