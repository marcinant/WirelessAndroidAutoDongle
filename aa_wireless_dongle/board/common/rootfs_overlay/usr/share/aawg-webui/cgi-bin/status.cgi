#!/bin/sh
# Live status as JSON for the aawg web UI.
echo "Content-Type: application/json"
echo ""

json_escape() {
	# Escape backslash and double quote for embedding in JSON strings
	sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

UPTIME=$(cut -d. -f1 /proc/uptime)

AAWGD_PID=$(pidof aawgd || echo "")
AAWGD_RUNNING=false
[ -n "$AAWGD_PID" ] && AAWGD_RUNNING=true

# Bluetooth: adapter powered + connected devices
BT_POWERED=false
BT_DEVICES=""
if command -v bluetoothctl >/dev/null 2>&1; then
	# Bound bluetoothctl if the timeout applet is available (older images lack it)
	BOUND=""
	command -v timeout >/dev/null 2>&1 && BOUND="timeout 3"
	# </dev/null: under httpd CGI stdin is the client socket; bluetoothctl
	# would wait on it in interactive mode instead of exiting.
	if $BOUND bluetoothctl show </dev/null 2>/dev/null | grep -q "Powered: yes"; then
		BT_POWERED=true
	fi
	BT_DEVICES=$($BOUND bluetoothctl devices Connected </dev/null 2>/dev/null | sed 's/^Device //' | json_escape | tr '\n' ';' )
fi

# Wifi clients on the AP with signal strength
WIFI_STA=""
if command -v iw >/dev/null 2>&1; then
	WIFI_STA=$(iw dev wlan0 station dump 2>/dev/null | awk '
		/^Station/ {mac=$2}
		/signal:/ {printf "%s %s dBm;", mac, $2}' | json_escape)
fi

# Android Auto TCP session on the proxy port
TCP_STATE=$(netstat -tn 2>/dev/null | grep ':5288' | awk '{print $6}' | head -1)
[ -z "$TCP_STATE" ] && TCP_STATE="none"

# USB gadget state: which gadget is bound to the UDC
USB_GADGET="none"
for g in /sys/kernel/config/usb_gadget/*/UDC; do
	[ -f "$g" ] || continue
	if [ -n "$(cat "$g" 2>/dev/null)" ]; then
		USB_GADGET=$(basename "$(dirname "$g")")
	fi
done

# Last interesting aawgd log line = current stage of the connection flow
STAGE=$(grep -E 'aawgd.*(powered on|powered off|NewConnection|WifiStartRequest|WifiInfoResponse|handshake complete|handshake read failed|accepted connection|Enabled default gadget|Enabled accessory gadget|Forwarding data|Forwarding stopped|Failed to connect)' /var/log/messages 2>/dev/null | tail -1 | json_escape)

cat <<EOF
{
	"uptime_s": ${UPTIME:-0},
	"aawgd_running": ${AAWGD_RUNNING},
	"bt_powered": ${BT_POWERED},
	"bt_devices": "${BT_DEVICES}",
	"wifi_stations": "${WIFI_STA}",
	"tcp_state": "${TCP_STATE}",
	"usb_gadget": "${USB_GADGET}",
	"stage": "${STAGE}"
}
EOF
