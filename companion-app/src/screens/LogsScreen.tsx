import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../nav';
import { colors, space } from '../theme/theme';
import { getLog, setWebuiPassword } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Logs'>;

export default function LogsScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const dongle = route.params.dongle;
  const [text, setText] = React.useState('');
  const [paused, setPaused] = React.useState(false);
  const [follow, setFollow] = React.useState(true);
  const scroll = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    setWebuiPassword(dongle.webuiPassword);
    let alive = true;
    const tick = () => {
      if (paused) return;
      getLog(400)
        .then(t => {
          if (!alive) return;
          setText(t);
          if (follow) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false }));
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [paused, follow, dongle.webuiPassword]);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView ref={scroll} style={styles.log} contentContainerStyle={styles.logContent}>
        <Text style={styles.mono} selectable>
          {text || 'loading…'}
        </Text>
      </ScrollView>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.barBtn} onPress={() => setPaused(p => !p)}>
          <Text style={styles.barText}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.barBtn} onPress={() => setFollow(f => !f)}>
          <Text style={[styles.barText, follow && styles.on]}>Follow {follow ? 'on' : 'off'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  log: { flex: 1, backgroundColor: colors.inputBg, margin: space.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  logContent: { padding: space.md },
  mono: { color: colors.textMid, fontSize: 11, fontFamily: 'monospace' },
  bar: { flexDirection: 'row', paddingHorizontal: space.md, gap: space.sm },
  barBtn: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingVertical: 9, paddingHorizontal: space.lg },
  barText: { color: colors.textMid, fontSize: 14 },
  on: { color: colors.ok },
});
