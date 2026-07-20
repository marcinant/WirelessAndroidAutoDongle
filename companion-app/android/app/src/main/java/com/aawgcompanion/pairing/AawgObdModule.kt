package com.aawgcompanion.pairing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Classic Bluetooth serial (RFCOMM/SPP) link to an ELM327 OBD-II adapter.
// ELM327 speaks a line protocol: send an "AT…" or OBD PID command terminated
// with CR, read back text until the "\r>" prompt. The JS layer (src/obd)
// drives the init sequence and PID parsing; this module only owns the socket
// and does blocking read/write on a background thread (React methods already
// run off the UI thread on the native modules executor).
class AawgObdModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  private var socket: BluetoothSocket? = null
  private var input: InputStream? = null
  private var output: OutputStream? = null

  private val adapter: BluetoothAdapter?
    get() = (reactCtx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  override fun getName() = "AawgObd"

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(socket?.isConnected == true)
  }

  @ReactMethod
  fun connect(address: String, promise: Promise) {
    val a = adapter
    if (a == null) {
      promise.reject("no_adapter", "No Bluetooth adapter")
      return
    }
    closeQuietly()
    val device: BluetoothDevice =
      try {
        a.getRemoteDevice(address)
      } catch (e: IllegalArgumentException) {
        promise.reject("bad_address", e.message, e)
        return
      }

    try {
      a.cancelDiscovery()
      val s = device.createRfcommSocketToServiceRecord(SPP_UUID)
      s.connect() // blocking; throws on failure
      socket = s
      input = s.inputStream
      output = s.outputStream
      promise.resolve(true)
    } catch (e: SecurityException) {
      closeQuietly()
      promise.reject("perm", e.message, e)
    } catch (e: Exception) {
      closeQuietly()
      promise.reject("connect_failed", e.message ?: "could not open serial link", e)
    }
  }

  // Write a command (CR appended) and read the reply up to the ELM327 ">"
  // prompt or the timeout. Returns the raw text minus the prompt.
  @ReactMethod
  fun command(cmd: String, timeoutMs: Int, promise: Promise) {
    val out = output
    val inp = input
    if (out == null || inp == null || socket?.isConnected != true) {
      promise.reject("not_connected", "OBD link is not open")
      return
    }
    try {
      out.write((cmd + "\r").toByteArray())
      out.flush()

      val sb = StringBuilder()
      val buf = ByteArray(256)
      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline) {
        if (inp.available() > 0) {
          val n = inp.read(buf)
          if (n > 0) {
            sb.append(String(buf, 0, n, Charsets.US_ASCII))
            if (sb.indexOf(">") >= 0) break
          }
        } else {
          Thread.sleep(10)
        }
      }
      promise.resolve(sb.toString().replace(">", "").trim())
    } catch (e: Exception) {
      promise.reject("io_error", e.message ?: "serial io failed", e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise?) {
    closeQuietly()
    promise?.resolve(true)
  }

  private fun closeQuietly() {
    try {
      input?.close()
    } catch (e: Exception) {}
    try {
      output?.close()
    } catch (e: Exception) {}
    try {
      socket?.close()
    } catch (e: Exception) {}
    input = null
    output = null
    socket = null
  }
}
