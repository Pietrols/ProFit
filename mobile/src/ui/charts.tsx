// Chart primitives per the dataviz method: thin marks, 2px lines, ≥8px end
// markers, recessive grid, direct label on the last point only, text in text
// tokens. Single-series everywhere — identity comes from the section title,
// so no legend and no categorical palette. Green = progress (the one accent).
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';

export interface LinePoint {
  label: string; // short x label (e.g. "12 Jul")
  value: number;
}

export function LineChart({
  points,
  height = 160,
  width = 320,
  formatValue = (v: number) => String(v),
}: {
  points: LinePoint[];
  height?: number;
  width?: number;
  formatValue?: (v: number) => string;
}) {
  const t = useAppTheme();
  const pad = { top: 14, right: 44, bottom: 22, left: 8 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => pad.top + h - ((v - min) / span) * h;

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];

  return (
    <View>
      <Svg width={width} height={height}>
        {/* recessive grid: min and max rules only */}
        {[min, max].map((v) => (
          <Line
            key={v}
            x1={pad.left}
            x2={pad.left + w}
            y1={y(v)}
            y2={y(v)}
            stroke={t.colors.line}
            strokeWidth={1}
          />
        ))}
        <Path d={d} stroke={t.colors.green} strokeWidth={2} fill="none" />
        {/* end marker ≥8px + selective direct label (last point only) */}
        <Circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r={4}
          fill={t.colors.green}
        />
      </Svg>
      {/* direct label, text token not series color */}
      <Text
        style={{
          position: 'absolute',
          right: 0,
          top: Math.max(0, y(last.value) - 8),
          fontFamily: t.typography.label,
          fontSize: 12,
          color: t.colors.tx,
        }}
      >
        {formatValue(last.value)}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: t.typography.body, fontSize: 11, color: t.colors.tx3 }}>
          {points[0].label}
        </Text>
        <Text style={{ fontFamily: t.typography.body, fontSize: 11, color: t.colors.tx3 }}>
          {last.label}
        </Text>
      </View>
    </View>
  );
}

/** Horizontal magnitude bars: neutral fill, length carries the value. */
export function BarRow({
  label,
  value,
  max,
  formatValue = (v: number) => String(v),
}: {
  label: string;
  value: number;
  max: number;
  formatValue?: (v: number) => string;
}) {
  const t = useAppTheme();
  const frac = max > 0 ? value / max : 0;
  return (
    <View style={{ marginBottom: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx2 }}>
          {label}
        </Text>
        <Text style={{ fontFamily: t.typography.label, fontSize: 13, color: t.colors.tx }}>
          {formatValue(value)}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: t.colors.track,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.round(frac * 100)}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: t.colors.tx2,
          }}
        />
      </View>
    </View>
  );
}

/** Stat tile — the hero-number form for adherence/streak headlines. */
export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red';
}) {
  const t = useAppTheme();
  const color =
    accent === 'green' ? t.colors.green : accent === 'red' ? t.colors.red : t.colors.tx;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.s1,
        borderRadius: t.radius.lg,
        padding: t.spacing.md,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontFamily: t.typography.display, fontSize: 26, color }}>{value}</Text>
      <Text
        style={{
          fontFamily: t.typography.label,
          fontSize: 11,
          color: t.colors.tx2,
          textTransform: 'uppercase',
          marginTop: 2,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
