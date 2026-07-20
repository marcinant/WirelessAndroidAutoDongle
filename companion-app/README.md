# AAWG Companion (Android)

Setup, configuration and diagnostics app for the wireless Android Auto dongle.
It is a native client for the dongle's on-board CGI API (the same endpoints the
web panel at `http://10.0.0.1/` serves), plus a guided first-time setup that the
browser cannot do.

Android only — wireless Android Auto is an Android feature, and the app needs
Bluetooth bonding + wifi-join APIs that iOS does not allow.

## What it does

- **Guided setup** — finds the dongle by its BLE beacon (`AudiAndroidAuto-*`),
  pairs Bluetooth through the system association dialog
  (`CompanionDeviceManager`), joins the dongle wifi AP, and verifies it can
  reach the dongle. This solves the chicken-and-egg problem of the web panel,
  which is only reachable *after* you are already on the dongle wifi.
- **Dashboard** — live status tiles, stream charts (throughput / latency /
  signal), connection events, all polled from the dongle.
- **Settings** — Home Assistant reporting (with a connection test), connection
  strategy, HSP options, cloud webhook — written back to `/boot/aawgd.conf`
  through the config endpoint without hand-editing the file.
- **Log** — live tail of the dongle system log.

## Architecture

- `src/api/` — typed client for the dongle CGI endpoints (`status`, `stats`,
  `events`, `logs`, `config`, `ha`), plus helpers to parse the CSV/`;`-delimited
  payloads and patch individual `AAWG_*` keys in the raw config.
- `src/onboarding/` — permissions, BLE scan (`react-native-ble-plx`), wifi join
  (`react-native-wifi-reborn`), and the pairing bridge to the native module.
- `android/.../pairing/` — Kotlin `CompanionDeviceManager` module (`AawgPairing`)
  that shows the system pair dialog and bonds the chosen device. Degrades to
  opening Bluetooth settings when companion setup is unavailable.
- `src/screens/` — Onboarding, Dashboard, Config, Logs.

## Build

Requires Node >= 22, JDK 21, Android SDK (platform 35, build-tools 35).

    npm install
    cd android && ./gradlew :app:assembleDebug
    # output: android/app/build/outputs/apk/debug/app-debug.apk

Install on a device: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## Notes / follow-ups

- The dongle wifi password is now stable per device (persisted on first boot).
  Onboarding takes it manually; a per-device QR (on the panel or a sticker) and
  in-app QR scanning are the next step for a fully tap-free join.
- A future BLE GATT characteristic on the dongle could hand the wifi password to
  the paired app directly, removing manual entry entirely.
