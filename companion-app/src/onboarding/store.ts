import AsyncStorage from '@react-native-async-storage/async-storage';

// A dongle the user has set up. Identified by `id` (its bonded BT MAC when
// known, else a synthesised id) so multiple dongles can be stored side by side.
export interface SavedDongle {
  id: string;
  label: string; // user-facing name, defaults to btName or ssid
  ssid: string;
  wifiPassword: string;
  webuiPassword: string | null;
  btName: string | null; // "AudiAndroidAuto-xxxxxx"
  btMac: string | null;
}

const LIST_KEY = 'aawg.dongles';
const LEGACY_KEY = 'aawg.dongle';

function makeId(d: { btMac: string | null; ssid: string }): string {
  return d.btMac || `${d.ssid}-${Date.now()}`;
}

export async function loadDongles(): Promise<SavedDongle[]> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  if (raw) return JSON.parse(raw) as SavedDongle[];

  // One-time migration from the old single-dongle key.
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const d = JSON.parse(legacy);
    const migrated: SavedDongle = {
      id: makeId(d),
      label: d.btName || d.ssid,
      ssid: d.ssid,
      wifiPassword: d.wifiPassword,
      webuiPassword: d.webuiPassword ?? null,
      btName: d.btName ?? null,
      btMac: d.btMac ?? null,
    };
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify([migrated]));
    await AsyncStorage.removeItem(LEGACY_KEY);
    return [migrated];
  }
  return [];
}

async function saveList(list: SavedDongle[]): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}

// Add or update a dongle (matched by id). Returns the new list.
export async function upsertDongle(
  d: Omit<SavedDongle, 'id' | 'label'> & { id?: string; label?: string },
): Promise<SavedDongle[]> {
  const list = await loadDongles();
  const id = d.id || makeId(d);
  const label = d.label || d.btName || d.ssid;
  const entry: SavedDongle = {
    id,
    label,
    ssid: d.ssid,
    wifiPassword: d.wifiPassword,
    webuiPassword: d.webuiPassword,
    btName: d.btName,
    btMac: d.btMac,
  };
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await saveList(list);
  return list;
}

export async function removeDongle(id: string): Promise<SavedDongle[]> {
  const list = (await loadDongles()).filter(d => d.id !== id);
  await saveList(list);
  return list;
}

export async function renameDongle(id: string, label: string): Promise<SavedDongle[]> {
  const list = await loadDongles();
  const d = list.find(x => x.id === id);
  if (d) d.label = label;
  await saveList(list);
  return list;
}

// The stock image ships with these AP defaults (board/common/rootfs_overlay).
export const DEFAULT_SSID = 'AAWirelessDongle';
export const DEFAULT_WIFI_PASSWORD = 'ConnectAAWirelessDongle';
export const BT_NAME_PREFIX = 'AudiAndroidAuto-';
