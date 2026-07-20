// Traccar OsmAnd protocol client. Traccar's OsmAnd endpoint accepts a simple
// HTTP request with position plus arbitrary named attributes, so we attach the
// OBD readings alongside the phone's GPS fix. Configure a matching device in
// Traccar with the same identifier.
//
// Endpoint form: http(s)://<host>:5055/?id=<id>&lat=..&lon=..&timestamp=..&
//   speed=..&altitude=..&heading=..&<custom>=..

import { GpsFix } from './native';
import { ObdReadings, fuelPer100km } from '../obd/pids';

export interface TraccarConfig {
  url: string; // full base, e.g. https://demo.traccar.org:5055
  deviceId: string;
}

// speed is sent in knots per the OsmAnd convention (Traccar converts).
const MS_TO_KNOTS = 1.943844;

export function buildUrl(cfg: TraccarConfig, fix: GpsFix, obd: ObdReadings): string {
  const base = cfg.url.replace(/\/$/, '');
  const p = new Map<string, string>();
  p.set('id', cfg.deviceId);
  p.set('lat', fix.lat.toFixed(6));
  p.set('lon', fix.lon.toFixed(6));
  p.set('timestamp', Math.round(fix.time / 1000).toString());
  if (fix.speed != null) p.set('speed', (fix.speed * MS_TO_KNOTS).toFixed(2));
  if (fix.altitude != null) p.set('altitude', fix.altitude.toFixed(1));
  if (fix.bearing != null) p.set('heading', fix.bearing.toFixed(0));
  if (fix.accuracy != null) p.set('accuracy', fix.accuracy.toFixed(0));

  // OBD attributes (Traccar stores unknown params as computed attributes).
  const add = (k: string, v: number | null | undefined, digits = 0) => {
    if (v != null && !Number.isNaN(v)) p.set(k, v.toFixed(digits));
  };
  add('rpm', obd.rpm);
  add('coolantTemp', obd.coolant);
  add('engineLoad', obd.load);
  add('throttle', obd.throttle);
  add('power', obd.voltage, 1); // control-module voltage
  add('fuel', obd.fuelLevel); // % level
  add('fuelConsumption', fuelPer100km(obd), 1); // L/100km
  add('obdSpeed', obd.speed);

  const qs = [...p.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${base}/?${qs}`;
}

// Returns true on a 2xx from Traccar.
export async function sendFix(cfg: TraccarConfig, fix: GpsFix, obd: ObdReadings): Promise<boolean> {
  if (!cfg.url || !cfg.deviceId) return false;
  try {
    const res = await fetch(buildUrl(cfg, fix, obd), { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
