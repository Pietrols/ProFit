import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useAppTheme();
  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: t.colors.bg, padding: t.spacing.lg }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useAppTheme();
  return (
    <Text
      style={{
        fontFamily: t.typography.display,
        fontSize: 34,
        color: t.colors.tx,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const t = useAppTheme();
  return (
    <Text
      style={{
        fontFamily: t.typography.heading,
        fontSize: 20,
        color: t.colors.tx,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const t = useAppTheme();
  return (
    <Text
      style={{
        fontFamily: t.typography.body,
        fontSize: 15,
        color: muted ? t.colors.tx2 : t.colors.tx,
      }}
    >
      {children}
    </Text>
  );
}

/** The neon accent underline motif from the design reference. */
export function AccentRule() {
  const t = useAppTheme();
  return (
    <View
      style={[
        {
          height: 3,
          width: 48,
          borderRadius: t.radius.sm,
          backgroundColor: t.colors.green,
          marginTop: t.spacing.xs,
          marginBottom: t.spacing.lg,
        },
        t.glow(t.colors.gGlow),
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  busy,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const t = useAppTheme();
  const bg =
    variant === 'primary'
      ? t.colors.green
      : variant === 'danger'
        ? t.colors.rdim
        : t.colors.s2;
  const fg =
    variant === 'primary'
      ? t.colors.onGreen
      : variant === 'danger'
        ? t.colors.red
        : t.colors.tx;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radius.md,
          paddingVertical: t.spacing.md,
          alignItems: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === 'primary' && !disabled ? t.glow(t.colors.gGlow) : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 16,
            color: fg,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function TextField(
  props: TextInputProps & { label: string; error?: string },
) {
  const t = useAppTheme();
  const { label, error, ...rest } = props;
  return (
    <View style={{ marginBottom: t.spacing.lg }}>
      <Text
        style={{
          fontFamily: t.typography.label,
          fontSize: 13,
          color: t.colors.tx2,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: t.spacing.xs,
        }}
      >
        {label}
      </Text>
      <TextInput
        placeholderTextColor={t.colors.tx3}
        {...rest}
        style={{
          fontFamily: t.typography.body,
          fontSize: 16,
          color: t.colors.tx,
          backgroundColor: t.colors.s1,
          borderColor: error ? t.colors.red : t.colors.line2,
          borderWidth: 1,
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.md,
        }}
      />
      {error ? (
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 13,
            color: t.colors.red,
            marginTop: t.spacing.xs,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Error state banner — red accent per design rules (red = alert). */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.rdim,
        borderRadius: t.radius.md,
        padding: t.spacing.md,
        marginVertical: t.spacing.sm,
      }}
    >
      <Text style={{ fontFamily: t.typography.body, color: t.colors.red }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={{ marginTop: t.spacing.sm }}>
          <Text style={{ fontFamily: t.typography.label, color: t.colors.red }}>
            RETRY
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Loading state — centered spinner. */
export function LoadingView() {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={t.colors.green} />
    </View>
  );
}

/** Empty state — muted, with an optional hint. */
export function EmptyView({ title, hint }: { title: string; hint?: string }) {
  const t = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.spacing.xl,
        gap: t.spacing.sm,
      }}
    >
      <Text
        style={{
          fontFamily: t.typography.heading,
          fontSize: 18,
          color: t.colors.tx2,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {hint ? (
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 14,
            color: t.colors.tx3,
            textAlign: 'center',
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Single-select chip row (goal, context, units pickers). */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  const t = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={{
              backgroundColor: active ? t.colors.gdim : t.colors.s2,
              borderColor: active ? t.colors.green : t.colors.line,
              borderWidth: 1,
              borderRadius: t.radius.sm,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
            }}
          >
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 14,
                color: active ? t.colors.green : t.colors.tx2,
                textTransform: 'uppercase',
              }}
            >
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
