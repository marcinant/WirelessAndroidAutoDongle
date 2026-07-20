import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space } from '../theme/theme';
import { Card, Button, Field, SectionTitle } from '../components/ui';
import { requestOnboardingPermissions } from '../onboarding/permissions';
import { bluetoothReady, scanForDongle, FoundDongle, destroyBle } from '../onboarding/ble';
import { pairingSupported, pairDongle, openBluetoothSettings } from '../onboarding/pairing';
import { joinDongleWifi } from '../onboarding/wifi';
import {
  DEFAULT_SSID,
  DEFAULT_WIFI_PASSWORD,
  BT_NAME_PREFIX,
  saveDongle,
} from '../onboarding/store';
import { ping, setWebuiPassword } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type Step = 'intro' | 'scanning' | 'found' | 'pairing' | 'wifi' | 'connecting';

// Guided setup that solves the chicken-and-egg problem of the web UI: the panel
// at 10.0.0.1 is only reachable once the phone has joined the dongle wifi, and
// a fresh user has no way in. Here the app: (1) finds the dongle by its BLE
// beacon, (2) pairs bluetooth via the system dialog, (3) joins the AP with the
// provisioning password, (4) verifies it can reach the dongle, then saves it.
export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>('intro');
  const [found, setFound] = React.useState<FoundDongle | null>(null);
  const [ssid, setSsid] = React.useState(DEFAULT_SSID);
  const [wifiPass, setWifiPass] = React.useState(DEFAULT_WIFI_PASSWORD);
  const [webuiPass, setWebuiPass] = React.useState('');
  const [status, setStatus] = React.useState('');
  const btMac = React.useRef<string | null>(null);

  React.useEffect(() => () => destroyBle(), []);

  async function startScan() {
    setStatus('');
    const granted = await requestOnboardingPermissions();
    if (!granted) {
      Alert.alert('Permissions needed', 'Bluetooth and location are required to find the dongle.');
      return;
    }
    if (!(await bluetoothReady())) {
      Alert.alert('Bluetooth off', 'Turn on Bluetooth, then try again.');
      return;
    }
    setStep('scanning');
    try {
      const dongle = await scanForDongle(12000, d => setFound(d));
      if (dongle) {
        setFound(dongle);
        setStep('found');
      } else {
        setStep('intro');
        Alert.alert(
          'No dongle found',
          'Make sure the dongle is powered (plug it into the car or a USB power bank) and within a few metres.',
        );
      }
    } catch (e: any) {
      setStep('intro');
      Alert.alert('Scan failed', String(e?.message ?? e));
    }
  }

  async function pair() {
    setStep('pairing');
    try {
      if (await pairingSupported()) {
        const res = await pairDongle(BT_NAME_PREFIX);
        btMac.current = res.mac;
        setStatus(`Paired ${res.name}`);
      } else {
        // Fall back to the system bluetooth screen; AA pairs over classic BT.
        await openBluetoothSettings();
        setStatus('Pair the dongle in Bluetooth settings, then come back.');
      }
    } catch (e: any) {
      setStatus(`Pairing skipped: ${String(e?.message ?? e)}`);
    }
    setStep('wifi');
  }

  async function connect() {
    setStep('connecting');
    setStatus('Joining the dongle wifi…');
    try {
      await joinDongleWifi(ssid, wifiPass);
    } catch (e: any) {
      setStep('wifi');
      Alert.alert('Wifi join failed', String(e?.message ?? e));
      return;
    }

    setWebuiPassword(webuiPass || null);
    setStatus('Checking the connection…');
    // The AP binding can take a moment; retry the reachability probe.
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      ok = await ping(3000);
      if (!ok) await new Promise<void>(r => setTimeout(() => r(), 1500));
    }
    if (!ok) {
      setStep('wifi');
      Alert.alert(
        'Cannot reach the dongle',
        'Joined the wifi but the dongle did not answer. Double-check the wifi password.',
      );
      return;
    }

    const dongle = {
      ssid,
      wifiPassword: wifiPass,
      webuiPassword: webuiPass || null,
      btName: found?.name ?? null,
      btMac: btMac.current,
    };
    await saveDongle(dongle);
    navigation.reset({ index: 0, routes: [{ name: 'Dashboard', params: { dongle } }] });
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      {step === 'intro' && (
        <Card>
          <SectionTitle>Find your dongle</SectionTitle>
          <Text style={styles.p}>
            Power the dongle (plug it into the car, or a USB power bank on your desk). The app will
            detect it over Bluetooth.
          </Text>
          <Button title="Scan for dongle" onPress={startScan} />
        </Card>
      )}

      {step === 'scanning' && (
        <Card>
          <SectionTitle>Scanning…</SectionTitle>
          <Text style={styles.p}>
            Looking for “{BT_NAME_PREFIX}…”. {found ? `Seen: ${found.name}` : 'Keep the dongle close.'}
          </Text>
        </Card>
      )}

      {(step === 'found' || step === 'pairing') && found && (
        <Card>
          <SectionTitle>Dongle found</SectionTitle>
          <Text style={styles.name}>{found.name}</Text>
          <Text style={styles.p}>
            Signal {found.rssi ?? '–'} dBm. Next, pair Bluetooth so the dongle can wake wireless
            Android Auto.
          </Text>
          <Button title="Pair Bluetooth" onPress={pair} loading={step === 'pairing'} />
        </Card>
      )}

      {(step === 'wifi' || step === 'connecting') && (
        <Card>
          <SectionTitle>Connect to the dongle</SectionTitle>
          {!!status && <Text style={styles.status}>{status}</Text>}
          <Field label="Wifi network (SSID)" value={ssid} onChangeText={setSsid} />
          <Field label="Wifi password" value={wifiPass} onChangeText={setWifiPass} secure />
          <Field
            label="Panel password (optional)"
            value={webuiPass}
            onChangeText={setWebuiPass}
            secure
            placeholder="only if you set AAWG_WEBUI_PASSWORD"
          />
          <Button
            title="Connect"
            onPress={connect}
            loading={step === 'connecting'}
          />
        </Card>
      )}

      <Text style={styles.hint}>
        The dongle serves everything locally — no cloud account needed to set it up.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  p: { color: colors.textMid, fontSize: 14, lineHeight: 20, marginBottom: space.md },
  name: { color: colors.ok, fontSize: 18, fontWeight: '600', marginBottom: space.xs },
  status: { color: colors.warn, fontSize: 13, marginBottom: space.sm },
  hint: { color: colors.textDim, fontSize: 12, marginTop: space.lg, textAlign: 'center' },
});
