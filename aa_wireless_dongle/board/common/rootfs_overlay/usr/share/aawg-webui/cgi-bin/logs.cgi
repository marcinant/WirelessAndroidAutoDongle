#!/bin/sh
# Tail of the system log for the aawg web UI.
# Optional query: n=<lines> (default 200, max 2000)
echo "Content-Type: text/plain; charset=utf-8"
echo ""

N=200
case "$QUERY_STRING" in
	n=*)
		N=$(echo "$QUERY_STRING" | sed 's/^n=//' | tr -cd '0-9')
		;;
esac
[ -z "$N" ] && N=200
[ "$N" -gt 2000 ] && N=2000

# Include the rotated file so the view survives a rotation boundary
if [ -f /var/log/messages.0 ]; then
	cat /var/log/messages.0 /var/log/messages 2>/dev/null | tail -n "$N"
else
	tail -n "$N" /var/log/messages 2>/dev/null
fi
exit 0
