import { Linking, NativeModules, Platform } from 'react-native';

// Bridge to the native CompanionDeviceManager module (android/.../pairing).
// Degrades gracefully: if the module is missing or the OS lacks companion
// setup, the caller can fall back to opening system Bluetooth settings.

interface PairResult {
  name: string;
  mac: string;
}
interface AawgPairingNative {
  isSupported(): Promise<boolean>;
  associate(namePrefix: string): Promise<PairResult>;
}

const native: AawgPairingNative | undefined = NativeModules.AawgPairing;

export async function pairingSupported(): Promise<boolean> {
  if (Platform.OS !== 'android' || !native) return false;
  try {
    return await native.isSupported();
  } catch {
    return false;
  }
}

// Show the system association dialog for "AudiAndroidAuto-*" and bond the pick.
export async function pairDongle(namePrefix: string): Promise<PairResult> {
  if (!native) throw new Error('pairing module unavailable');
  return native.associate(namePrefix);
}

export async function openBluetoothSettings(): Promise<void> {
  await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() =>
    Linking.openSettings(),
  );
}
