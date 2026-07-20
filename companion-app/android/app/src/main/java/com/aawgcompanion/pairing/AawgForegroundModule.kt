package com.aawgcompanion.pairing

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Start/stop the trip-tracking foreground service from JS.
class AawgForegroundModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  override fun getName() = "AawgForeground"

  @ReactMethod
  fun start(title: String, text: String, promise: Promise) {
    try {
      val intent = Intent(reactCtx, AawgForegroundService::class.java)
      intent.putExtra("title", title)
      intent.putExtra("text", text)
      if (Build.VERSION.SDK_INT >= 26) reactCtx.startForegroundService(intent)
      else reactCtx.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("fg_start_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise?) {
    try {
      reactCtx.stopService(Intent(reactCtx, AawgForegroundService::class.java))
    } catch (e: Exception) {}
    promise?.resolve(true)
  }
}
