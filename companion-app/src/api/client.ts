// Native client for the dongle's on-board CGI API. Same endpoints the web UI
// at http://10.0.0.1/ uses; the app just renders them natively. All requests
// go to the dongle's AP gateway, so they only succeed while the phone is
// joined to the dongle wifi (see WifiManager in the onboarding flow).

import {
  ConnectionEvent,
  DongleStatus,
  HaSettings,
  StatsSample,
  StatsSeries,
} from './types';

export const DONGLE_HOST = '10.0.0.1';
const BASE = `http://${DONGLE_HOST}`;

// The dongle can be protected with HTTP basic auth (AAWG_WEBUI_PASSWORD).
// When set, every request carries the header.
let authHeader: string | null = null;
export function setWebuiPassword(password: string | null) {
  authHeader = password ? 'Basic ' + base64('admin:' + password) : null;
}

function base64(s: string): string {
  // btoa is not always present in the RN runtime; do it by hand.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < s.length; ) {
    const a = s.charCodeAt(i++);
    const b = i < s.length ? s.charCodeAt(i++) : NaN;
    const c = i < s.length ? s.charCodeAt(i++) : NaN;
    const e1 = a >> 2;
    const e2 = ((a & 3) << 4) | (b >> 4);
    const e3 = isNaN(b) ? 64 : ((b & 15) << 2) | (c >> 6);
    const e4 = isNaN(c) ? 64 : c & 63;
    out += chars[e1] + chars[e2] + (e3 === 64 ? '=' : chars[e3]) + (e4 === 64 ? '=' : chars[e4]);
  }
  return out;
}

async function req(path: string, opts: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
    if (authHeader) headers.Authorization = authHeader;
    return await fetch(BASE + path, { ...opts, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getStatus(): Promise<DongleStatus> {
  const r = await req('/cgi-bin/status.cgi');
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()) as DongleStatus;
}

// Quick reachability probe used by the onboarding "are we on the dongle" check.
export async function ping(timeoutMs = 3000): Promise<boolean> {
  try {
    const r = await req('/cgi-bin/status.cgi', {}, timeoutMs);
    return r.ok;
  } catch {
    return false;
  }
}

function parseStatsCsv(text: string): StatsSample[] {
  const rows: StatsSample[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split(',');
    if (c.length < 8) continue;
    const num = (s: string) => (s === '' ? null : Number(s));
    rows.push({
      uptime_s: Number(c[0]),
      rx_bytes: Number(c[1]),
      tx_bytes: Number(c[2]),
      signal_dbm: num(c[3]),
      tx_retries: num(c[4]),
      tx_failed: num(c[5]),
      rtt_ms: num(c[6]),
      aa_session: c[7].trim() === '1',
    });
  }
  return rows;
}

// Turn the raw sample buffer into per-interval throughput series. Byte counters
// are cumulative interface totals, so throughput is the delta over the sample
// gap (mirrors the web UI's derivation exactly).
export function toSeries(rows: StatsSample[]): StatsSeries {
  const downMbps: (number | null)[] = [];
  const upMbps: (number | null)[] = [];
  const rttMs: (number | null)[] = [];
  const signalDbm: (number | null)[] = [];
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].uptime_s - rows[i - 1].uptime_s;
    const drx = rows[i].rx_bytes - rows[i - 1].rx_bytes;
    const dtx = rows[i].tx_bytes - rows[i - 1].tx_bytes;
    const valid = dt > 0 && dt < 30;
    // rx on the AP = data from the phone (the AA stream heading to the car).
    downMbps.push(valid && drx >= 0 ? (drx * 8) / dt / 1e6 : null);
    upMbps.push(valid && dtx >= 0 ? (dtx * 8) / dt / 1e6 : null);
    rttMs.push(rows[i].rtt_ms);
    signalDbm.push(rows[i].signal_dbm);
  }
  const latest = rows.length ? rows[rows.length - 1] : null;
  return { downMbps, upMbps, rttMs, signalDbm, latest, wifiFailed: latest?.tx_failed ?? null };
}

export async function getStats(): Promise<StatsSeries> {
  const r = await req('/cgi-bin/stats.cgi');
  if (!r.ok) throw new Error(`stats ${r.status}`);
  return toSeries(parseStatsCsv(await r.text()));
}

export async function getEvents(): Promise<ConnectionEvent[]> {
  const r = await req('/cgi-bin/events.cgi');
  if (!r.ok) throw new Error(`events ${r.status}`);
  const out: ConnectionEvent[] = [];
  for (const line of (await r.text()).split('\n')) {
    if (!line) continue;
    const m = line.match(/^hostapd (\d+)\.\d+: (.*)$/);
    if (m) out.push({ source: 'wifi', time: Number(m[1]), text: m[2] });
    else out.push({ source: 'aa', time: null, text: line.replace(/^aawgd /, '') });
  }
  return out;
}

export async function getLog(lines = 300): Promise<string> {
  const r = await req(`/cgi-bin/logs.cgi?n=${lines}`);
  if (!r.ok) throw new Error(`logs ${r.status}`);
  return r.text();
}

export async function getConfig(): Promise<string> {
  const r = await req('/cgi-bin/config.cgi');
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.text();
}

export async function saveConfig(text: string): Promise<{ ok: boolean; note?: string; error?: string }> {
  const r = await req('/cgi-bin/config.cgi', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  });
  return r.json();
}

export async function getHa(): Promise<HaSettings> {
  const r = await req('/cgi-bin/ha.cgi');
  if (!r.ok) throw new Error(`ha ${r.status}`);
  return (await r.json()) as HaSettings;
}

export async function saveHa(
  s: Pick<HaSettings, 'url' | 'token' | 'entity'>,
): Promise<{ ok: boolean; note?: string; error?: string }> {
  const body = `action=save\nurl=${s.url}\ntoken=${s.token}\nentity=${s.entity}`;
  const r = await req('/cgi-bin/ha.cgi', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  return r.json();
}

export async function testHa(
  s: Pick<HaSettings, 'url' | 'token' | 'entity'>,
): Promise<{ ok: boolean; note?: string; error?: string; hint?: string }> {
  const body = `action=test\nurl=${s.url}\ntoken=${s.token}\nentity=${s.entity}`;
  const r = await req('/cgi-bin/ha.cgi', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  return r.json();
}

export async function reboot(): Promise<void> {
  await req('/cgi-bin/reboot.cgi', { method: 'POST' }, 3000).catch(() => {});
}
