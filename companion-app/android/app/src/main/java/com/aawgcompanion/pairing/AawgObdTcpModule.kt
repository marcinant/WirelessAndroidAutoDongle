package com.aawgcompanion.pairing

import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// TCP variant of the ELM327 serial link. Talks to anything that speaks the
// ELM327 line protocol over a socket: the ELM327-emulator dev tool
// (`python -m elm -n 35000`), or a wifi ELM327 clone (typically
// 192.168.0.10:35000). Same command/prompt semantics as the RFCOMM module.
class AawgObdTcpModule(reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private var socket: Socket? = null
  private var input: InputStream? = null
  private var output: OutputStream? = null

  override fun getName() = "AawgObdTcp"

  @ReactMethod
  fun connect(hostPort: String, promise: Promise) {
    closeQuietly()
    val parts = hostPort.trim().split(":")
    if (parts.size != 2) {
      promise.reject("bad_target", "Expected host:port")
      return
    }
    val port = parts[1].toIntOrNull()
    if (port == null || port < 1 || port > 65535) {
      promise.reject("bad_port", "Invalid port")
      return
    }
    try {
      val s = Socket()
      s.connect(InetSocketAddress(parts[0], port), 5000)
      s.soTimeout = 200
      socket = s
      input = s.getInputStream()
      output = s.getOutputStream()
      promise.resolve(true)
    } catch (e: Exception) {
      closeQuietly()
      promise.reject("connect_failed", e.message ?: "tcp connect failed", e)
    }
  }

  @ReactMethod
  fun command(cmd: String, timeoutMs: Int, promise: Promise) {
    val out = output
    val inp = input
    if (out == null || inp == null || socket?.isConnected != true) {
      promise.reject("not_connected", "TCP OBD link is not open")
      return
    }
    try {
      out.write((cmd + "\r").toByteArray())
      out.flush()

      val sb = StringBuilder()
      val buf = ByteArray(256)
      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline) {
        val n =
          try {
            inp.read(buf)
          } catch (e: java.net.SocketTimeoutException) {
            continue
          }
        if (n < 0) break
        if (n > 0) {
          sb.append(String(buf, 0, n, Charsets.US_ASCII))
          if (sb.indexOf(">") >= 0) break
        }
      }
      promise.resolve(sb.toString().replace(">", "").trim())
    } catch (e: Exception) {
      promise.reject("io_error", e.message ?: "tcp io failed", e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise?) {
    closeQuietly()
    promise?.resolve(true)
  }

  private fun closeQuietly() {
    try { input?.close() } catch (e: Exception) {}
    try { output?.close() } catch (e: Exception) {}
    try { socket?.close() } catch (e: Exception) {}
    input = null
    output = null
    socket = null
  }
}
