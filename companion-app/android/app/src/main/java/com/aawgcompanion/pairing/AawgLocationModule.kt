package com.aawgcompanion.pairing

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule

// Streams phone GPS fixes to JS for the Traccar tracker. Uses the platform
// LocationManager (no Google Play Services dependency). Location permission is
// requested by the JS onboarding-permissions helper; continuous updates while
// the app is backgrounded are kept alive by the foreground service.
class AawgLocationModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private val lm: LocationManager?
    get() = reactCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

  private var listener: LocationListener? = null

  override fun getName() = "AawgLocation"

  private fun emit(loc: Location) {
    val m = WritableNativeMap()
    m.putDouble("lat", loc.latitude)
    m.putDouble("lon", loc.longitude)
    m.putDouble("time", loc.time.toDouble())
    if (loc.hasSpeed()) m.putDouble("speed", loc.speed.toDouble()) // m/s
    if (loc.hasAltitude()) m.putDouble("altitude", loc.altitude)
    if (loc.hasBearing()) m.putDouble("bearing", loc.bearing.toDouble())
    if (loc.hasAccuracy()) m.putDouble("accuracy", loc.accuracy.toDouble())
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AawgLocation", m)
  }

  @ReactMethod
  fun start(minIntervalMs: Double, minMeters: Double, promise: Promise) {
    val manager = lm
    if (manager == null) {
      promise.reject("no_lm", "No LocationManager")
      return
    }
    stopInternal()
    val l =
      object : LocationListener {
        override fun onLocationChanged(location: Location) = emit(location)
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("deprecated in API 29")
        override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
      }
    try {
      // Prefer GPS; fall back to network for an early fix.
      if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        manager.requestLocationUpdates(
          LocationManager.GPS_PROVIDER, minIntervalMs.toLong(), minMeters.toFloat(), l, Looper.getMainLooper())
      }
      if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        manager.requestLocationUpdates(
          LocationManager.NETWORK_PROVIDER, minIntervalMs.toLong(), minMeters.toFloat(), l, Looper.getMainLooper())
      }
      listener = l
      manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { emit(it) }
      promise.resolve(true)
    } catch (e: SecurityException) {
      promise.reject("perm", e.message, e)
    } catch (e: Exception) {
      promise.reject("loc_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise?) {
    stopInternal()
    promise?.resolve(true)
  }

  private fun stopInternal() {
    val l = listener ?: return
    try {
      lm?.removeUpdates(l)
    } catch (e: SecurityException) {}
    listener = null
  }
}
