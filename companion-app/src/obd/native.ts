import { NativeModules } from 'react-native';

// Bridge to the native RFCOMM/SPP link (android/.../pairing/AawgObdModule).
interface AawgObdNative {
  isConnected(): Promise<boolean>;
  connect(address: string): Promise<boolean>;
  command(cmd: string, timeoutMs: number): Promise<string>;
  disconnect(): Promise<boolean>;
}

const native: AawgObdNative | undefined = NativeModules.AawgObd;

export function obdAvailable(): boolean {
  return !!native;
}

export async function obdConnect(address: string): Promise<void> {
  if (!native) throw new Error('OBD module unavailable');
  await native.connect(address);
}

export async function obdCommand(cmd: string, timeoutMs = 1500): Promise<string> {
  if (!native) throw new Error('OBD module unavailable');
  return native.command(cmd, timeoutMs);
}

export async function obdDisconnect(): Promise<void> {
  if (!native) return;
  try {
    await native.disconnect();
  } catch {
    // ignore
  }
}

export async function obdIsConnected(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isConnected();
  } catch {
    return false;
  }
}
