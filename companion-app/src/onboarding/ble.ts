import { BleManager, Device, State } from 'react-native-ble-plx';
import { BT_NAME_PREFIX } from './store';

// The dongle advertises a BLE peripheral named "AudiAndroidAuto-<hash>" (see
// aawgd bluetoothHandler startAdvertising). We scan for that name so the app
// can confirm "a dongle is powered on and nearby" before asking the user to
// pair — the same detection the Fast Pair half-sheet would have done, minus
// Google's registration gate.

let manager: BleManager | null = null;
function mgr(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export interface FoundDongle {
  id: string; // BLE device id (MAC on Android)
  name: string;
  rssi: number | null;
}

export async function bluetoothReady(): Promise<boolean> {
  const state = await mgr().state();
  return state === State.PoweredOn;
}

// Scan for `timeoutMs`, resolving with the strongest-signal dongle seen, or
// null if none appeared. onSighting fires live so the UI can react instantly.
export function scanForDongle(
  timeoutMs: number,
  onSighting?: (d: FoundDongle) => void,
): Promise<FoundDongle | null> {
  return new Promise((resolve, reject) => {
    const seen = new Map<string, FoundDongle>();
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      mgr().stopDeviceScan();
      clearTimeout(timer);
      if (err) return reject(err);
      const best = [...seen.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))[0];
      resolve(best ?? null);
    };

    const timer = setTimeout(() => finish(), timeoutMs);

    mgr().startDeviceScan(null, { allowDuplicates: true }, (error, device: Device | null) => {
      if (error) return finish(error);
      if (!device?.name || !device.name.startsWith(BT_NAME_PREFIX)) return;
      const found: FoundDongle = { id: device.id, name: device.name, rssi: device.rssi };
      seen.set(device.id, found);
      onSighting?.(found);
    });
  });
}

export function destroyBle() {
  manager?.destroy();
  manager = null;
}
