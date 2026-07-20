// OBD-II mode 01 PID definitions and response parsing.
//
// With ELM327 echo and headers off, a reply to "010C" looks like "410C1AF8"
// (possibly with spaces/newlines and a "SEARCHING..." preamble on the first
// query). parseData() strips all that and returns the data bytes that follow
// the "41 <pid>" header.

export interface Pid {
  key: string;
  cmd: string; // e.g. "010C"
  pid: string; // e.g. "0C"
  parse: (b: number[]) => number | null;
}

// Extract the data bytes after the "41<pid>" service response header.
export function parseData(raw: string, pid: string): number[] | null {
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
  const header = '41' + pid.toUpperCase();
  const i = hex.indexOf(header);
  if (i < 0) return null;
  const body = hex.slice(i + header.length);
  const bytes: number[] = [];
  for (let j = 0; j + 1 < body.length; j += 2) {
    bytes.push(parseInt(body.substr(j, 2), 16));
  }
  return bytes;
}

const A = (b: number[]) => (b.length > 0 ? b[0] : null);
const AB = (b: number[]) => (b.length > 1 ? b[0] * 256 + b[1] : null);

export const PIDS: Record<string, Pid> = {
  rpm: { key: 'rpm', cmd: '010C', pid: '0C', parse: b => (AB(b) != null ? AB(b)! / 4 : null) },
  speed: { key: 'speed', cmd: '010D', pid: '0D', parse: A },
  coolant: { key: 'coolant', cmd: '0105', pid: '05', parse: b => (A(b) != null ? A(b)! - 40 : null) },
  load: { key: 'load', cmd: '0104', pid: '04', parse: b => (A(b) != null ? (A(b)! * 100) / 255 : null) },
  maf: { key: 'maf', cmd: '0110', pid: '10', parse: b => (AB(b) != null ? AB(b)! / 100 : null) },
  intake: { key: 'intake', cmd: '010F', pid: '0F', parse: b => (A(b) != null ? A(b)! - 40 : null) },
  throttle: { key: 'throttle', cmd: '0111', pid: '11', parse: b => (A(b) != null ? (A(b)! * 100) / 255 : null) },
  map: { key: 'map', cmd: '010B', pid: '0B', parse: A },
  voltage: { key: 'voltage', cmd: '0142', pid: '42', parse: b => (AB(b) != null ? AB(b)! / 1000 : null) },
  fuelLevel: { key: 'fuelLevel', cmd: '012F', pid: '2F', parse: b => (A(b) != null ? (A(b)! * 100) / 255 : null) },
  fuelRate: { key: 'fuelRate', cmd: '015E', pid: '5E', parse: b => (AB(b) != null ? AB(b)! / 20 : null) },
  ambient: { key: 'ambient', cmd: '0146', pid: '46', parse: b => (A(b) != null ? A(b)! - 40 : null) },
  // Short/long term fuel trim bank 1 (percent): (A-128)*100/128
  stft: { key: 'stft', cmd: '0106', pid: '06', parse: b => (A(b) != null ? ((A(b)! - 128) * 100) / 128 : null) },
  ltft: { key: 'ltft', cmd: '0107', pid: '07', parse: b => (A(b) != null ? ((A(b)! - 128) * 100) / 128 : null) },
};

export type ObdReadings = Partial<Record<keyof typeof PIDS, number>>;

// L/100km from either a direct fuel-rate PID or a MAF-based estimate.
// Petrol assumptions: stoichiometric AFR 14.7, density 745 g/L.
export function fuelPer100km(r: ObdReadings): number | null {
  const speed = r.speed ?? null;
  if (speed == null || speed < 3) return null; // meaningless when stopped
  let litresPerHour: number | null = null;
  if (r.fuelRate != null && r.fuelRate > 0) {
    litresPerHour = r.fuelRate;
  } else if (r.maf != null && r.maf > 0) {
    // g/s fuel = MAF / AFR; L/h = g/s * 3600 / density
    litresPerHour = (r.maf / 14.7) * 3600 / 745;
  }
  if (litresPerHour == null) return null;
  return (litresPerHour / speed) * 100;
}
