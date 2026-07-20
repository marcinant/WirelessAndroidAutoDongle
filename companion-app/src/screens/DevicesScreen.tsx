import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, radius } from '../theme/theme';
import { Card, Button, SectionTitle } from '../components/ui';
import { t } from '../i18n';
import { loadDongles, removeDongle, SavedDongle } from '../onboarding/store';
import { joinDongleWifi, disconnectDongleWifi, currentSsid } from '../onboarding/wifi';
import { bondDevice } from '../onboarding/pairing';
import { requestOnboardingPermissions } from '../onboarding/permissions';

type Props = NativeStackScreenProps<RootStackParamList, 'Devices'>;

export default function DevicesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [dongles, setDongles] = React.useState<SavedDongle[]>([]);
  const [ssid, setSsid] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null); // "<id>:<action>"

  const refresh = React.useCallback(() => {
    loadDongles().then(setDongles);
    currentSsid().then(setSsid);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      const timer = setInterval(() => currentSsid().then(setSsid), 4000);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  async function connect(d: SavedDongle) {
    setBusy(`${d.id}:connect`);
    try {
      await joinDongleWifi(d.ssid, d.wifiPassword);
      setSsid(await currentSsid());
    } catch (e: any) {
      Alert.alert(t('alert.wififail.title'), String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(d: SavedDongle) {
    setBusy(`${d.id}:disconnect`);
    try {
      await disconnectDongleWifi();
      setSsid(await currentSsid());
    } finally {
      setBusy(null);
    }
  }

  async function repair(d: SavedDongle) {
    if (!d.btMac) {
      navigation.navigate('Onboarding', { mode: 'add' });
      return;
    }
    setBusy(`${d.id}:repair`);
    try {
      await requestOnboardingPermissions();
      await bondDevice(d.btMac);
      Alert.alert(t('dev.repaired.title'), t('dev.repaired.body', { name: d.label }));
    } catch (e: any) {
      Alert.alert(t('alert.bondfail.title'), String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  function forget(d: SavedDongle) {
    Alert.alert(t('dev.forget.title'), t('dev.forget.body', { name: d.label }), [
      { text: t('cfg.cancel'), style: 'cancel' },
      {
        text: t('dev.forget.confirm'),
        style: 'destructive',
        onPress: async () => setDongles(await removeDongle(d.id)),
      },
    ]);
  }

  const isConnected = (d: SavedDongle) => !!ssid && ssid.replace(/"/g, '') === d.ssid;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <SectionTitle>{t('dev.title')}</SectionTitle>

      {dongles.length === 0 && (
        <Card>
          <Text style={styles.dim}>{t('dev.empty')}</Text>
        </Card>
      )}

      {dongles.map(d => {
        const connected = isConnected(d);
        return (
          <Card key={d.id}>
            <View style={styles.rowTop}>
              <View style={styles.info}>
                <Text style={styles.name}>{d.label}</Text>
                <Text style={styles.meta}>
                  {d.ssid}
                  {d.btMac ? ` · ${d.btMac}` : ''}
                </Text>
              </View>
              <View style={[styles.dot, { backgroundColor: connected ? colors.ok : colors.border }]} />
            </View>

            <View style={styles.actions}>
              {connected ? (
                <Button
                  title={t('dev.disconnect')}
                  kind="secondary"
                  loading={busy === `${d.id}:disconnect`}
                  onPress={() => disconnect(d)}
                />
              ) : (
                <Button
                  title={t('dev.connect')}
                  loading={busy === `${d.id}:connect`}
                  onPress={() => connect(d)}
                />
              )}
              <Button title={t('dev.open')} kind="secondary" onPress={() => navigation.navigate('Dashboard', { dongle: d })} />
            </View>
            <View style={styles.actions}>
              <Button
                title={t('dev.repair')}
                kind="secondary"
                loading={busy === `${d.id}:repair`}
                onPress={() => repair(d)}
              />
              <Button title={t('dev.forget')} kind="danger" onPress={() => forget(d)} />
            </View>
          </Card>
        );
      })}

      <View style={{ marginTop: space.md }}>
        <Button title={t('dev.add')} onPress={() => navigation.navigate('Onboarding', { mode: 'add' })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  dim: { color: colors.textDim, fontSize: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginLeft: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
