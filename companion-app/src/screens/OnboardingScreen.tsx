import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space } from '../theme/theme';
import { Card, Button, Field, SectionTitle } from '../components/ui';
import { requestOnboardingPermissions } from '../onboarding/permissions';
import { pairingSupported, pairDongle, openBluetoothSettings } from '../onboarding/pairing';
import { joinDongleWifi } from '../onboarding/wifi';
import {
  DEFAULT_SSID,
  DEFAULT_WIFI_PASSWORD,
  DONGLE_NAME_PATTERN,
  saveDongle,
} from '../onboarding/store';
import { ping, setWebuiPassword } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type Step = 'intro' | 'pairing' | 'wifi' | 'connecting';

// Guided setup that solves the chicken-and-egg problem of the web UI: the panel
// at 10.0.0.1 is only reachable once the phone has joined the dongle wifi, and
// a fresh user has no way in.
//
// The dongle is a CLASSIC bluetooth device (RFCOMM profiles for Android Auto).
// Discovery + pairing therefore go through the system association dialog
// (CompanionDeviceManager), which runs a classic inquiry — a BLE scan does not
// see it. After pairing, the app joins the AP and verifies it can reach the
// dongle before saving it.
export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>('intro');
  const [ssid, setSsid] = React.useState(DEFAULT_SSID);
  const [wifiPass, setWifiPass] = React.useState(DEFAULT_WIFI_PASSWORD);
  const [webuiPass, setWebuiPass] = React.useState('');
  const [status, setStatus] = React.useState('');
  const btName = React.useRef<string | null>(null);
  const btMac = React.useRef<string | null>(null);

  async function findAndPair() {
    setStatus('');
    const granted = await requestOnboardingPermissions();
    if (!granted) {
      Alert.alert('Permissions needed', 'Bluetooth (and location) are required to find the dongle.');
      return;
    }

    setStep('pairing');
    if (!(await pairingSupported())) {
      // No CompanionDeviceManager: send the user to system bluetooth to pair
      // manually, then continue to the wifi step.
      await openBluetoothSettings();
      setStatus('Pair the dongle in Bluetooth settings, then continue below.');
      setStep('wifi');
      return;
    }

    try {
      const res = await pairDongle(DONGLE_NAME_PATTERN);
      btName.current = res.name || null;
      btMac.current = res.mac || null;
      setStatus(`Paired ${res.name || 'dongle'}`);
      setStep('wifi');
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('cancelled')) {
        setStep('intro');
        return;
      }
      // Association can fail on some OEMs; offer the manual route.
      Alert.alert('Pairing dialog failed', msg, [
        { text: 'Open Bluetooth settings', onPress: () => openBluetoothSettings() },
        { text: 'Continue anyway', onPress: () => setStep('wifi') },
      ]);
    }
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
      btName: btName.current,
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
            Power the dongle (plug it into the car, or a USB power bank on your desk). Tap below —
            Android will list nearby Bluetooth devices; pick the dongle to pair it.
          </Text>
          <Button title="Find & pair dongle" onPress={findAndPair} />
        </Card>
      )}

      {step === 'pairing' && (
        <Card>
          <SectionTitle>Pairing…</SectionTitle>
          <Text style={styles.p}>
            Choose the dongle in the system dialog (its name starts with “AudiAndroidAuto-”). If it
            is not listed, make sure it is powered and nearby.
          </Text>
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
          <Button title="Connect" onPress={connect} loading={step === 'connecting'} />
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
  status: { color: colors.warn, fontSize: 13, marginBottom: space.sm },
  hint: { color: colors.textDim, fontSize: 12, marginTop: space.lg, textAlign: 'center' },
});
