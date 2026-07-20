// Helpers for the ";"-separated fields the status endpoint returns.

export interface WifiStation {
  mac: string;
  signalDbm: number | null;
}

export function parseWifiStations(s: string): WifiStation[] {
  return s
    .split(';')
    .map(e => e.trim())
    .filter(Boolean)
    .map(e => {
      // "aa:bb:.. -58 dBm"
      const parts = e.split(/\s+/);
      const sig = parts.find(p => /^-?\d+$/.test(p));
      return { mac: parts[0] || e, signalDbm: sig ? Number(sig) : null };
    });
}

export function parseBtDevices(s: string): string[] {
  return s
    .split(';')
    .map(e => e.trim())
    .filter(Boolean);
}

export function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (d ? `${d}d ` : '') + `${h}h ${m}m`;
}
