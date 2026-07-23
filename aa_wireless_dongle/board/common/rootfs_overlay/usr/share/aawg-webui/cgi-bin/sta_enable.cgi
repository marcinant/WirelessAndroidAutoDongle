#!/bin/sh
# Toggle the STA (car-wifi uplink) enabled flag and start/stop it at runtime,
# without a reboot and without touching the AP (wlan0/hostapd) at all.
#
# POST only, text/plain body: enabled=0|1

CONF="/boot/aawgd.conf"
LOCK_FILE="/var/run/aawgd_conf.lock"

echo "Content-Type: application/json"
echo ""

if [ "$REQUEST_METHOD" != "POST" ]; then
	echo '{"ok": false, "error": "POST required"}'
	exit 0
fi

LEN=${CONTENT_LENGTH:-0}
case "$LEN" in
	''|*[!0-9]*)
		echo '{"ok": false, "error": "invalid content length"}'
		exit 0
		;;
esac
if [ "$LEN" -le 0 ] || [ "$LEN" -gt 256 ]; then
	echo '{"ok": false, "error": "invalid content length"}'
	exit 0
fi

BODY=$(head -c "$LEN")
ENABLED=$(echo "$BODY" | sed -n 's/^enabled=//p' | head -1 | tr -cd '01')

if [ "$ENABLED" != "0" ] && [ "$ENABLED" != "1" ]; then
	echo '{"ok": false, "error": "enabled must be 0 or 1"}'
	exit 0
fi

if [ "$ENABLED" = "1" ]; then
	SSID=$(sed -n 's/^AAWG_STA_SSID=//p' "$CONF" 2>/dev/null | tail -1)
	if [ -z "$SSID" ]; then
		echo '{"ok": false, "error": "save an SSID/password before enabling"}'
		exit 0
	fi
fi

TMP=/tmp/aawgd.conf.staen

set_var() {
	if [ -n "$2" ]; then
		line="${1}=${2}"
	else
		line="#${1}="
	fi
	if grep -q "^#*${1}=" "$TMP"; then
		sed -i "s|^#*${1}=.*|${line}|" "$TMP"
	else
		printf '%s\n' "$line" >> "$TMP"
	fi
}

exec 8>"$LOCK_FILE"
if ! flock -w 10 8; then
	echo '{"ok": false, "error": "config busy, try again"}'
	exit 0
fi

if ! mount -o remount,rw /boot 2>/dev/null; then
	echo '{"ok": false, "error": "failed to remount /boot read-write"}'
	exit 0
fi

cp "$CONF" "$TMP" 2>/dev/null || : > "$TMP"
set_var AAWG_STA_ENABLE "$ENABLED"

if ! grep -q "AAWG_" "$TMP"; then
	rm -f "$TMP"
	mount -o remount,ro /boot 2>/dev/null
	echo '{"ok": false, "error": "config update produced an invalid file"}'
	exit 0
fi

cp "$CONF" "${CONF}.bak" 2>/dev/null
cp "$TMP" "$CONF"
RC=$?
sync
mount -o remount,ro /boot 2>/dev/null
rm -f "$TMP"

if [ $RC -ne 0 ]; then
	echo '{"ok": false, "error": "write failed"}'
	exit 0
fi

if [ "$ENABLED" = "1" ]; then
	/etc/init.d/S49wlan_sta start >/dev/null 2>&1 &
	echo '{"ok": true, "note": "starting"}'
else
	/etc/init.d/S49wlan_sta stop >/dev/null 2>&1 &
	echo '{"ok": true, "note": "stopped"}'
fi
