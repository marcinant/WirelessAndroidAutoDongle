import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, signalClass } from '../theme/theme';
import { Card, StatTile, SectionTitle, Button } from '../components/ui';
import LineChart from '../components/LineChart';
import { usePolling } from '../hooks/usePolling';
import { getStatus, getStats, getEvents, setWebuiPassword } from '../api/client';
import { fmtUptime, parseWifiStations, parseBtDevices } from '../api/parse';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const dongle = route.params.dongle;

  React.useEffect(() => {
    setWebuiPassword(dongle.webuiPassword);
  }, [dongle.webuiPassword]);

  const status = usePolling(getStatus, 2000);
  const stats = usePolling(getStats, 3000);
  const events = usePolling(getEvents, 10000);

  const s = status.data;
  const st = stats.data;

  const wifi = s ? parseWifiStations(s.wifi_stations) : [];
  const bt = s ? parseBtDevices(s.bt_devices) : [];
  const wifiDrops = (events.data ?? []).filter(e => e.text.includes('AP-STA-DISCONNECTED')).length;

  const tcpTone =
    s?.tcp_state === 'ESTABLISHED' ? 'ok' : s?.tcp_state === 'none' ? 'dim' : 'warn';
  const usbTone = s?.usb_gadget === 'accessory' ? 'ok' : s?.usb_gadget === 'none' ? 'dim' : 'warn';

  const latestSig = st?.latest?.signal_dbm ?? null;
  const latestRtt = st?.latest?.rtt_ms ?? null;

  const offline = status.error && !s;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            status.refresh();
            stats.refresh();
            events.refresh();
          }}
          tintColor={colors.accent}
        />
      }>
      {offline && (
        <Card style={styles.offline}>
          <Text style={styles.offlineText}>
            Not connected to the dongle. Open the {dongle.ssid} wifi (or re-run setup) to see live
            data.
          </Text>
        </Card>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>{dongle.btName ?? 'AA Dongle'}</Text>
        {s && <Text style={styles.uptime}>uptime {fmtUptime(s.uptime_s)}</Text>}
      </View>

      <View style={styles.tiles}>
        <StatTile
          label="Daemon"
          value={s ? (s.aawgd_running ? 'running' : 'stopped') : '–'}
          tone={s ? (s.aawgd_running ? 'ok' : 'bad') : 'dim'}
        />
        <StatTile
          label="Bluetooth"
          value={s ? (s.bt_powered ? (bt.length ? bt.join(', ') : 'powered') : 'off') : '–'}
          tone={s?.bt_powered ? 'ok' : 'dim'}
        />
        <StatTile
          label="Wifi client"
          value={wifi.length ? wifi.map(w => `${w.signalDbm ?? '?'} dBm`).join(', ') : 'none'}
          tone={wifi.length ? 'ok' : 'dim'}
        />
        <StatTile label="AA session" value={s?.tcp_state ?? '–'} tone={tcpTone} />
        <StatTile label="USB" value={s?.usb_gadget ?? '–'} tone={usbTone} />
        <StatTile
          label="Link"
          value={
            latestRtt != null
              ? `${latestRtt.toFixed(0)} ms${latestSig != null ? ` · ${latestSig} dBm` : ''}`
              : latestSig != null
                ? `${latestSig} dBm`
                : 'no client'
          }
          tone={latestSig != null ? signalClass(latestSig) : 'dim'}
        />
      </View>

      {!!s?.stage && (
        <Card>
          <Text style={styles.stage}>{s.stage}</Text>
        </Card>
      )}

      <SectionTitle>Stream</SectionTitle>
      <LineChart
        title="Throughput (Mbps · phone→car / car→phone)"
        series={[
          { data: st?.downMbps ?? [], color: colors.chartDown },
          { data: st?.upMbps ?? [], color: colors.chartUp },
        ]}
      />
      <LineChart
        title="Latency to phone (ms)"
        series={[{ data: st?.rttMs ?? [], color: colors.chartRtt }]}
      />
      <LineChart
        title="Wifi signal (dBm)"
        series={[{ data: st?.signalDbm ?? [], color: colors.chartSig }]}
      />

      <SectionTitle>Recent events</SectionTitle>
      <Card>
        {(events.data ?? []).length === 0 ? (
          <Text style={styles.dim}>no events yet</Text>
        ) : (
          (events.data ?? [])
            .slice(-8)
            .reverse()
            .map((e, i) => (
              <View key={i} style={styles.eventRow}>
                <Text style={[styles.evSrc, { color: e.source === 'wifi' ? colors.chartDown : colors.ok }]}>
                  {e.source === 'wifi' ? 'wifi' : 'aa'}
                </Text>
                <Text style={styles.evText} numberOfLines={1}>
                  {e.time ? new Date(e.time * 1000).toLocaleTimeString() + '  ' : ''}
                  {e.text}
                </Text>
              </View>
            ))
        )}
        {wifiDrops > 0 && <Text style={styles.drops}>{wifiDrops} wifi disconnect(s) in recent history</Text>}
      </Card>

      <View style={styles.actions}>
        <Button title="Settings" onPress={() => navigation.navigate('Config', { dongle })} />
        <Button title="Log" kind="secondary" onPress={() => navigation.navigate('Logs', { dongle })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  uptime: { color: colors.textDim, fontSize: 13 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stage: { color: colors.textMid, fontSize: 13 },
  dim: { color: colors.textDim, fontSize: 13 },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  evSrc: { width: 34, fontSize: 12, fontWeight: '600' },
  evText: { flex: 1, color: colors.textMid, fontSize: 12, fontFamily: 'monospace' },
  drops: { color: colors.warn, fontSize: 12, marginTop: space.sm },
  actions: { flexDirection: 'row', marginTop: space.md },
  offline: { borderColor: colors.warn },
  offlineText: { color: colors.warn, fontSize: 13 },
});
