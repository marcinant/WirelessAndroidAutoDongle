#!/bin/sh
# Save the STA (car-wifi uplink) SSID/password to /boot/aawgd.conf and
# (re)start wlan0_sta with the new credentials. POST only, text/plain body,
# key=value lines: ssid, password.
#
# Does NOT change AAWG_STA_ENABLE (see sta_enable.cgi for that) - saving
# credentials alone never turns the feature on, matching "ships disabled by
# default". Never touches wlan0/hostapd (the phone AP).
#
# The password is written straight to the config file and passed to
# S49wlan_sta - it is never echoed, and must never end up in
# /var/log/messages or any log tailed by logs.cgi.

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
if [ "$LEN" -le 0 ] || [ "$LEN" -gt 4096 ]; then
	echo '{"ok": false, "error": "invalid content length"}'
	exit 0
fi

BODY=$(head -c "$LEN")

get_field() {
	echo "$BODY" | sed -n "s/^${1}=//p" | head -1
}

# These values end up in a sourced shell config file (/boot/aawgd.conf) and
# a wpa_supplicant config, so unlike a plain whitelist-and-strip, ANY
# disallowed character is a hard reject (not silently dropped) - silently
# stripping characters lets a value that parses differently than the user
# intended slip through. Space is allowed (SSIDs commonly have one) because
# the value is always written single-quoted below, so a space can never
# split the assignment into two shell words. None of the allowed characters
# below are shell metacharacters: no ; & | < > ( ) ` $ \ " ' or newline.
SSID_RAW=$(get_field ssid)
PASSWORD_RAW=$(get_field password)

case "$SSID_RAW" in
	*[!A-Za-z0-9\ ._~-]*)
		echo '{"ok": false, "error": "invalid character in ssid"}'
		exit 0
		;;
esac
SSID="$SSID_RAW"

case "$PASSWORD_RAW" in
	*[!A-Za-z0-9\ !#%*+,./:=?@_~-]*)
		echo '{"ok": false, "error": "invalid character in password"}'
		exit 0
		;;
esac
PASSWORD="$PASSWORD_RAW"

if [ -z "$SSID" ] || [ "${#SSID}" -gt 32 ]; then
	echo '{"ok": false, "error": "ssid is required (max 32 chars; letters, digits, space, . _ ~ - only)"}'
	exit 0
fi

if [ -n "$PASSWORD" ] && { [ "${#PASSWORD}" -lt 8 ] || [ "${#PASSWORD}" -gt 63 ]; }; then
	echo '{"ok": false, "error": "password must be 8-63 characters (WPA2-PSK), or empty for an open network"}'
	exit 0
fi

TMP=/tmp/aawgd.conf.sta

# Single-quote a value for safe inclusion in a sourced shell file, escaping
# any embedded single quotes ('"'"' is the standard trick: close the quote,
# emit an escaped single quote, reopen the quote). Defense-in-depth: even if
# the whitelist above has a bug, a quoted assignment can't be split into a
# second command by `source`.
shell_quote() {
	printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\"'\"'/g")"
}

set_var() {
	if [ -n "$2" ]; then
		line="${1}=$(shell_quote "$2")"
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
set_var AAWG_STA_SSID "$SSID"
set_var AAWG_STA_PASSWORD "$PASSWORD"

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

# Re-source and (re)apply. If STA isn't enabled yet this is a no-op inside
# S49wlan_sta (AAWG_STA_ENABLE check) - only wlan0_sta is ever touched here.
/etc/init.d/S49wlan_sta restart >/dev/null 2>&1 &

echo '{"ok": true, "note": "saved"}'
