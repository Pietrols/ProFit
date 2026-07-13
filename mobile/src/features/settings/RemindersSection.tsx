import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Button, ChipRow, Heading } from '../../ui';
import {
  applyReminders,
  DEFAULT_REMINDERS,
  formatTime,
  loadReminderSettings,
  ReminderSettings,
  TimeOfDay,
  WEEKDAY_LABELS,
} from './reminders';

const WEEKDAYS = ['2', '3', '4', '5', '6', '7', '1'] as const;

/** A tappable "alarm time" that opens the native time picker. */
function TimeField({
  time,
  onChange,
}: {
  time: TimeOfDay;
  onChange: (t: TimeOfDay) => void;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const asDate = new Date();
  asDate.setHours(time.hour, time.minute, 0, 0);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.colors.s2,
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
          alignSelf: 'flex-start',
        }}
      >
        <Text style={{ fontFamily: t.typography.display, fontSize: 26, color: t.colors.tx }}>
          {formatTime(time)}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={asDate}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === 'set' && date) {
              onChange({ hour: date.getHours(), minute: date.getMinutes() });
            }
          }}
        />
      )}
    </>
  );
}

export function RemindersSection() {
  const t = useAppTheme();
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    loadReminderSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<ReminderSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  async function save() {
    setNote(null);
    const result = await applyReminders(settings).catch(
      () => 'unsupported' as const,
    );
    setNote(
      result === 'ok'
        ? 'Reminders saved.'
        : result === 'denied'
          ? 'Notifications are blocked — allow them in system settings.'
          : 'Saved — reminders fire in the installed app (not Expo Go).',
    );
  }

  const rowLabel = (text: string) => (
    <Text
      style={{
        fontFamily: t.typography.label,
        fontSize: 13,
        color: t.colors.tx2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {text}
    </Text>
  );

  return (
    <View>
      <Heading>Reminders</Heading>

      {/* Training-day reminder */}
      <View style={{ marginTop: t.spacing.md, gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {rowLabel('Training days')}
          <Switch
            value={settings.training.enabled}
            onValueChange={(v) =>
              update({ training: { ...settings.training, enabled: v } })
            }
            trackColor={{ true: t.colors.green, false: t.colors.line2 }}
          />
        </View>
        {settings.training.enabled && (
          <>
            <ChipRow
              options={WEEKDAYS}
              value={null}
              multiValues={settings.training.weekdays.map(String)}
              onChange={(d) =>
                update({
                  training: {
                    ...settings.training,
                    weekdays: settings.training.weekdays.includes(Number(d))
                      ? settings.training.weekdays.filter((x) => x !== Number(d))
                      : [...settings.training.weekdays, Number(d)],
                  },
                })
              }
              labels={Object.fromEntries(
                Object.entries(WEEKDAY_LABELS).map(([k, v]) => [String(k), v]),
              )}
            />
            <TimeField
              time={settings.training.time}
              onChange={(time) => update({ training: { ...settings.training, time } })}
            />
          </>
        )}
      </View>

      {/* Meal-logging reminder */}
      <View style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {rowLabel('Log meals')}
          <Switch
            value={settings.meal.enabled}
            onValueChange={(v) => update({ meal: { ...settings.meal, enabled: v } })}
            trackColor={{ true: t.colors.green, false: t.colors.line2 }}
          />
        </View>
        {settings.meal.enabled && (
          <TimeField
            time={settings.meal.time}
            onChange={(time) => update({ meal: { ...settings.meal, time } })}
          />
        )}
      </View>

      <View style={{ height: t.spacing.md }} />
      <Button label="Save reminders" variant="ghost" onPress={save} />
      {note ? (
        <Text
          style={{
            fontFamily: t.typography.body,
            fontSize: 13,
            color: t.colors.tx2,
            marginTop: t.spacing.xs,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
