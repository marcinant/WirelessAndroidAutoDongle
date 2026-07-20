import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity, PermissionsAndroid, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space } from '../theme/theme';
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
import { obdSession } from '../obd/session';
import { fuelPer100km } from '../obd/pids';
import { readDtcs, clearDtcs } from '../obd/dtc';
import {
  loadAdapter, saveAdapter, clearAdapter,
  loadObdHa, saveObdHa, ObdHaConfig,
  loadTraccar, saveTraccar, TraccarStore,
  ObdAdapter,
} from '../obd/store';
import { pushReadings } from '../obd/haPush';
import { tracker } from '../track/tracker';

type Props = NativeStackScreenProps<RootStackParamList, 'Obd'>;

export default function ObdScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const [adapter, setAdapter] = React.useState<ObdAdapter | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [devices, setDevices] = React.useState<Record<string, FoundDevice>>({});
  const [connecting, setConnecting] = React.useState(false);
  const [, force] = React.useReducer(x => x + 1, 0);
  const [dtcs, setDtcs] = React.useState<string[] | null>(null);
  const [dtcBusy, setDtcBusy] = React.useState(false);
  const [ha, setHa] = React.useState<ObdHaConfig>({ url: '', token: '', prefix: 'sensor.car' });
  const [haMsg, setHaMsg] = React.useState('');
  const [tc, setTc] = React.useState<TraccarStore>({ url: '', deviceId: '', intervalS: '15' });
  const [tcMsg, setTcMsg] = React.useState('');

  const unsub = React.useRef<() => void>(() => {});
  const pushCounter = React.useRef(0);

  React.useEffect(() => {
    loadAdapter().then(setAdapter);
    loadObdHa().then(setHa);
    loadTraccar().then(setTc);
    const s1 = obdSession.subscribe(force);
    const s2 = tracker.subscribe(force);
    return () => {
      s1();
      s2();
      unsub.current();
      cancelDiscovery();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort HA push while connected (separate from Traccar).
  React.useEffect(() => {
    if (!obdSession.connected) return;
    const id = setInterval(() => {
      if (ha.url && ha.token && ++pushCounter.current % 3 === 0) pushReadings(ha, obdSession.readings);
    }, 10000);
    return () => clearInterval(id);
  }, [ha]);

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
      return Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
    }
    const a = { address: d.address, name: d.name || d.address };
    await saveAdapter(a);
    setAdapter(a);
  }

  async function connect() {
    if (!adapter) return;
    setConnecting(true);
    try {
      await obdSession.connect(adapter.address);
    } catch (e: any) {
      Alert.alert(t('obd.connfail'), String(e?.message ?? e));
    } finally {
      setConnecting(false);
    }
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

  async function toggleTracking() {
    if (tracker.active) {
      await tracker.stop();
      return;
    }
    if (!tc.url || !tc.deviceId) {
      setTcMsg(t('trk.need'));
      return;
    }
    await saveTraccar(tc);
    // Android 13+ needs runtime notification permission for the FGS notice.
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS as any);
    }
    const granted = await requestOnboardingPermissions(); // location included
    if (!granted) {
      setTcMsg(t('trk.needloc'));
      return;
    }
    try {
      await tracker.start({ url: tc.url, deviceId: tc.deviceId }, parseInt(tc.intervalS, 10) || 15);
      setTcMsg('');
    } catch (e: any) {
      setTcMsg(String(e?.message ?? e));
    }
  }

  async function forget() {
    if (tracker.active) await tracker.stop();
    await obdSession.disconnect();
    await clearAdapter();
    setAdapter(null);
  }

  const readings = obdSession.readings;
  const alerts = obdSession.alerts;
  const connected = obdSession.connected;
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
                <Button title={t('obd.disconnect')} kind="secondary" onPress={() => obdSession.disconnect()} />
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

          <SectionTitle>{t('trk.title')}</SectionTitle>
          <Card style={tracker.active ? styles.trackOn : undefined}>
            <Text style={styles.help}>{t('trk.help')}</Text>
            <Field label={t('trk.url')} value={tc.url} onChangeText={v => setTc({ ...tc, url: v })} placeholder="https://demo.traccar.org:5055" keyboardType="url" />
            <Field label={t('trk.id')} value={tc.deviceId} onChangeText={v => setTc({ ...tc, deviceId: v })} placeholder="audi-a5" />
            <Field label={t('trk.interval')} value={tc.intervalS} onChangeText={v => setTc({ ...tc, intervalS: v })} placeholder="15" />
            <Button
              title={tracker.active ? t('trk.stop') : t('trk.start')}
              kind={tracker.active ? 'danger' : 'primary'}
              onPress={toggleTracking}
            />
            {tracker.active && (
              <Text style={styles.trackStat}>
                {t('trk.status', { n: tracker.sentCount })}
                {tracker.lastFix ? ` · ${tracker.lastFix.lat.toFixed(4)}, ${tracker.lastFix.lon.toFixed(4)}` : ''}
                {tracker.lastError ? ` · ${tracker.lastError}` : ''}
              </Text>
            )}
            {!!tcMsg && <Text style={styles.msg}>{tcMsg}</Text>}
          </Card>

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
  trackOn: { borderColor: colors.ok },
  trackStat: { color: colors.ok, fontSize: 12, marginTop: space.sm },
});
