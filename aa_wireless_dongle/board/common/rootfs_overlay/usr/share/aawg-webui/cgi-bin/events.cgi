#!/bin/sh
# Connection event history for the aawg web UI, as plain lines:
#   hostapd <epoch.usec>: wlan0: AP-STA-CONNECTED <mac>   (wifi assoc/deassoc)
#   aawgd <syslog line>                                    (session lifecycle)
# The UI parses the prefix and renders a merged table.
echo "Content-Type: text/plain; charset=utf-8"
echo ""

# Wifi association events (hostapd runs with -t: epoch timestamps)
grep -E 'AP-STA-(CONNECTED|DISCONNECTED)|disassociated|deauthenticated' /var/log/hostapd 2>/dev/null \
	| tail -n 60 | sed 's/^/hostapd /'

# AA session lifecycle events from aawgd
{ cat /var/log/messages.0 2>/dev/null; cat /var/log/messages 2>/dev/null; } \
	| grep -E 'aawgd.*(Tcp server accepted connection|Forwarding data between|Forwarding stopped|handshake complete|handshake read failed|Enabled accessory gadget|Failed to connect)' \
	| tail -n 60 | sed 's/^/aawgd /'
exit 0
