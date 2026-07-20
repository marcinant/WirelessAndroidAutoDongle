import { NativeEventEmitter, NativeModules } from 'react-native';

// Bridges to the native location stream and the tracking foreground service.

export interface GpsFix {
  lat: number;
  lon: number;
  time: number; // epoch ms
  speed?: number; // m/s
  altitude?: number;
  bearing?: number;
  accuracy?: number;
}

interface LocationNative {
  start(minIntervalMs: number, minMeters: number): Promise<boolean>;
  stop(): Promise<boolean>;
}
interface ForegroundNative {
  start(title: string, text: string): Promise<boolean>;
  stop(): Promise<boolean>;
}

const loc: LocationNative | undefined = NativeModules.AawgLocation;
const fg: ForegroundNative | undefined = NativeModules.AawgForeground;
const emitter = loc ? new NativeEventEmitter(NativeModules.AawgLocation) : null;

export function trackingAvailable(): boolean {
  return !!loc && !!fg;
}

export function onGpsFix(cb: (fix: GpsFix) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('AawgLocation', cb);
  return () => sub.remove();
}

export async function startLocation(minIntervalMs = 5000, minMeters = 5): Promise<void> {
  if (!loc) throw new Error('location module unavailable');
  await loc.start(minIntervalMs, minMeters);
}
export async function stopLocation(): Promise<void> {
  if (loc) await loc.stop().catch(() => {});
}

export async function startForeground(title: string, text: string): Promise<void> {
  if (!fg) throw new Error('foreground module unavailable');
  await fg.start(title, text);
}
export async function stopForeground(): Promise<void> {
  if (fg) await fg.stop().catch(() => {});
}
