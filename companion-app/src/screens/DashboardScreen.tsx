import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space, signalClass } from '../theme/theme';
import { Card, StatTile, SectionTitle, Button } from '../components/ui';
import LineChart from '../components/LineChart';
import { t } from '../i18n';
import { usePolling } from '../hooks/usePolling';
import { getStatus, getStats, getEvents, setWebuiPassword } from '../api/client';
import { fmtUptime, parseWifiStations, parseBtDevices } from '../api/parse';
import { joinDongleWifi } from '../onboarding/wifi';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const dongle = route.params.dongle;

  const [connecting, setConnecting] = React.useState(false);

  React.useEffect(() => {
    setWebuiPassword(dongle.webuiPassword);
  }, [dongle.webuiPassword]);

  async function connectWifi() {
    setConnecting(true);
    try {
      await joinDongleWifi(dongle.ssid, dongle.wifiPassword);
    } catch {
      // surfaced via the still-offline banner
    } finally {
      setConnecting(false);
    }
  }

  const status = usePolling(getStatus, 2000);
  const stats = usePolling(getStats, 3000);
  const events = usePolling(getEvents, 10000);

  // When a poll fails the hook keeps the last value; treat that as stale so the
  // UI never keeps claiming "running/powered" after the dongle drops off.
  const stale = status.error;
  const s = stale ? null : status.data;
  const st = stale ? null : stats.data;

  const wifi = s ? parseWifiStations(s.wifi_stations) : [];
  const bt = s ? parseBtDevices(s.bt_devices) : [];
  const wifiDrops = (events.data ?? []).filter(e => e.text.includes('AP-STA-DISCONNECTED')).length;

  const tcpTone =
    s?.tcp_state === 'ESTABLISHED' ? 'ok' : s?.tcp_state === 'none' ? 'dim' : 'warn';
  const usbTone = s?.usb_gadget === 'accessory' ? 'ok' : s?.usb_gadget === 'none' ? 'dim' : 'warn';
  const latestSig = st?.latest?.signal_dbm ?? null;
  const latestRtt = st?.latest?.rtt_ms ?? null;
  const dash = (k: string) => t(k);
  const U = t('dash.unknown');

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
      {stale && (
        <Card style={styles.offline}>
          <Text style={styles.offlineText}>{t('dash.offline', { ssid: dongle.ssid })}</Text>
          <Button title={t('dev.connect')} onPress={connectWifi} loading={connecting} />
        </Card>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>{dongle.btName ?? t('title.dashboard')}</Text>
        {s ? (
          <Text style={styles.uptime}>{t('dash.uptime', { v: fmtUptime(s.uptime_s) })}</Text>
        ) : stale ? (
          <Text style={styles.staleTag}>{t('dash.stale')}</Text>
        ) : null}
      </View>

      <View style={styles.tiles}>
        <StatTile
          label={dash('dash.tile.daemon')}
          value={s ? (s.aawgd_running ? t('dash.running') : t('dash.stopped')) : U}
          tone={s ? (s.aawgd_running ? 'ok' : 'bad') : 'dim'}
        />
        <StatTile
          label={dash('dash.tile.bt')}
          value={s ? (s.bt_powered ? (bt.length ? bt.join(', ') : t('dash.powered')) : t('dash.off')) : U}
          tone={s?.bt_powered ? 'ok' : 'dim'}
        />
        <StatTile
          label={dash('dash.tile.wifi')}
          value={s ? (wifi.length ? wifi.map(w => `${w.signalDbm ?? '?'} dBm`).join(', ') : t('dash.none')) : U}
          tone={wifi.length ? 'ok' : 'dim'}
        />
        <StatTile label={dash('dash.tile.session')} value={s?.tcp_state ?? U} tone={s ? tcpTone : 'dim'} />
        <StatTile label={dash('dash.tile.usb')} value={s?.usb_gadget ?? U} tone={s ? usbTone : 'dim'} />
        <StatTile
          label={dash('dash.tile.link')}
          value={
            !s
              ? U
              : latestRtt != null
                ? `${latestRtt.toFixed(0)} ms${latestSig != null ? ` · ${latestSig} dBm` : ''}`
                : latestSig != null
                  ? `${latestSig} dBm`
                  : t('dash.noclient')
          }
          tone={s && latestSig != null ? signalClass(latestSig) : 'dim'}
        />
      </View>

      {!!s?.stage && (
        <Card>
          <Text style={styles.stage}>{s.stage}</Text>
        </Card>
      )}

      <SectionTitle>{t('dash.stream')}</SectionTitle>
      <LineChart
        title={t('dash.chart.tp')}
        series={[
          { data: st?.downMbps ?? [], color: colors.chartDown },
          { data: st?.upMbps ?? [], color: colors.chartUp },
        ]}
      />
      <LineChart title={t('dash.chart.rtt')} series={[{ data: st?.rttMs ?? [], color: colors.chartRtt }]} />
      <LineChart title={t('dash.chart.sig')} series={[{ data: st?.signalDbm ?? [], color: colors.chartSig }]} />

      <SectionTitle>{t('dash.events')}</SectionTitle>
      <Card>
        {(events.data ?? []).length === 0 ? (
          <Text style={styles.dim}>{t('dash.noevents')}</Text>
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
        {wifiDrops > 0 && <Text style={styles.drops}>{t('dash.drops', { n: wifiDrops })}</Text>}
      </Card>

      <View style={styles.actions}>
        <Button title={t('dash.settings')} onPress={() => navigation.navigate('Config', { dongle })} />
        <Button title={t('dash.log')} kind="secondary" onPress={() => navigation.navigate('Logs', { dongle })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '600', flexShrink: 1 },
  uptime: { color: colors.textDim, fontSize: 13 },
  staleTag: { color: colors.warn, fontSize: 12 },
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
