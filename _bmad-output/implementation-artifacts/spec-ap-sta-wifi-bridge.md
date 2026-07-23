---
title: 'AP+STA WiFi Uplink Bridge'
type: 'feature'
created: '2026-07-23'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '273e1c7a6bee305bc5f4b0732b51704947f790e8'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dongle's wlan0 only runs as AP (hostapd) for the phone. If the phone has no cellular data (no SIM, no signal, or user wants to avoid its LTE), it has no internet even though the car's own WiFi hotspot has one, because nothing bridges the two.

**Approach:** Add a second virtual interface (`wlan0_sta`) running `wpa_supplicant` as a STA client to the car's WiFi, NAT its uplink to the existing AP interface, and expose configure/enable/status via new CGI endpoints consumed by a new companion-app screen. AP for the phone must remain untouched regardless of STA state.

## Boundaries & Constraints

**Always:**
- Existing wlan0 AP (hostapd, `10.0.0.1`, dnsmasq, AA proxy over `/dev/usb_accessory`) keeps working unmodified, independent of STA state or failures.
- STA credentials persist in `/boot/aawgd.conf` (same writable store/remount pattern as `config.cgi`), survive reboot.
- New CGI endpoints are POSIX `/bin/sh`, served by the existing busybox httpd, same auth as `status.cgi`/`config.cgi`.
- Companion-app changes mirror existing conventions exactly: `req()`/`types.ts` in `client.ts`, `Field`/`Toggle` components (`ui.tsx`, `ConfigScreen.tsx`'s Toggle), `usePolling` for status, save/test/status-message/loading pattern from the HA settings section.
- Feature ships **disabled by default** (STA only activates after user saves SSID/password and explicitly enables it).
- STA password is never written to `/var/log/messages` or any log tailed by `logs.cgi`.

**Ask First:**
- If `iw dev wlan0 interface add wlan0_sta type station` fails or is rejected on real hardware (brcmfmac firmware doesn't support concurrent multi-vif — unverifiable from repo alone per investigation) — HALT, report the failure, and ask the human whether to pivot to an AP/STA mutually-exclusive toggle mode instead of concurrent mode, rather than shipping untested guesswork.
- Any change to `/etc/network/interfaces` boot ordering that could risk the AP failing to start.

**Never:**
- Touch `aawgd.cpp` / `AAWProxy` / the USB-accessory relay logic — AA session path is out of scope.
- Implement the SSID-status-race bugfix (deferred separately, see `deferred-work.md`).
- Silently show "disconnected" for a state that's actually "unsupported by this hardware" — these must be distinguishable in both `sta_status.cgi` and the UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Not configured | User opens STA screen before saving SSID | `sta_status.cgi` → `{configured:false}`; UI shows "not configured" | N/A |
| Wrong password | wpa_supplicant handshake fails | `{state:"error", reason:"auth_failed"}` | UI shows explicit error, not blank |
| Car wifi out of range | STA enabled, target AP not visible | `{state:"scanning"}`, background retry, phone AP unaffected | N/A |
| Multi-vif unsupported | `iw ... interface add wlan0_sta` fails at boot | `{state:"unsupported"}`, logged once, feature cleanly disabled | AP unaffected; UI shows "not supported on this hardware", not blank |
| Happy path | STA configured, in range, correct password | `{state:"connected", ip, ssid, rssi}`; phone traffic NATed via `wlan0_sta` | N/A |

</frozen-after-approval>

## Code Map

- `aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S39hostapd_conf` -- existing AP init pattern to mirror for a new STA init script
- `aa_wireless_dongle/board/common/rootfs_overlay/etc/network/interfaces` -- add `wlan0_sta` iface stanza alongside existing static `wlan0`
- `aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/status.cgi` -- style reference for new `sta_status.cgi`
- `aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/config.cgi` -- pattern for `/boot/aawgd.conf` read/write, reused by `sta_set.cgi`
- `aa_wireless_dongle/configs/raspberrypizero2w_defconfig` -- confirm `BR2_PACKAGE_WPA_SUPPLICANT=y` (already enabled) and `iw` package availability
- `companion-app/src/api/client.ts` -- add `getStaStatus()`, `setStaConfig()`, `setStaEnabled()`
- `companion-app/src/api/types.ts` -- add `StaStatus`/`StaConfig` types
- `companion-app/src/screens/ConfigScreen.tsx` -- add STA section mirroring the HA settings block (Field ×2 + Toggle + Save/Test buttons)
- `companion-app/src/nav.ts`, `App.tsx` -- only if STA becomes its own screen instead of a ConfigScreen section (default to section, no new screen)

## Tasks & Acceptance

**Execution:**
- [x] `aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S49wlan_sta` -- new init script: `iw dev wlan0 interface add wlan0_sta type station`, start `wpa_supplicant -i wlan0_sta` + `udhcpc`, enable `net.ipv4.ip_forward`, NAT+FORWARD iptables rules; only runs if `AAWG_STA_ENABLE=1`; degrades to `state=unsupported` if vif creation fails -- brings up uplink without touching AP init (renamed from `S46` to `S49`, next free init slot after `S48obd`)
- [x] `aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_status.cgi` -- reports `{configured, enabled, state, reason, ssid, ip, rssi}` via `wpa_cli`/`iw`/state file -- status source for app polling
- [x] `aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_set.cgi` -- validates+persists SSID/password to `/boot/aawgd.conf` (remount-rw pattern from `config.cgi`), triggers restart, never logs password -- config persistence
- [x] `aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_enable.cgi` -- toggles `AAWG_STA_ENABLE`, starts/stops STA without touching AP, refuses enable without saved SSID -- runtime control
- [x] `companion-app/src/api/client.ts` + `types.ts` -- added `getStaStatus()`, `setStaConfig()`, `setStaEnabled()` + `StaState`/`StaStatus`/`StaConfig` types, following `getHa`/`saveHa`/`testHa` pattern exactly
- [x] `companion-app/src/screens/ConfigScreen.tsx` -- STA section: SSID `Field`, password `Field(secure)`, enable `Toggle`, Save button, live status line via `usePolling(getStaStatus, 4000)` (mirrors HA block); also added i18n strings in `src/i18n/index.ts`

**Acceptance Criteria:**
- Given STA is disabled and unconfigured, when the phone is connected to the dongle AP for Android Auto, then AA works exactly as before (no regression).
- Given the user saves a valid car-wifi SSID/password and enables STA, when the dongle is in range, then `sta_status.cgi` reports `state:"connected"` and the phone (connected only to the dongle AP) can reach the internet.
- Given `wlan0_sta` interface creation fails on boot, when `sta_status.cgi` is polled, then it reports `state:"unsupported"` and the AP/AA session is unaffected.
- Given STA is enabled but the car wifi is unreachable, when polled repeatedly, then the dongle keeps retrying in the background without ever tearing down the AP.

## Design Notes

Concurrent AP+STA feasibility on the brcmfmac chip/firmware used by Pi Zero 2W could **not** be confirmed from the repo (kernel/firmware fetched at build time, not vendored — see investigation). The first execution task (`S49wlan_sta` + a real-hardware flash test) doubles as the feasibility check. If `iw dev wlan0 interface add` is rejected outright, stop and trigger the **Ask First** gate above instead of continuing to build the CGI/app layers around a non-functional interface.

**Implementation status (this session):** all code written and self-consistent (`sh -n` clean, `busybox ash` smoke-tested against the I/O matrix's `unconfigured`/`disabled`/`unsupported`/error states, `tsc --noEmit` clean, no new lint issues). **Real-hardware AP+STA feasibility is still unverified** — no physical Pi Zero 2W was available this session. Also note: `BR2_PACKAGE_IPTABLES=y` was added to all five board defconfigs (shared buildroot change, `iw`/`wpa_supplicant` were already enabled everywhere), and `/etc/network/interfaces` was deliberately left untouched — `wlan0_sta` is created dynamically at runtime by `S49wlan_sta`, so a static ifupdown stanza for it would be meaningless and touching that file would trigger the boot-ordering **Ask First** gate for no reason.

## Verification

**Commands:**
- `docker compose run --rm rpi02w` -- expected: image builds cleanly with the new init script/CGI files included
- `cd companion-app && npm run lint && npx tsc --noEmit` -- expected: no new lint/type errors
- `cd companion-app && npm test` -- expected: existing tests still pass

**Manual checks (if no CLI):**
- Flash built image to a real Pi Zero 2W, confirm `iw dev` shows both `wlan0` (AP) and `wlan0_sta` (station) simultaneously after enabling STA.
- Connect phone to dongle AP, run AA session, enable STA pointed at a real hotspot, confirm phone gets internet (e.g. load a webpage) while AA keeps running without drops.
- Kill/blackhole the STA uplink mid-session, confirm AP + AA session survive untouched.

## Suggested Review Order

**Credential validation & injection defense**

- Entry point: reject (not strip) any shell-metacharacter, then single-quote before writing to a sourced config file — the core fix for the command-injection finding from adversarial review.
  [`sta_set.cgi:54`](../../aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_set.cgi#L54)

- `shell_quote()` escapes embedded single quotes so a quoted assignment can't be split by `source`, even if the whitelist above ever has a bug.
  [`sta_set.cgi:87`](../../aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_set.cgi#L87)

**STA interface lifecycle (`S49wlan_sta`)**

- Always re-source `/etc/aawgd.conf` fresh, ignoring the inherited `AAWG_CONF_SOURCED` flag, so runtime Save/Enable actually apply without a reboot.
  [`S49wlan_sta:67`](../../aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S49wlan_sta#L67)

- `flock` around start/stop so overlapping Save+Toggle calls from the app can't interleave `iw`/`wpa_supplicant`/`iptables` operations.
  [`S49wlan_sta:70`](../../aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S49wlan_sta#L70)

- `wpa_supplicant` gets its own log file (`-f`) so the auth-failure detection in `sta_status.cgi` has something real to grep.
  [`S49wlan_sta:137`](../../aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S49wlan_sta#L137)

- `ip_forward`/iptables NAT rules are checked for success, not assumed — a silent failure here would report "connected" with no actual forwarding.
  [`S49wlan_sta:160`](../../aa_wireless_dongle/board/common/rootfs_overlay/etc/init.d/S49wlan_sta#L160)

**Status reporting (`sta_status.cgi`)**

- IP comes from `ip addr show`, not `wpa_cli`'s `ip_address=` field — the latter is populated by wpa_supplicant's own DHCP client, which this design doesn't use (a separate `udhcpc` does), so it would never fire.
  [`sta_status.cgi:51`](../../aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_status.cgi#L51)

- `error` state (e.g. wpa_supplicant failed to start) is now distinguished from `scanning`/`unsupported`, per the spec's I/O matrix.
  [`sta_status.cgi:64`](../../aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_status.cgi#L64)

**Config-write safety (`sta_enable.cgi`)**

- Mirrors `sta_set.cgi`'s sanity guard: refuses to overwrite `/boot/aawgd.conf` if the intermediate copy looks empty/corrupt, preventing a wiped config on a transient `/boot` read failure.
  [`sta_enable.cgi:75`](../../aa_wireless_dongle/board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/sta_enable.cgi#L75)

**Companion app integration**

- New API calls mirror the existing `getHa`/`saveHa`/`testHa` pattern exactly — GET+throw-on-!ok, POST+`{ok,note?,error?}`.
  [`client.ts:185`](../../companion-app/src/api/client.ts#L185)

- STA section hydrates SSID once from the first status poll, then never again — avoids clobbering in-progress user typing (a review finding).
  [`ConfigScreen.tsx:60`](../../companion-app/src/screens/ConfigScreen.tsx#L60)

- `staBusy` guards Save vs. Toggle so the UI itself can't fire two overlapping STA requests.
  [`ConfigScreen.tsx:52`](../../companion-app/src/screens/ConfigScreen.tsx#L52)

**Peripherals**

- `StaState`/`StaStatus`/`StaConfig` types backing the new API surface.
  [`types.ts:53`](../../companion-app/src/api/types.ts#L53)

- `iptables` enabled across all five board defconfigs (shared buildroot change, needed for the new NAT rules).
  [`raspberrypizero2w_defconfig:67`](../../aa_wireless_dongle/configs/raspberrypizero2w_defconfig#L67)
