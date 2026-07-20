import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { colors, space } from '../theme/theme';

interface Series {
  data: (number | null)[];
  color: string;
}

interface Props {
  title: string;
  series: Series[];
  height?: number;
}

// Multi-line time chart drawn from the stats series. Same look as the web UI
// canvas charts: faint gridlines, min/max labels, gaps for missing samples.
export default function LineChart({ title, series, height = 90 }: Props) {
  const [width, setWidth] = React.useState(0);

  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const v of s.data) {
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const hasData = min !== Infinity;
  if (!hasData) {
    min = 0;
    max = 1;
  } else if (max - min < 1e-9) {
    max += 1;
    min -= 1;
  }
  const pad = (max - min) * 0.1;
  const lo = min - pad;
  const hi = max + pad;

  const n = series[0]?.data.length ?? 0;
  const x = (i: number) => (n > 1 ? (i * width) / (n - 1) : 0);
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  function pathFor(data: (number | null)[]): string {
    let d = '';
    let pen = false;
    data.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  }

  const fmt = (v: number) => (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View
        style={{ height }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {[1, 2].map(i => (
              <Line
                key={i}
                x1={0}
                x2={width}
                y1={(height * i) / 3}
                y2={(height * i) / 3}
                stroke={colors.border}
                strokeWidth={1}
              />
            ))}
            {hasData &&
              series.map((s, i) => (
                <Path
                  key={i}
                  d={pathFor(s.data)}
                  stroke={s.color}
                  strokeWidth={1.5}
                  fill="none"
                />
              ))}
          </Svg>
        )}
        {hasData ? (
          <>
            <Text style={[styles.axis, styles.axisTop]}>{fmt(hi)}</Text>
            <Text style={[styles.axis, styles.axisBottom]}>{fmt(lo)}</Text>
          </>
        ) : (
          <Text style={styles.noData}>no data</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: space.md,
    marginBottom: space.sm,
  },
  title: {
    color: colors.textDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space.sm,
  },
  axis: { position: 'absolute', left: 4, color: colors.textDim, fontSize: 11 },
  axisTop: { top: 0 },
  axisBottom: { bottom: 0 },
  noData: {
    position: 'absolute',
    left: 8,
    top: '45%',
    color: colors.textDim,
    fontSize: 12,
  },
});
