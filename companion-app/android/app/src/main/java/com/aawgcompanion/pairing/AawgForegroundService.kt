package com.aawgcompanion.pairing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

// Keeps the app process (and thus the JS trip tracker + OBD polling) alive
// while the phone is projecting Android Auto and the app is backgrounded.
// Declared with a location foreground-service type so GPS updates keep flowing.
class AawgForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra("title") ?: "AAWG"
    val text = intent?.getStringExtra("text") ?: "Tracking trip"
    startForegroundCompat(title, text)
    return START_STICKY
  }

  private fun startForegroundCompat(title: String, text: String) {
    val channelId = "aawg_tracking"
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(channelId) == null) {
        nm.createNotificationChannel(
          NotificationChannel(channelId, "Trip tracking", NotificationManager.IMPORTANCE_LOW))
      }
    }
    val builder =
      if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channelId)
      else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification =
      builder
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setOngoing(true)
        .build()

    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
  }

  companion object {
    private const val NOTIF_ID = 0xAA01
  }
}
