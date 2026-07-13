import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput } from 'react-native';
import { getDb } from '../../data/db';
import { searchExercises } from '../../data/exercisesRepo';
import { Exercise } from '../../data/types';
import { useAppTheme } from '../../theme/ThemeContext';
import { AccentRule, Button, Screen, Title } from '../../ui';

/** Reusable exercise picker over the offline library (Phase 2 search). */
export function ExercisePickerModal({
  visible,
  homeOnly,
  onPick,
  onClose,
}: {
  visible: boolean;
  homeOnly: boolean;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    (async () => {
      const db = await getDb();
      setResults(await searchExercises(db, { homeOnly }));
    })();
  }, [visible, homeOnly]);

  async function run(q: string) {
    setQuery(q);
    const db = await getDb();
    setResults(await searchExercises(db, { query: q, homeOnly }));
  }

  return (
    <Modal visible={visible} animationType="slide">
      <Screen>
        <Title>Pick exercise</Title>
        <AccentRule />
        <TextInput
          value={query}
          onChangeText={run}
          placeholder="Search exercises…"
          placeholderTextColor={t.colors.tx3}
          autoFocus
          style={{
            fontFamily: t.typography.body,
            fontSize: 16,
            color: t.colors.tx,
            backgroundColor: t.colors.s1,
            borderColor: t.colors.line2,
            borderWidth: 1,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            marginBottom: t.spacing.md,
          }}
        />
        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? t.colors.s2 : t.colors.s1,
                borderRadius: t.radius.md,
                padding: t.spacing.md,
                marginBottom: t.spacing.sm,
              })}
            >
              <Text style={{ fontFamily: t.typography.label, fontSize: 15, color: t.colors.tx }}>
                {item.name}
              </Text>
              <Text style={{ fontFamily: t.typography.body, fontSize: 12, color: t.colors.tx3 }}>
                {item.primaryMuscles.join(', ')} · {item.equipment.join(', ')}
              </Text>
            </Pressable>
          )}
        />
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </Screen>
    </Modal>
  );
}
