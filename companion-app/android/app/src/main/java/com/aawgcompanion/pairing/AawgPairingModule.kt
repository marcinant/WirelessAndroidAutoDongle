package com.aawgcompanion.pairing

import android.app.Activity
import android.bluetooth.BluetoothDevice
import android.companion.AssociationRequest
import android.companion.BluetoothDeviceFilter
import android.companion.CompanionDeviceManager
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.os.Build
import java.util.regex.Pattern
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

// Thin wrapper over Android's CompanionDeviceManager. Given a bluetooth name
// prefix (e.g. "AudiAndroidAuto-"), it shows the system association dialog
// listing matching devices; when the user taps one, Android bonds it and we
// return the device name + MAC to JS. This is the same association UX apps use
// to pair watches/earbuds, and it does not need Google Fast Pair registration.
class AawgPairingModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private var pendingPromise: Promise? = null

  private val activityListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != REQUEST_CODE) return
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
          promise.reject("cancelled", "Pairing was cancelled")
          return
        }

        // A BluetoothDeviceFilter association returns the chosen device in
        // EXTRA_DEVICE across all versions; use the typed getter on 33+.
        val device: BluetoothDevice? =
          if (Build.VERSION.SDK_INT >= 33) {
            data.getParcelableExtra(CompanionDeviceManager.EXTRA_DEVICE, BluetoothDevice::class.java)
          } else {
            @Suppress("DEPRECATION")
            data.getParcelableExtra(CompanionDeviceManager.EXTRA_DEVICE)
          }

        if (device == null) {
          promise.reject("no_device", "System returned no device")
          return
        }

        // Trigger classic bonding if not already bonded.
        if (device.bondState != BluetoothDevice.BOND_BONDED) {
          try {
            device.createBond()
          } catch (e: SecurityException) {
            promise.reject("bond_permission", e.message, e)
            return
          }
        }

        val result = WritableNativeMap()
        result.putString("name", device.name ?: "")
        result.putString("mac", device.address ?: "")
        promise.resolve(result)
      }
    }

  init {
    reactCtx.addActivityEventListener(activityListener)
  }

  override fun getName() = "AawgPairing"

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(reactCtx.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_COMPANION_DEVICE_SETUP))
  }

  // Show the association dialog for devices whose bluetooth name matches the
  // given regex (partial match). This runs a CLASSIC bluetooth inquiry — the
  // dongle is a classic BR/EDR device (RFCOMM profiles for Android Auto), so
  // this is what actually finds it; a BLE scan does not. Resolves with
  // { name, mac } once the user picks and bonding starts.
  @ReactMethod
  fun associate(namePattern: String, promise: Promise) {
    val activity = reactCtx.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "No foreground activity")
      return
    }
    val cdm = reactCtx.getSystemService(Context.COMPANION_DEVICE_SERVICE) as? CompanionDeviceManager
    if (cdm == null) {
      promise.reject("no_cdm", "CompanionDeviceManager unavailable")
      return
    }

    pendingPromise = promise

    // An empty pattern means "show every bondable device" (fallback when the
    // dongle's name is unknown); otherwise filter by the caller's regex.
    val builder = AssociationRequest.Builder().setSingleDevice(false)
    if (namePattern.isNotEmpty()) {
      builder.addDeviceFilter(
        BluetoothDeviceFilter.Builder()
          .setNamePattern(Pattern.compile(namePattern))
          .build(),
      )
    } else {
      builder.addDeviceFilter(BluetoothDeviceFilter.Builder().build())
    }
    val request = builder.build()

    val callback =
      object : CompanionDeviceManager.Callback() {
        override fun onDeviceFound(chooserLauncher: IntentSender) {
          try {
            activity.startIntentSenderForResult(chooserLauncher, REQUEST_CODE, null, 0, 0, 0)
          } catch (e: IntentSender.SendIntentException) {
            pendingPromise?.reject("intent_failed", e.message, e)
            pendingPromise = null
          }
        }

        override fun onFailure(error: CharSequence?) {
          pendingPromise?.reject("assoc_failed", error?.toString() ?: "association failed")
          pendingPromise = null
        }
      }

    try {
      cdm.associate(request, callback, null)
    } catch (e: Exception) {
      pendingPromise = null
      promise.reject("associate_threw", e.message, e)
    }
  }

  companion object {
    private const val REQUEST_CODE = 0xAA01
  }
}
