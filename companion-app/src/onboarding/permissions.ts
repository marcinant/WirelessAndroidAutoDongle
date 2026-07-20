import { PermissionsAndroid, Platform } from 'react-native';

// Runtime permissions the onboarding needs. BLE scanning requires the new
// Android 12+ BLUETOOTH_SCAN/CONNECT split; older devices fall back to
// fine-location (BLE scan historically gated on location). WiFi join via
// WifiNetworkSpecification also wants location on some OEMs.
export async function requestOnboardingPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;

  const perms: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (api >= 31) {
    perms.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  }

  const result = (await PermissionsAndroid.requestMultiple(perms as any)) as Record<string, string>;
  return perms.every(p => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}
