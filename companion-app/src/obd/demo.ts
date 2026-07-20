// Built-in ELM327 simulator. Answers the same AT/PID commands the protocol
// layer sends, with a small physical model of a warming-up, gently driven
// petrol engine — so every screen (gauges, fuel calc, DTCs, alerts, Traccar
// attributes) can be exercised on an emulator with zero hardware.
//
// One deliberately injected story: after ~2 minutes the simulated engine
// stores a P0301 (cylinder 1 misfire) so the DTC read/clear flow can be shown.

let connectedAt = 0;
let dtcCleared = false;

function hex(n: number, bytes: number): string {
  return Math.max(0, Math.round(n))
    .toString(16)
    .toUpperCase()
    .padStart(bytes * 2, '0');
}

// Engine state derived from elapsed time — deterministic-ish but lively.
function engineState() {
  const t = (Date.now() - connectedAt) / 1000;
  const warm = Math.min(1, t / 180); // fully warm after 3 min
  const cruise = Math.sin(t / 17) * 0.5 + 0.5; // slow load/speed waves
  const jitter = Math.sin(t * 2.7) * 0.5 + Math.sin(t * 1.3) * 0.5;

  const rpm = 850 + cruise * 2200 + jitter * 60;
  const speed = Math.max(0, cruise * 90 - 8); // idles at 0
  const coolant = 18 + warm * 72 + Math.sin(t / 40) * 2; // 18 -> ~90 °C
  const load = 18 + cruise * 45;
  const maf = 3 + (rpm / 1000) * (load / 30); // g/s, rough
  const throttle = 12 + cruise * 30;
  const voltage = 14.2 - cruise * 0.25 + Math.sin(t / 9) * 0.05;
  const fuelLevel = Math.max(5, 68 - t / 120); // slowly draining
  const intake = 15 + warm * 20;
  const stft = 1.5 + Math.sin(t / 23) * 3;
  const ltft = 4.7; // slightly high on purpose (interesting but not alarming)
  return { rpm, speed, coolant, load, maf, throttle, voltage, fuelLevel, intake, stft, ltft };
}

export async function demoConnect(): Promise<void> {
  connectedAt = Date.now();
  dtcCleared = false;
}

export async function demoDisconnect(): Promise<void> {
  connectedAt = 0;
}

export async function demoCommand(cmd: string): Promise<string> {
  const c = cmd.trim().toUpperCase();
  // AT commands: acknowledge like a real ELM327.
  if (c.startsWith('AT')) return c === 'ATZ' ? 'ELM327 v1.5 (demo)' : 'OK';

  const s = engineState();
  const trim = (v: number) => hex(v * 1.28 + 128, 1); // percent -> (A-128)*100/128

  switch (c) {
    case '0100': return '41 00 BE 3F A8 13';
    case '010C': return '410C' + hex(s.rpm * 4, 2);
    case '010D': return '410D' + hex(s.speed, 1);
    case '0105': return '4105' + hex(s.coolant + 40, 1);
    case '0104': return '4104' + hex((s.load * 255) / 100, 1);
    case '0110': return '4110' + hex(s.maf * 100, 2);
    case '0111': return '4111' + hex((s.throttle * 255) / 100, 1);
    case '0142': return '4142' + hex(s.voltage * 1000, 2);
    case '012F': return '412F' + hex((s.fuelLevel * 255) / 100, 1);
    case '010F': return '410F' + hex(s.intake + 40, 1);
    case '0106': return '4106' + trim(s.stft);
    case '0107': return '4107' + trim(s.ltft);
    case '015E': return 'NO DATA'; // force the MAF-based fuel estimate path
    case '03': {
      // Stored DTCs: P0301 appears after 2 minutes, until cleared.
      const misfire = !dtcCleared && Date.now() - connectedAt > 120000;
      return misfire ? '43 03 01 00 00 00 00' : '43 00 00 00 00 00 00';
    }
    case '04':
      dtcCleared = true;
      return '44';
    default:
      return 'NO DATA';
  }
}
