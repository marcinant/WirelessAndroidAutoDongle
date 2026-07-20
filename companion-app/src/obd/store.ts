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

export interface TraccarStore {
  url: string;
  deviceId: string;
  intervalS: string;
}

// Which OBD transport the user works with; 'tcp' keeps its host:port target.
export interface TransportStore {
  kind: 'bt' | 'tcp' | 'demo';
  tcpTarget: string;
}

const ADAPTER_KEY = 'aawg.obd.adapter';
const HA_KEY = 'aawg.obd.ha';
const TRACCAR_KEY = 'aawg.obd.traccar';
const TRANSPORT_KEY = 'aawg.obd.transport';

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

export async function loadTransport(): Promise<TransportStore> {
  const raw = await AsyncStorage.getItem(TRANSPORT_KEY);
  return raw ? (JSON.parse(raw) as TransportStore) : { kind: 'bt', tcpTarget: '192.168.0.10:35000' };
}
export async function saveTransport(c: TransportStore): Promise<void> {
  await AsyncStorage.setItem(TRANSPORT_KEY, JSON.stringify(c));
}

export async function loadTraccar(): Promise<TraccarStore> {
  const raw = await AsyncStorage.getItem(TRACCAR_KEY);
  return raw ? (JSON.parse(raw) as TraccarStore) : { url: '', deviceId: '', intervalS: '15' };
}
export async function saveTraccar(c: TraccarStore): Promise<void> {
  await AsyncStorage.setItem(TRACCAR_KEY, JSON.stringify(c));
}
