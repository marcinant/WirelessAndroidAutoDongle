#!/bin/sh
# Sample ring buffer collected by aawg-statsd, as CSV:
# uptime_s,rx_bytes,tx_bytes,signal_dbm,tx_retries,tx_failed,rtt_ms,aa_session
echo "Content-Type: text/plain; charset=utf-8"
echo ""

tail -n 600 /var/run/aawg-stats.csv 2>/dev/null
exit 0
