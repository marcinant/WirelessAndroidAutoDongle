import { Linking, NativeEventEmitter, NativeModules, Platform } from 'react-native';

// Bridge to the native classic-Bluetooth discovery/bond module
// (android/.../pairing/AawgPairingModule). The dongle is a classic BR/EDR
// device; this module inquires for it, resolves its name, and bonds it the
// same way system Settings does.

export interface FoundDevice {
  address: string;
  name: string;
  bonded: boolean;
  rssi?: number;
}

interface AawgPairingNative {
  isBluetoothOn(): Promise<boolean>;
  startDiscovery(): Promise<boolean>;
  cancelDiscovery(): Promise<boolean>;
  bondDevice(address: string): Promise<{ name: string; mac: string }>;
}

const native: AawgPairingNative | undefined = NativeModules.AawgPairing;
const emitter = native ? new NativeEventEmitter(NativeModules.AawgPairing) : null;

export function pairingAvailable(): boolean {
  return Platform.OS === 'android' && !!native;
}

export async function isBluetoothOn(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isBluetoothOn();
  } catch {
    return false;
  }
}

// Subscribe to discovered devices. Returns an unsubscribe function. The same
// device can be reported more than once (e.g. when its name resolves late);
// callers should dedupe by address.
export function onDeviceFound(cb: (d: FoundDevice) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('AawgDeviceFound', cb);
  return () => sub.remove();
}

export function onDiscoveryFinished(cb: () => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('AawgDiscoveryFinished', cb);
  return () => sub.remove();
}

export async function startDiscovery(): Promise<void> {
  if (!native) throw new Error('pairing module unavailable');
  await native.startDiscovery();
}

export async function cancelDiscovery(): Promise<void> {
  if (!native) return;
  try {
    await native.cancelDiscovery();
  } catch {
    // ignore
  }
}

export async function bondDevice(address: string): Promise<{ name: string; mac: string }> {
  if (!native) throw new Error('pairing module unavailable');
  return native.bondDevice(address);
}

export async function openBluetoothSettings(): Promise<void> {
  await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() =>
    Linking.openSettings(),
  );
}
