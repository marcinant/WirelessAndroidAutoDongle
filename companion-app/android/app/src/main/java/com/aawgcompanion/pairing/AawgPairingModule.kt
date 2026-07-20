package com.aawgcompanion.pairing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule

// Classic Bluetooth (BR/EDR) discovery and bonding. The dongle is a classic
// device (RFCOMM profiles for Android Auto), so this is what actually finds it
// and resolves its name — a BLE scan or a CompanionDeviceManager name filter
// does not. Discovered devices are streamed to JS as events; bonding uses the
// normal createBond(), the same path as pairing from system Settings, which is
// what triggers the phone's wireless Android Auto enablement.
class AawgPairingModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private val adapter: BluetoothAdapter?
    get() = (reactCtx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private var discoveryReceiver: BroadcastReceiver? = null
  private var bondReceiver: BroadcastReceiver? = null
  private var bondPromise: Promise? = null
  private var bondTarget: String? = null

  override fun getName() = "AawgPairing"

  private fun emit(event: String, params: WritableMap?) {
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }

  private fun deviceMap(device: BluetoothDevice, rssi: Short?): WritableMap {
    val m = WritableNativeMap()
    m.putString("address", device.address)
    m.putString("name", try { device.name } catch (e: SecurityException) { null } ?: "")
    m.putBoolean("bonded", device.bondState == BluetoothDevice.BOND_BONDED)
    if (rssi != null && rssi.toInt() != Short.MIN_VALUE.toInt()) m.putInt("rssi", rssi.toInt())
    return m
  }

  @ReactMethod
  fun isBluetoothOn(promise: Promise) {
    promise.resolve(adapter?.isEnabled == true)
  }

  // Emit the already-bonded devices immediately (so a re-paired dongle shows up
  // even before discovery finds it), then start a fresh classic inquiry.
  @ReactMethod
  fun startDiscovery(promise: Promise) {
    val a = adapter
    if (a == null) {
      promise.reject("no_adapter", "No Bluetooth adapter")
      return
    }
    if (!a.isEnabled) {
      promise.reject("bt_off", "Bluetooth is off")
      return
    }

    try {
      for (d in a.bondedDevices ?: emptySet()) emit("AawgDeviceFound", deviceMap(d, null))
    } catch (e: SecurityException) {
      promise.reject("perm", e.message, e)
      return
    }

    registerDiscoveryReceiver()
    a.cancelDiscovery()
    val started = a.startDiscovery()
    if (!started) {
      promise.reject("discovery_failed", "startDiscovery returned false")
      return
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun cancelDiscovery(promise: Promise?) {
    try {
      adapter?.cancelDiscovery()
    } catch (e: SecurityException) {
      // ignore
    }
    unregisterDiscoveryReceiver()
    promise?.resolve(true)
  }

  private fun registerDiscoveryReceiver() {
    if (discoveryReceiver != null) return
    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val device = deviceExtra(intent, BluetoothDevice.EXTRA_DEVICE) ?: return
              val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE)
              emit("AawgDeviceFound", deviceMap(device, rssi))
            }
            BluetoothDevice.ACTION_NAME_CHANGED -> {
              // Late name resolution: re-emit so the list can fill in the name.
              val device = deviceExtra(intent, BluetoothDevice.EXTRA_DEVICE) ?: return
              emit("AawgDeviceFound", deviceMap(device, null))
            }
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> emit("AawgDiscoveryFinished", null)
          }
        }
      }
    val filter =
      IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_FOUND)
        addAction(BluetoothDevice.ACTION_NAME_CHANGED)
        addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
      }
    reactCtx.registerReceiver(receiver, filter)
    discoveryReceiver = receiver
  }

  private fun unregisterDiscoveryReceiver() {
    discoveryReceiver?.let {
      try {
        reactCtx.unregisterReceiver(it)
      } catch (e: IllegalArgumentException) {
        // already unregistered
      }
    }
    discoveryReceiver = null
  }

  // Bond a device by address. Resolves { name, mac } once bonded (or already
  // bonded). Bonding the dongle is what lets Android Auto offer it wirelessly.
  @ReactMethod
  fun bondDevice(address: String, promise: Promise) {
    val a = adapter
    if (a == null) {
      promise.reject("no_adapter", "No Bluetooth adapter")
      return
    }
    cancelDiscovery(null)

    val device =
      try {
        a.getRemoteDevice(address)
      } catch (e: IllegalArgumentException) {
        promise.reject("bad_address", e.message, e)
        return
      }

    if (device.bondState == BluetoothDevice.BOND_BONDED) {
      promise.resolve(deviceMap(device, null))
      return
    }

    bondPromise = promise
    bondTarget = address
    registerBondReceiver()

    try {
      if (!device.createBond()) {
        finishBond(false, "createBond returned false")
      }
    } catch (e: SecurityException) {
      finishBond(false, e.message ?: "bond permission denied")
    }
  }

  private fun registerBondReceiver() {
    if (bondReceiver != null) return
    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
          val device = deviceExtra(intent, BluetoothDevice.EXTRA_DEVICE) ?: return
          if (device.address != bondTarget) return
          when (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)) {
            BluetoothDevice.BOND_BONDED -> {
              val m = deviceMap(device, null)
              val p = bondPromise
              clearBond()
              p?.resolve(m)
            }
            BluetoothDevice.BOND_NONE -> finishBond(false, "Pairing failed or was rejected")
            else -> {} // BOND_BONDING: keep waiting
          }
        }
      }
    reactCtx.registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED))
    bondReceiver = receiver
  }

  private fun finishBond(ok: Boolean, error: String?) {
    val p = bondPromise
    clearBond()
    if (!ok) p?.reject("bond_failed", error ?: "bond failed")
  }

  private fun clearBond() {
    bondReceiver?.let {
      try {
        reactCtx.unregisterReceiver(it)
      } catch (e: IllegalArgumentException) {}
    }
    bondReceiver = null
    bondPromise = null
    bondTarget = null
  }

  private fun deviceExtra(intent: Intent, key: String): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(key, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(key)
    }
}
