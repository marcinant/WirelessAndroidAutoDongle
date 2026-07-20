import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../theme/theme';

type StatusTone = 'ok' | 'warn' | 'bad' | 'dim';
const toneColor: Record<StatusTone, string> = {
  ok: colors.ok,
  warn: colors.warn,
  bad: colors.bad,
  dim: colors.text,
};

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatTile({
  label,
  value,
  tone = 'dim',
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, { color: toneColor[tone] }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg =
    kind === 'primary' ? colors.accent : kind === 'danger' ? '#8a3b2e' : colors.border;
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bg }, (disabled || loading) && styles.buttonOff]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}>
      {loading ? (
        <ActivityIndicator color={colors.accentText} size="small" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  autoCapitalize = 'none',
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'url';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  tileLabel: {
    color: colors.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileValue: { fontSize: 15, marginTop: space.xs },
  section: {
    color: colors.textMid,
    fontSize: 15,
    fontWeight: '600',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  button: {
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
    marginTop: space.sm,
    minWidth: 96,
  },
  buttonOff: { opacity: 0.5 },
  buttonText: { color: colors.accentText, fontWeight: '600' },
  fieldWrap: { marginBottom: space.sm },
  fieldLabel: { color: colors.textDim, fontSize: 13, marginBottom: space.xs },
  input: {
    backgroundColor: colors.inputBg,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    fontSize: 15,
  },
});
