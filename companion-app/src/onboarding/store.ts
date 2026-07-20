import AsyncStorage from '@react-native-async-storage/async-storage';

// Remembered dongle so returning users skip straight to the dashboard.
export interface SavedDongle {
  ssid: string;
  wifiPassword: string;
  webuiPassword: string | null;
  btName: string | null; // "AudiAndroidAuto-xxxxxx"
  btMac: string | null;
}

const KEY = 'aawg.dongle';

export async function loadDongle(): Promise<SavedDongle | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as SavedDongle) : null;
}

export async function saveDongle(d: SavedDongle): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(d));
}

export async function clearDongle(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// The stock image ships with these AP defaults (board/common/rootfs_overlay).
// The wifi password is a fixed provisioning default so the app can join
// out of the box; users are prompted to change it during setup.
export const DEFAULT_SSID = 'AAWirelessDongle';
export const DEFAULT_WIFI_PASSWORD = 'ConnectAAWirelessDongle';
export const BT_NAME_PREFIX = 'AudiAndroidAuto-';

// Classic-BT name regex for the pairing dialog. Matches this build's name and
// the upstream defaults, so it finds a dongle on any firmware version.
export const DONGLE_NAME_PATTERN = '(AudiAndroidAuto|WirelessAADongle|AndroidAuto-Dongle)-.*';
