import { NativeModules } from 'react-native';

// Bridge to the native TCP ELM327 link (AawgObdTcpModule) — used for the
// ELM327-emulator dev tool and wifi ELM327 clones.
interface AawgObdTcpNative {
  connect(hostPort: string): Promise<boolean>;
  command(cmd: string, timeoutMs: number): Promise<string>;
  disconnect(): Promise<boolean>;
}

const native: AawgObdTcpNative | undefined = NativeModules.AawgObdTcp;

export async function tcpConnect(hostPort: string): Promise<void> {
  if (!native) throw new Error('TCP OBD module unavailable');
  await native.connect(hostPort);
}

export async function tcpCommand(cmd: string, timeoutMs = 1500): Promise<string> {
  if (!native) throw new Error('TCP OBD module unavailable');
  return native.command(cmd, timeoutMs);
}

export async function tcpDisconnect(): Promise<void> {
  if (!native) return;
  try {
    await native.disconnect();
  } catch {
    // ignore
  }
}
