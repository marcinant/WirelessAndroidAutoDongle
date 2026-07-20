// ELM327 session: init handshake, PID polling, and rule-based health checks.
// Runs over whichever transport is active (Bluetooth, TCP, or the built-in
// demo simulator) — see transport.ts.

import { getTransport } from './transport';
import { PIDS, ObdReadings, parseData, fuelPer100km } from './pids';

// Open the link and put the ELM327 into a clean, quiet state:
// echo off, linefeeds off, headers off, automatic protocol.
export async function elmConnect(target: string): Promise<void> {
  const t = getTransport();
  await t.connect(target);
  await t.command('ATZ', 2500); // reset
  for (const cmd of ['ATE0', 'ATL0', 'ATH0', 'ATSP0']) {
    await t.command(cmd, 1500);
  }
  await t.command('0100', 3000); // wake the protocol / probe supported PIDs
}

export async function elmDisconnect(): Promise<void> {
  await getTransport().disconnect();
}

// Poll the given PID keys once, sequentially (the link is a serial line).
// Unsupported or unanswered PIDs are simply omitted from the result.
export async function poll(keys: (keyof typeof PIDS)[]): Promise<ObdReadings> {
  const t = getTransport();
  const out: ObdReadings = {};
  for (const key of keys) {
    const pid = PIDS[key];
    try {
      const raw = await t.command(pid.cmd, 1200);
      const bytes = parseData(raw, pid.pid);
      if (bytes) {
        const v = pid.parse(bytes);
        if (v != null && !Number.isNaN(v)) out[key] = v;
      }
    } catch {
      // skip this PID this round
    }
  }
  return out;
}

export { fuelPer100km };

export type AlertLevel = 'warn' | 'bad';
export interface HealthAlert {
  level: AlertLevel;
  key: string; // i18n key
  params?: Record<string, string | number>;
}

// Rule-based health signals — deliberately conservative and explainable, not
// a failure-prediction model (generic OBD-II lacks the data for that).
export function healthAlerts(r: ObdReadings): HealthAlert[] {
  const out: HealthAlert[] = [];
  if (r.coolant != null && r.coolant >= 112) {
    out.push({ level: 'bad', key: 'obd.alert.overheat', params: { v: Math.round(r.coolant) } });
  } else if (r.coolant != null && r.coolant >= 105) {
    out.push({ level: 'warn', key: 'obd.alert.hot', params: { v: Math.round(r.coolant) } });
  }
  if (r.voltage != null && r.voltage > 0 && r.voltage < 12.2) {
    out.push({ level: 'warn', key: 'obd.alert.voltage', params: { v: r.voltage.toFixed(1) } });
  }
  const trim = (r.stft ?? 0) + (r.ltft ?? 0);
  if ((r.stft != null || r.ltft != null) && Math.abs(trim) > 20) {
    out.push({ level: 'warn', key: 'obd.alert.trim', params: { v: trim.toFixed(0) } });
  }
  return out;
}
