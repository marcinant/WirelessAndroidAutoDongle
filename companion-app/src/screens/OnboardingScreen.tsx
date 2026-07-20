import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, radius } from '../theme/theme';
import { Card, Button, Field, SectionTitle } from '../components/ui';
import { t } from '../i18n';
import { requestOnboardingPermissions } from '../onboarding/permissions';
import {
  pairingAvailable,
  isBluetoothOn,
  startDiscovery,
  cancelDiscovery,
  bondDevice,
  onDeviceFound,
  openBluetoothSettings,
  FoundDevice,
} from '../onboarding/pairing';
import { joinDongleWifi } from '../onboarding/wifi';
import { DEFAULT_SSID, DEFAULT_WIFI_PASSWORD, upsertDongle } from '../onboarding/store';
import { ping, setWebuiPassword } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
type Step = 'intro' | 'scanning' | 'bonding' | 'wifi' | 'connecting';

const DONGLE_RE = /^(AudiAndroidAuto|WirelessAADongle|AndroidAuto-Dongle)-/i;

export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>('intro');
  const [devices, setDevices] = React.useState<Record<string, FoundDevice>>({});
  const [bondingName, setBondingName] = React.useState('');
  const [ssid, setSsid] = React.useState(DEFAULT_SSID);
  const [wifiPass, setWifiPass] = React.useState(DEFAULT_WIFI_PASSWORD);
  const [webuiPass, setWebuiPass] = React.useState('');
  const [status, setStatus] = React.useState('');
  const btName = React.useRef<string | null>(null);
  const btMac = React.useRef<string | null>(null);
  const unsub = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    return () => {
      unsub.current();
      cancelDiscovery();
    };
  }, []);

  async function beginScan() {
    setStatus('');
    setDevices({});
    const granted = await requestOnboardingPermissions();
    if (!granted) {
      Alert.alert(t('alert.perms.title'), t('alert.perms.body'));
      return;
    }
    if (!pairingAvailable()) {
      await openBluetoothSettings();
      setStatus(t('ob.pairManualHint'));
      setStep('wifi');
      return;
    }
    if (!(await isBluetoothOn())) {
      Alert.alert(t('alert.btoff.title'), t('alert.btoff.body'));
      return;
    }

    unsub.current();
    unsub.current = onDeviceFound((d: FoundDevice) => {
      setDevices(prev => ({ ...prev, [d.address]: { ...prev[d.address], ...d } }));
    });
    setStep('scanning');
    try {
      await startDiscovery();
    } catch (e: any) {
      setStep('intro');
      Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
    }
  }

  async function pick(d: FoundDevice) {
    unsub.current();
    await cancelDiscovery();
    setBondingName(d.name || d.address);
    setStep('bonding');
    try {
      const res = await bondDevice(d.address);
      btName.current = res.name || d.name || null;
      btMac.current = res.mac || d.address;
      setStatus(t('ob.paired', { name: res.name || d.name || '' }));
      setStep('wifi');
    } catch (e: any) {
      Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
      setStep('scanning');
      beginScan();
    }
  }

  async function connect() {
    setStep('connecting');
    setStatus(t('ob.joining'));
    try {
      await joinDongleWifi(ssid, wifiPass);
    } catch (e: any) {
      setStep('wifi');
      Alert.alert(t('alert.wififail.title'), String(e?.message ?? e));
      return;
    }
    setWebuiPassword(webuiPass || null);
    setStatus(t('ob.checking'));
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      ok = await ping(3000);
      if (!ok) await new Promise<void>(r => setTimeout(() => r(), 1500));
    }
    if (!ok) {
      setStep('wifi');
      Alert.alert(t('alert.unreach.title'), t('alert.unreach.body'));
      return;
    }
    const dongle = {
      ssid,
      wifiPassword: wifiPass,
      webuiPassword: webuiPass || null,
      btName: btName.current,
      btMac: btMac.current,
    };
    const list = await upsertDongle(dongle);
    const saved = list.find(d => d.btMac === btMac.current) ?? list[list.length - 1];
    navigation.reset({
      index: 1,
      routes: [{ name: 'Devices' }, { name: 'Dashboard', params: { dongle: saved } }],
    });
  }

  const sorted = Object.values(devices).sort((a, b) => {
    const ad = DONGLE_RE.test(a.name) ? 0 : 1;
    const bd = DONGLE_RE.test(b.name) ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      {step === 'intro' && (
        <Card>
          <SectionTitle>{t('ob.find.title')}</SectionTitle>
          <Text style={styles.p}>{t('ob.find.body')}</Text>
          <Button title={t('ob.find.button')} onPress={beginScan} />
          <Button
            title={t('ob.settings.button')}
            kind="secondary"
            onPress={async () => {
              await openBluetoothSettings();
              setStatus(t('ob.pairManualHint'));
              setStep('wifi');
            }}
          />
        </Card>
      )}

      {step === 'scanning' && (
        <Card>
          <SectionTitle>{t('ob.scanning.title')}</SectionTitle>
          <Text style={styles.p}>{t('ob.scanning.body')}</Text>
          {sorted.length === 0 ? (
            <Text style={styles.dim}>{t('ob.scanning.empty')}</Text>
          ) : (
            sorted.map(d => {
              const isDongle = DONGLE_RE.test(d.name);
              return (
                <TouchableOpacity key={d.address} style={styles.devRow} onPress={() => pick(d)}>
                  <View style={styles.devInfo}>
                    <Text style={[styles.devName, isDongle && styles.devNameHi]} numberOfLines={1}>
                      {d.name || d.address}
                    </Text>
                    <Text style={styles.devMeta}>
                      {d.address}
                      {d.bonded ? ' · paired' : ''}
                      {d.rssi != null ? ` · ${d.rssi} dBm` : ''}
                    </Text>
                  </View>
                  {isDongle && <Text style={styles.devTag}>dongle</Text>}
                </TouchableOpacity>
              );
            })
          )}
          <Button title={t('ob.rescan')} kind="secondary" onPress={beginScan} />
        </Card>
      )}

      {step === 'bonding' && (
        <Card>
          <SectionTitle>{t('ob.bonding', { name: bondingName })}</SectionTitle>
          <Text style={styles.p}>{t('ob.pairManualHint')}</Text>
        </Card>
      )}

      {(step === 'wifi' || step === 'connecting') && (
        <Card>
          <SectionTitle>{t('ob.wifi.title')}</SectionTitle>
          {!!status && <Text style={styles.status}>{status}</Text>}
          <Field label={t('ob.wifi.ssid')} value={ssid} onChangeText={setSsid} />
          <Field label={t('ob.wifi.pass')} value={wifiPass} onChangeText={setWifiPass} secure />
          <Field
            label={t('ob.wifi.panelpass')}
            value={webuiPass}
            onChangeText={setWebuiPass}
            secure
            placeholder={t('ob.wifi.panelpass.ph')}
          />
          <Button title={t('ob.connect')} onPress={connect} loading={step === 'connecting'} />
        </Card>
      )}

      <Text style={styles.hint}>{t('ob.footer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  p: { color: colors.textMid, fontSize: 14, lineHeight: 20, marginBottom: space.md },
  dim: { color: colors.textDim, fontSize: 13, paddingVertical: space.md },
  status: { color: colors.warn, fontSize: 13, marginBottom: space.sm },
  hint: { color: colors.textDim, fontSize: 12, marginTop: space.lg, textAlign: 'center' },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  devInfo: { flex: 1 },
  devName: { color: colors.text, fontSize: 15 },
  devNameHi: { color: colors.ok, fontWeight: '600' },
  devMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  devTag: {
    color: colors.ok,
    fontSize: 11,
    borderWidth: 1,
    borderColor: colors.ok,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
