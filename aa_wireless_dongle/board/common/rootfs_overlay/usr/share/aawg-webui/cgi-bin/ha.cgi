#!/bin/sh
# Home Assistant settings for the aawg web UI.
#
# GET: current AAWG_HA_* values from /boot/aawgd.conf plus uplink state, JSON.
# POST (text/plain, key=value lines: action, url, token, entity):
#   action=save - update the AAWG_HA_* lines in /boot/aawgd.conf in place
#   action=test - probe <url>/api/ with the token from the dongle itself
#                 (needs the Bluetooth PAN uplink to be up)
# Values are sanitized to a strict charset - they end up in a sourced shell
# config file, nothing outside the whitelist may pass.

CONF="/boot/aawgd.conf"

json_escape() {
	sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

uplink_up() {
	ip -4 addr show bnep0 2>/dev/null | grep -q inet
}

if [ "$REQUEST_METHOD" != "POST" ]; then
	echo "Content-Type: application/json"
	echo ""
	URL=$(sed -n 's/^AAWG_HA_URL=//p' "$CONF" 2>/dev/null | tail -1 | json_escape)
	TOKEN=$(sed -n 's/^AAWG_HA_TOKEN=//p' "$CONF" 2>/dev/null | tail -1 | json_escape)
	ENTITY=$(sed -n 's/^AAWG_HA_ENTITY=//p' "$CONF" 2>/dev/null | tail -1 | json_escape)
	UPLINK=false
	uplink_up && UPLINK=true
	echo "{\"url\": \"${URL}\", \"token\": \"${TOKEN}\", \"entity\": \"${ENTITY}\", \"uplink\": ${UPLINK}}"
	exit 0
fi

echo "Content-Type: application/json"
echo ""

LEN=${CONTENT_LENGTH:-0}
if [ "$LEN" -le 0 ] || [ "$LEN" -gt 8192 ]; then
	echo '{"ok": false, "error": "invalid content length"}'
	exit 0
fi

BODY=$(head -c "$LEN")

get_field() {
	echo "$BODY" | sed -n "s/^${1}=//p" | head -1
}

ACTION=$(get_field action | tr -cd 'a-z')
# Whitelists: these values are written into a sourced shell file
URL=$(get_field url | tr -cd 'A-Za-z0-9._~:/?&=%+-')
TOKEN=$(get_field token | tr -cd 'A-Za-z0-9._-')
ENTITY=$(get_field entity | tr -cd 'A-Za-z0-9._')

case "$URL" in
	""|http://*|https://*) ;;
	*)
		echo '{"ok": false, "error": "url must start with http:// or https://"}'
		exit 0
		;;
esac

if [ "$ACTION" = "test" ]; then
	if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
		echo '{"ok": false, "error": "url and token required"}'
		exit 0
	fi
	if ! uplink_up; then
		echo '{"ok": false, "error": "no uplink", "hint": "dongle has no internet right now - PAN connects during an AA session; settings can still be saved"}'
		exit 0
	fi
	CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' \
		-H "Authorization: Bearer ${TOKEN}" "${URL%/}/api/" 2>/dev/null)
	case "$CODE" in
		200) echo '{"ok": true, "note": "connected, token accepted"}' ;;
		401|403) echo "{\"ok\": false, \"error\": \"token rejected (HTTP ${CODE})\"}" ;;
		*) echo "{\"ok\": false, \"error\": \"cannot reach HA (HTTP ${CODE:-000})\"}" ;;
	esac
	exit 0
fi

if [ "$ACTION" != "save" ]; then
	echo '{"ok": false, "error": "unknown action"}'
	exit 0
fi

TMP=/tmp/aawgd.conf.ha
cp "$CONF" "$TMP" 2>/dev/null || : > "$TMP"

# Replace the (possibly commented) assignment in place, or append.
# Empty value comments the variable out.
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

set_var AAWG_HA_URL "$URL"
set_var AAWG_HA_TOKEN "$TOKEN"
set_var AAWG_HA_ENTITY "$ENTITY"

if ! grep -q "AAWG_" "$TMP"; then
	rm -f "$TMP"
	echo '{"ok": false, "error": "config update produced an invalid file"}'
	exit 0
fi

if ! mount -o remount,rw /boot 2>/dev/null; then
	rm -f "$TMP"
	echo '{"ok": false, "error": "failed to remount /boot read-write"}'
	exit 0
fi

cp "$CONF" "${CONF}.bak" 2>/dev/null
cp "$TMP" "$CONF"
RC=$?
sync
mount -o remount,ro /boot 2>/dev/null
rm -f "$TMP"

if [ $RC -eq 0 ]; then
	echo '{"ok": true, "note": "saved, reboot to apply"}'
else
	echo '{"ok": false, "error": "write failed"}'
fi
