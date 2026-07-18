#!/bin/sh
# Read (GET) or replace (POST) /boot/aawgd.conf for the aawg web UI.
# POST body is the raw new file content (text/plain).

CONF="/boot/aawgd.conf"

if [ "$REQUEST_METHOD" = "POST" ]; then
	echo "Content-Type: application/json"
	echo ""

	LEN=${CONTENT_LENGTH:-0}
	if [ "$LEN" -le 0 ] || [ "$LEN" -gt 65536 ]; then
		echo '{"ok": false, "error": "invalid content length"}'
		exit 0
	fi

	TMP=/tmp/aawgd.conf.new
	head -c "$LEN" > "$TMP"

	# Sanity check: refuse an obviously wrong/empty upload
	if ! grep -q "AAWG_" "$TMP"; then
		rm -f "$TMP"
		echo '{"ok": false, "error": "content does not look like aawgd.conf (no AAWG_ variables)"}'
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
		echo '{"ok": true, "note": "saved, previous version kept as aawgd.conf.bak, reboot to apply"}'
	else
		echo '{"ok": false, "error": "write failed"}'
	fi
else
	echo "Content-Type: text/plain; charset=utf-8"
	echo ""
	cat "$CONF" 2>/dev/null
fi
