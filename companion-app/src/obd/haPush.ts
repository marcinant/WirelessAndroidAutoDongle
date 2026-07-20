// Push OBD telemetry to Home Assistant over the phone's internet (works on
// LTE; not while the phone is bound to the dongle's AP). Each metric becomes a
// sensor state via the REST API, mirroring the token flow the dongle uses.

import { ObdHaConfig } from './store';
import { ObdReadings, fuelPer100km } from './pids';

interface StateBody {
  suffix: string;
  state: string;
  unit?: string;
  name: string;
}

function metrics(r: ObdReadings): StateBody[] {
  const out: StateBody[] = [];
  const add = (suffix: string, v: number | null | undefined, unit: string, name: string, digits = 0) => {
    if (v != null && !Number.isNaN(v)) out.push({ suffix, state: v.toFixed(digits), unit, name });
  };
  add('coolant', r.coolant, '°C', 'Coolant temperature');
  add('rpm', r.rpm, 'rpm', 'Engine RPM');
  add('speed', r.speed, 'km/h', 'Vehicle speed');
  add('voltage', r.voltage, 'V', 'Control module voltage', 1);
  add('fuel_level', r.fuelLevel, '%', 'Fuel level');
  add('fuel_l100', fuelPer100km(r), 'L/100km', 'Fuel consumption', 1);
  return out;
}

// Returns the number of metrics successfully posted.
export async function pushReadings(cfg: ObdHaConfig, r: ObdReadings): Promise<number> {
  if (!cfg.url || !cfg.token) return 0;
  const base = cfg.url.replace(/\/$/, '');
  const prefix = (cfg.prefix || 'sensor.car').replace(/\.$/, '');
  let ok = 0;
  for (const m of metrics(r)) {
    const entity = `${prefix}_${m.suffix}`;
    const body = JSON.stringify({
      state: m.state,
      attributes: { unit_of_measurement: m.unit, friendly_name: m.name },
    });
    try {
      const res = await fetch(`${base}/api/states/${entity}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) ok++;
    } catch {
      // best effort
    }
  }
  return ok;
}
