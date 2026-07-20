import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, radius } from '../theme/theme';
import { Card, StatTile, SectionTitle, Button, Field } from '../components/ui';
import { t } from '../i18n';
import { requestOnboardingPermissions } from '../onboarding/permissions';
import {
  startDiscovery,
  cancelDiscovery,
  onDeviceFound,
  bondDevice,
  isBluetoothOn,
  FoundDevice,
} from '../onboarding/pairing';
import { elmConnect, elmDisconnect, poll, healthAlerts, HealthAlert } from '../obd/elm327';
import { ObdReadings, fuelPer100km } from '../obd/pids';
import { readDtcs, clearDtcs } from '../obd/dtc';
import { loadAdapter, saveAdapter, clearAdapter, loadObdHa, saveObdHa, ObdAdapter, ObdHaConfig } from '../obd/store';
import { pushReadings } from '../obd/haPush';

type Props = NativeStackScreenProps<RootStackParamList, 'Obd'>;

const LIVE_PIDS: (keyof ObdReadings)[] = [
  'rpm', 'speed', 'coolant', 'load', 'throttle', 'voltage', 'fuelLevel', 'maf', 'fuelRate', 'stft', 'ltft', 'intake',
];

export default function ObdScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const [adapter, setAdapter] = React.useState<ObdAdapter | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [devices, setDevices] = React.useState<Record<string, FoundDevice>>({});
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [readings, setReadings] = React.useState<ObdReadings>({});
  const [alerts, setAlerts] = React.useState<HealthAlert[]>([]);
  const [dtcs, setDtcs] = React.useState<string[] | null>(null);
  const [dtcBusy, setDtcBusy] = React.useState(false);
  const [ha, setHa] = React.useState<ObdHaConfig>({ url: '', token: '', prefix: 'sensor.car' });
  const [haMsg, setHaMsg] = React.useState('');

  const unsub = React.useRef<() => void>(() => {});
  const pollTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pushCounter = React.useRef(0);

  React.useEffect(() => {
    loadAdapter().then(setAdapter);
    loadObdHa().then(setHa);
    return () => {
      unsub.current();
      cancelDiscovery();
      stopPolling();
      elmDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }

  async function scan() {
    setDevices({});
    const granted = await requestOnboardingPermissions();
    if (!granted) return Alert.alert(t('alert.perms.title'), t('alert.perms.body'));
    if (!(await isBluetoothOn())) return Alert.alert(t('alert.btoff.title'), t('alert.btoff.body'));
    unsub.current();
    unsub.current = onDeviceFound(d => setDevices(prev => ({ ...prev, [d.address]: { ...prev[d.address], ...d } })));
    setScanning(true);
    try {
      await startDiscovery();
    } catch (e: any) {
      Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
      setScanning(false);
    }
  }

  async function pickAdapter(d: FoundDevice) {
    unsub.current();
    await cancelDiscovery();
    setScanning(false);
    try {
      await bondDevice(d.address);
    } catch (e: any) {
      Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
      return;
    }
    const a = { address: d.address, name: d.name || d.address };
    await saveAdapter(a);
    setAdapter(a);
  }

  async function connect() {
    if (!adapter) return;
    setConnecting(true);
    try {
      await elmConnect(adapter.address);
      setConnected(true);
      startPolling();
    } catch (e: any) {
      Alert.alert(t('obd.connfail'), String(e?.message ?? e));
    } finally {
      setConnecting(false);
    }
  }

  function startPolling() {
    stopPolling();
    let inFlight = false;
    pollTimer.current = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await poll(LIVE_PIDS);
        setReadings(r);
        setAlerts(healthAlerts(r));
        // Push to HA every ~30 polls (~30-45s), best effort over LTE.
        if (ha.url && ha.token && ++pushCounter.current % 30 === 0) {
          pushReadings(ha, r);
        }
      } catch {
        // keep going
      } finally {
        inFlight = false;
      }
    }, 1200);
  }

  async function disconnect() {
    stopPolling();
    await elmDisconnect();
    setConnected(false);
    setReadings({});
    setAlerts([]);
  }

  async function onReadDtc() {
    setDtcBusy(true);
    try {
      setDtcs(await readDtcs());
    } catch (e: any) {
      Alert.alert(t('obd.dtc.err'), String(e?.message ?? e));
    } finally {
      setDtcBusy(false);
    }
  }

  function onClearDtc() {
    Alert.alert(t('obd.dtc.clear.title'), t('obd.dtc.clear.body'), [
      { text: t('cfg.cancel'), style: 'cancel' },
      {
        text: t('obd.dtc.clear'),
        style: 'destructive',
        onPress: async () => {
          try {
            await clearDtcs();
            setDtcs([]);
          } catch (e: any) {
            Alert.alert(t('obd.dtc.err'), String(e?.message ?? e));
          }
        },
      },
    ]);
  }

  async function saveHa() {
    await saveObdHa(ha);
    setHaMsg(t('obd.ha.saved'));
  }

  async function forget() {
    await disconnect();
    await clearAdapter();
    setAdapter(null);
  }

  const l100 = fuelPer100km(readings);
  const fmt = (v: number | undefined, digits = 0, unit = '') =>
    v == null ? t('dash.unknown') : `${v.toFixed(digits)}${unit ? ' ' + unit : ''}`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      {!adapter ? (
        <Card>
          <SectionTitle>{t('obd.pick.title')}</SectionTitle>
          <Text style={styles.help}>{t('obd.pick.body')}</Text>
          {Object.values(devices).map(d => (
            <TouchableOpacity key={d.address} style={styles.devRow} onPress={() => pickAdapter(d)}>
              <Text style={styles.devName}>{d.name || d.address}</Text>
              <Text style={styles.devMeta}>{d.address}</Text>
            </TouchableOpacity>
          ))}
          <Button title={scanning ? t('ob.rescan') : t('obd.scan')} onPress={scan} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{adapter.name}</Text>
                <Text style={styles.devMeta}>{adapter.address}</Text>
              </View>
              <View style={[styles.dot, { backgroundColor: connected ? colors.ok : colors.border }]} />
            </View>
            <View style={styles.actions}>
              {connected ? (
                <Button title={t('obd.disconnect')} kind="secondary" onPress={disconnect} />
              ) : (
                <Button title={t('obd.connect')} loading={connecting} onPress={connect} />
              )}
              <Button title={t('obd.forget')} kind="danger" onPress={forget} />
            </View>
          </Card>

          {alerts.length > 0 && (
            <Card style={styles.alertCard}>
              {alerts.map((a, i) => (
                <Text key={i} style={[styles.alert, { color: a.level === 'bad' ? colors.bad : colors.warn }]}>
                  {t(a.key, a.params)}
                </Text>
              ))}
            </Card>
          )}

          <SectionTitle>{t('obd.live')}</SectionTitle>
          <View style={styles.tiles}>
            <StatTile label={t('obd.rpm')} value={fmt(readings.rpm)} />
            <StatTile label={t('obd.speed')} value={fmt(readings.speed, 0, 'km/h')} />
            <StatTile label={t('obd.coolant')} value={fmt(readings.coolant, 0, '°C')} tone={readings.coolant != null && readings.coolant >= 105 ? 'warn' : 'dim'} />
            <StatTile label={t('obd.fuel')} value={l100 == null ? t('dash.unknown') : `${l100.toFixed(1)} L/100km`} tone="ok" />
            <StatTile label={t('obd.load')} value={fmt(readings.load, 0, '%')} />
            <StatTile label={t('obd.throttle')} value={fmt(readings.throttle, 0, '%')} />
            <StatTile label={t('obd.voltage')} value={fmt(readings.voltage, 1, 'V')} tone={readings.voltage != null && readings.voltage < 12.2 ? 'warn' : 'dim'} />
            <StatTile label={t('obd.fuellevel')} value={fmt(readings.fuelLevel, 0, '%')} />
            <StatTile label={t('obd.intake')} value={fmt(readings.intake, 0, '°C')} />
          </View>

          <SectionTitle>{t('obd.dtc.title')}</SectionTitle>
          <Card>
            {dtcs == null ? (
              <Text style={styles.dim}>{t('obd.dtc.unread')}</Text>
            ) : dtcs.length === 0 ? (
              <Text style={[styles.dim, { color: colors.ok }]}>{t('obd.dtc.none')}</Text>
            ) : (
              dtcs.map(c => <Text key={c} style={styles.dtc}>{c}</Text>)
            )}
            <View style={styles.actions}>
              <Button title={t('obd.dtc.read')} loading={dtcBusy} onPress={onReadDtc} />
              {!!dtcs?.length && <Button title={t('obd.dtc.clear')} kind="danger" onPress={onClearDtc} />}
            </View>
          </Card>

          <SectionTitle>{t('obd.ha.title')}</SectionTitle>
          <Card>
            <Text style={styles.help}>{t('obd.ha.help')}</Text>
            <Field label={t('cfg.ha.url')} value={ha.url} onChangeText={v => setHa({ ...ha, url: v })} placeholder="https://example.ui.nabu.casa" keyboardType="url" />
            <Field label={t('cfg.ha.token')} value={ha.token} onChangeText={v => setHa({ ...ha, token: v })} secure placeholder={t('cfg.ha.token.ph')} />
            <Field label={t('obd.ha.prefix')} value={ha.prefix} onChangeText={v => setHa({ ...ha, prefix: v })} placeholder="sensor.car" />
            <Button title={t('cfg.save')} onPress={saveHa} />
            {!!haMsg && <Text style={styles.msg}>{haMsg}</Text>}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  help: { color: colors.textDim, fontSize: 13, marginBottom: space.sm },
  dim: { color: colors.textDim, fontSize: 13, paddingVertical: space.xs },
  msg: { color: colors.textMid, fontSize: 13, marginTop: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  devRow: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  devName: { color: colors.text, fontSize: 15 },
  devMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginLeft: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  alertCard: { borderColor: colors.warn },
  alert: { fontSize: 13, paddingVertical: 2 },
  dtc: { color: colors.bad, fontSize: 15, fontFamily: 'monospace', paddingVertical: 2 },
});
