// In-chat plan proposal card (Piece 3), extracted from ChatScreen (AUDIT C2).
import React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Button } from '../../ui';
import { ProposalLines } from './usePlanBuilder';

export function ProposalCard({
  lines,
  confirming,
  onConfirm,
  onDismiss,
}: {
  lines: ProposalLines[];
  confirming: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const t = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.s1,
        borderColor: t.colors.green,
        borderWidth: 1,
        borderRadius: t.radius.md,
        padding: t.spacing.md,
        marginTop: t.spacing.sm,
      }}
    >
      {lines.map((d) => (
        <View key={d.day} style={{ marginBottom: t.spacing.sm }}>
          <Text
            style={{
              fontFamily: t.typography.label,
              fontSize: 12,
              color: t.colors.tx2,
              textTransform: 'uppercase',
            }}
          >
            {d.day}
          </Text>
          {d.items.map((line) => (
            <Text
              key={line}
              style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.tx }}
            >
              {line}
            </Text>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Add this plan" onPress={onConfirm} busy={confirming} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Not this one" variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
