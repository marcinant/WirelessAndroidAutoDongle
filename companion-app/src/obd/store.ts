import AsyncStorage from '@react-native-async-storage/async-storage';

// The bonded ELM327 adapter and the app-level Home Assistant target used to
// push car telemetry (over the phone's mobile data, independent of the dongle).
export interface ObdAdapter {
  address: string;
  name: string;
}
export interface ObdHaConfig {
  url: string;
  token: string;
  prefix: string; // entity id prefix, e.g. "sensor.car"
}

const ADAPTER_KEY = 'aawg.obd.adapter';
const HA_KEY = 'aawg.obd.ha';

export async function loadAdapter(): Promise<ObdAdapter | null> {
  const raw = await AsyncStorage.getItem(ADAPTER_KEY);
  return raw ? (JSON.parse(raw) as ObdAdapter) : null;
}
export async function saveAdapter(a: ObdAdapter): Promise<void> {
  await AsyncStorage.setItem(ADAPTER_KEY, JSON.stringify(a));
}
export async function clearAdapter(): Promise<void> {
  await AsyncStorage.removeItem(ADAPTER_KEY);
}

export async function loadObdHa(): Promise<ObdHaConfig> {
  const raw = await AsyncStorage.getItem(HA_KEY);
  return raw ? (JSON.parse(raw) as ObdHaConfig) : { url: '', token: '', prefix: 'sensor.car' };
}
export async function saveObdHa(c: ObdHaConfig): Promise<void> {
  await AsyncStorage.setItem(HA_KEY, JSON.stringify(c));
}
