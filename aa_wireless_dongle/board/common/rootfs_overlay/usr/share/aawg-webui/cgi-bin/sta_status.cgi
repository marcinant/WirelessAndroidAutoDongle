#!/bin/sh
# STA (car-wifi uplink) status as JSON for the aawg web UI / companion app.
#
# See S49wlan_sta for how wlan0_sta / wpa_supplicant / NAT are brought up -
# this script only reads state, it never starts or stops anything, and it
# never touches wlan0/hostapd (the phone AP).
#
# "state" values:
#   unconfigured - no SSID saved yet
#   disabled     - configured but AAWG_STA_ENABLE is not 1
#   unsupported  - iw could not create the wlan0_sta vif (hardware/firmware
#                  does not support concurrent AP+STA) - distinct from
#                  "disconnected"/"scanning", never reported as either
#   starting     - enabled, vif not up yet
#   scanning     - vif up, not yet associated (in range or not - background
#                  retry is handled by wpa_supplicant itself)
#   error        - see "reason" (currently "auth_failed" or "start_failed")
#   connected    - associated and has an IP

echo "Content-Type: application/json"
echo ""

json_escape() {
	tr -d '\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
		-e "s/$(printf '\t')/\\\\t/g" -e "s/$(printf '\r')/\\\\r/g"
}

CONF="/boot/aawgd.conf"
STATE_FILE="/var/run/wlan_sta.state"
WPA_LOG="/var/log/wpa_supplicant_sta.log"
STA_IFACE="wlan0_sta"

SSID=$(sed -n 's/^AAWG_STA_SSID=//p' "$CONF" 2>/dev/null | tail -1 | json_escape)
ENABLE=$(sed -n 's/^AAWG_STA_ENABLE=//p' "$CONF" 2>/dev/null | tail -1)

CONFIGURED=false
[ -n "$SSID" ] && CONFIGURED=true

ENABLED=false
[ "$ENABLE" = "1" ] && ENABLED=true

STATE="unconfigured"
IP=""
RSSI="null"
REASON=""

# STA gets its address via a separately-run udhcpc (see S49wlan_sta), not
# via wpa_supplicant's own DHCP client, so wpa_cli's `ip_address=` field is
# never populated - read the interface's actual address instead.
get_sta_ip() {
	ip -4 -o addr show "$STA_IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1
}

if [ "$CONFIGURED" = "true" ]; then
	SF_STATE=$(cat "$STATE_FILE" 2>/dev/null)
	if [ "$ENABLED" != "true" ]; then
		STATE="disabled"
	elif [ "$SF_STATE" = "unsupported" ]; then
		STATE="unsupported"
	elif [ "$SF_STATE" = "error" ]; then
		# S49wlan_sta writes this when wpa_supplicant/NAT setup itself
		# failed to start, distinct from an in-range-but-wrong-password
		# auth failure detected below.
		STATE="error"
		REASON="start_failed"
	elif ! ip link show "$STA_IFACE" >/dev/null 2>&1; then
		# Enabled + configured but the vif isn't up (still starting, or
		# S49wlan_sta hasn't run yet since the setting was saved).
		STATE="starting"
	else
		WPA_STATUS=$(wpa_cli -p /var/run/wpa_supplicant_sta -i "$STA_IFACE" status 2>/dev/null)
		WPA_STATE=$(echo "$WPA_STATUS" | sed -n 's/^wpa_state=//p')

		case "$WPA_STATE" in
			COMPLETED)
				CUR_IP=$(get_sta_ip)
				if [ -n "$CUR_IP" ]; then
					STATE="connected"
					IP="$CUR_IP"
					RSSI=$(iw dev "$STA_IFACE" link 2>/dev/null | awk '/signal:/{print $2; exit}')
					[ -z "$RSSI" ] && RSSI="null"
				else
					# Associated, waiting for DHCP.
					STATE="scanning"
				fi
				;;
			*)
				# A wrong pre-shared key is the one failure wpa_supplicant
				# reports distinctly from a plain "not in range yet" scan
				# miss (both otherwise look like SCANNING/DISCONNECTED).
				# wpa_supplicant for this interface is started with its own
				# dedicated log file (see S49wlan_sta), so this only ever
				# matches this interface's own output. Only look at recent
				# log lines so a stale failure from a credential that has
				# since been fixed doesn't stick forever.
				if tail -n 200 "$WPA_LOG" 2>/dev/null | grep -qE 'WRONG_KEY|4-Way Handshake failed|pre-shared key may be incorrect'; then
					STATE="error"
					REASON="auth_failed"
				else
					STATE="scanning"
				fi
				;;
		esac
	fi
fi

cat <<EOF
{
	"configured": ${CONFIGURED},
	"enabled": ${ENABLED},
	"state": "${STATE}",
	"reason": "${REASON}",
	"ssid": "${SSID}",
	"ip": "${IP}",
	"rssi": ${RSSI}
}
EOF
