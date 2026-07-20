import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, radius } from '../theme/theme';
import { Card, Button, Field, SectionTitle } from '../components/ui';
import {
  getConfig,
  saveConfig,
  getHa,
  saveHa,
  testHa,
  reboot,
  setWebuiPassword,
} from '../api/client';
import { getConf, setConfMany } from '../api/aawgConf';

type Props = NativeStackScreenProps<RootStackParamList, 'Config'>;

const STRATEGIES = [
  { v: '0', label: 'Dongle mode' },
  { v: '1', label: 'Phone first' },
  { v: '2', label: 'USB first' },
];

export default function ConfigScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const dongle = route.params.dongle;

  const [conf, setConf] = React.useState<string | null>(null);
  const [loadErr, setLoadErr] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // HA settings come from the dedicated endpoint (also serves uplink state).
  const [ha, setHa] = React.useState({ url: '', token: '', entity: '' });
  const [haMsg, setHaMsg] = React.useState('');
  const [haBusy, setHaBusy] = React.useState<'save' | 'test' | null>(null);

  // Local edits over the raw conf, keyed by AAWG_ variable.
  const [strategy, setStrategy] = React.useState('1');
  const [earlyHsp, setEarlyHsp] = React.useState(true);
  const [disableHsp, setDisableHsp] = React.useState(false);
  const [country, setCountry] = React.useState('');
  const [cloudUrl, setCloudUrl] = React.useState('');
  const [cloudInterval, setCloudInterval] = React.useState('');

  React.useEffect(() => {
    setWebuiPassword(dongle.webuiPassword);
    getConfig()
      .then(text => {
        setConf(text);
        setStrategy(getConf(text, 'AAWG_CONNECTION_STRATEGY') || '1');
        setEarlyHsp(getConf(text, 'AAWG_EARLY_HSP_RELEASE') !== '0');
        setDisableHsp(getConf(text, 'AAWG_DISABLE_HSP') === '1');
        setCountry(getConf(text, 'AAWG_COUNTRY_CODE') || '');
        setCloudUrl(getConf(text, 'AAWG_CLOUD_URL') || '');
        setCloudInterval(getConf(text, 'AAWG_CLOUD_INTERVAL') || '');
      })
      .catch(() => setLoadErr(true));
    getHa()
      .then(h => setHa({ url: h.url, token: h.token, entity: h.entity }))
      .catch(() => {});
  }, [dongle.webuiPassword]);

  async function saveSettings() {
    if (!conf) return;
    setSaving(true);
    const patched = setConfMany(conf, {
      AAWG_CONNECTION_STRATEGY: strategy,
      AAWG_EARLY_HSP_RELEASE: earlyHsp ? '1' : '0',
      AAWG_DISABLE_HSP: disableHsp ? '1' : '',
      AAWG_COUNTRY_CODE: country,
      AAWG_CLOUD_URL: cloudUrl,
      AAWG_CLOUD_INTERVAL: cloudInterval,
    });
    try {
      const r = await saveConfig(patched);
      if (r.ok) {
        setConf(patched);
        Alert.alert('Saved', 'Reboot the dongle to apply the changes.');
      } else {
        Alert.alert('Save failed', r.error ?? 'unknown error');
      }
    } catch (e: any) {
      Alert.alert('Save failed', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function onHaSave() {
    setHaBusy('save');
    setHaMsg('saving…');
    try {
      const r = await saveHa(ha);
      setHaMsg(r.ok ? (r.note ?? 'saved') : `error: ${r.error}`);
    } catch (e: any) {
      setHaMsg(`error: ${String(e?.message ?? e)}`);
    } finally {
      setHaBusy(null);
    }
  }

  async function onHaTest() {
    setHaBusy('test');
    setHaMsg('testing…');
    // Try the phone directly first (it has LTE); fall back to the dongle probe.
    try {
      const res = await fetch(ha.url.replace(/\/$/, '') + '/api/', {
        headers: { Authorization: 'Bearer ' + ha.token },
      });
      if (res.status === 200) setHaMsg('OK: token accepted (checked from phone)');
      else if (res.status === 401 || res.status === 403) setHaMsg(`error: token rejected (${res.status})`);
      else setHaMsg(`error: HA answered ${res.status}`);
    } catch {
      try {
        const r = await testHa(ha);
        setHaMsg(r.ok ? `OK: ${r.note}` : `error: ${r.error}${r.hint ? ' — ' + r.hint : ''}`);
      } catch (e: any) {
        setHaMsg(`error: ${String(e?.message ?? e)}`);
      }
    } finally {
      setHaBusy(null);
    }
  }

  function confirmReboot() {
    Alert.alert('Reboot dongle', 'Reboot now to apply changes?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reboot', style: 'destructive', onPress: () => reboot() },
    ]);
  }

  if (loadErr) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Could not load the dongle config. Are you on its wifi?</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <SectionTitle>Home Assistant</SectionTitle>
      <Card>
        <Text style={styles.help}>
          Reports the car's status over the phone's mobile data (Bluetooth tethering). Create a
          long-lived token in HA → profile → security.
        </Text>
        <Field label="URL" value={ha.url} onChangeText={t => setHa({ ...ha, url: t })} placeholder="https://example.ui.nabu.casa" keyboardType="url" />
        <Field label="Token" value={ha.token} onChangeText={t => setHa({ ...ha, token: t })} secure placeholder="long-lived access token" />
        <Field label="Entity" value={ha.entity} onChangeText={t => setHa({ ...ha, entity: t })} placeholder="binary_sensor.car_running" />
        <View style={styles.row}>
          <Button title="Save" onPress={onHaSave} loading={haBusy === 'save'} />
          <Button title="Test connection" kind="secondary" onPress={onHaTest} loading={haBusy === 'test'} />
        </View>
        {!!haMsg && <Text style={styles.msg}>{haMsg}</Text>}
      </Card>

      <SectionTitle>Connection</SectionTitle>
      <Card>
        <Text style={styles.help}>Connection strategy</Text>
        <View style={styles.segment}>
          {STRATEGIES.map(o => (
            <TouchableOpacity
              key={o.v}
              style={[styles.segItem, strategy === o.v && styles.segItemOn]}
              onPress={() => setStrategy(o.v)}>
              <Text style={[styles.segText, strategy === o.v && styles.segTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Toggle
          label="Early HSP release"
          hint="Free the car's hands-free profile as soon as AA opens (recommended)."
          value={earlyHsp}
          onChange={setEarlyHsp}
        />
        <Toggle
          label="Disable fake headset (HSP)"
          hint="Keeps HFP for the car, but some phones then won't start wireless AA."
          value={disableHsp}
          onChange={setDisableHsp}
        />
        <Field label="Country code" value={country} onChangeText={setCountry} placeholder="e.g. PL" />
      </Card>

      <SectionTitle>Cloud telemetry</SectionTitle>
      <Card>
        <Text style={styles.help}>Optional generic JSON webhook, pushed over Bluetooth tethering.</Text>
        <Field label="Webhook URL" value={cloudUrl} onChangeText={setCloudUrl} placeholder="https://…/api/webhook/aawg" keyboardType="url" />
        <Field label="Push interval (s)" value={cloudInterval} onChangeText={setCloudInterval} placeholder="300" />
      </Card>

      <View style={styles.row}>
        <Button title="Save settings" onPress={saveSettings} loading={saving} />
        <Button title="Reboot" kind="danger" onPress={confirmReboot} />
      </View>
      <Text style={styles.foot}>Changes take effect after a reboot.</Text>
    </ScrollView>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity style={styles.toggle} onPress={() => onChange(!value)} activeOpacity={0.7}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  err: { color: colors.bad, fontSize: 14, textAlign: 'center' },
  help: { color: colors.textDim, fontSize: 13, marginBottom: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  msg: { color: colors.textMid, fontSize: 13, marginTop: space.sm },
  foot: { color: colors.textDim, fontSize: 12, marginTop: space.md, textAlign: 'center' },
  segment: { flexDirection: 'row', marginBottom: space.md, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.inputBg },
  segItemOn: { backgroundColor: colors.accent },
  segText: { color: colors.textMid, fontSize: 13 },
  segTextOn: { color: colors.accentText, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  toggleText: { flex: 1, paddingRight: space.md },
  toggleLabel: { color: colors.text, fontSize: 15 },
  toggleHint: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
});
