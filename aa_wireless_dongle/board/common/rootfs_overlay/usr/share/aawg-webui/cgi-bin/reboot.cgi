#!/bin/sh
# Reboot the dongle (POST only).
echo "Content-Type: application/json"
echo ""

if [ "$REQUEST_METHOD" != "POST" ]; then
	echo '{"ok": false, "error": "POST required"}'
	exit 0
fi

echo '{"ok": true, "note": "rebooting"}'
# Detach so the HTTP response gets out before the reboot kills httpd
(sleep 1; reboot) >/dev/null 2>&1 &
