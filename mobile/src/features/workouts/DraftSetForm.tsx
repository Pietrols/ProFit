import { useCallback, useEffect, useRef, useState } from 'react';
import { kvStore } from '@/lib/storage/local';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { recoverSetDraft, type DraftRecord, type DraftScope } from './draftRecord';
import { createWorkoutDraftStore } from './draftStorage';
import { SetForm } from './SetForm';
import type { SetValues, SnapshotExercise } from './types';
import type { SetDraftEntry, Units } from './workoutForm';

const drafts = createWorkoutDraftStore(kvStore);

// The parent keys this form by stable slot and saved-result revision, never display order.
export function DraftSetForm({
  scope,
  baseRevision,
  exercise,
  initial,
  units,
  busy,
  onLog,
  submitLabel,
  cleanupFailed,
}: {
  scope: DraftScope;
  baseRevision: string;
  exercise: SnapshotExercise;
  initial: SetValues;
  units: Units;
  busy: boolean;
  onLog: (values: SetValues) => Promise<void>;
  submitLabel?: string;
  cleanupFailed: () => void;
}) {
  const [context] = useState(() => ({ scope, baseRevision, initial, units }));
  const [record, setRecord] = useState<DraftRecord | null>(null);
  const latest = useRef<DraftRecord | null>(null);
  const live = useRef(false);
  const version = useRef(0);
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const persist = useCallback(
    async (value: DraftRecord) => {
      const writing = ++version.current;
      setStatus('saving');
      setError(null);
      try {
        await drafts.save(context.scope, value);
        if (live.current && writing === version.current) setStatus('saved');
      } catch (e) {
        if (live.current && writing === version.current) {
          setStatus('failed');
          setError(e instanceof Error ? e.message : 'Could not save draft on this phone.');
        }
      }
    },
    [context],
  );

  useEffect(() => {
    let current = true;
    live.current = true;
    ++version.current;
    void drafts
      .load(context.scope)
      .then((saved) => {
        if (!current) return;
        const value = recoverSetDraft(
          saved.record,
          context.baseRevision,
          context.initial,
          context.units,
        );
        latest.current = value;
        setRecord(value);
        if (!saved.persisted || !saved.record || saved.record.baseRevision !== context.baseRevision)
          void persist(value);
        else setStatus('saved');
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : 'Could not recover set draft.');
      });
    return () => {
      current = false;
      live.current = false;
    };
  }, [context, attempt, persist]);

  function change(entry: SetDraftEntry) {
    const current = latest.current;
    if (!current) return;
    const value = { ...current, entry };
    latest.current = value;
    void persist(value);
  }
  if (!record)
    return (
      <>
        <AppText color={error ? 'caution' : 'text2'}>
          {error ?? 'Recovering saved set draft'}
        </AppText>
        {error ? (
          <Button
            label="Retry draft recovery"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setError(null);
              retry((value) => value + 1);
            }}
          />
        ) : null}
      </>
    );
  return (
    <>
      {record.units !== units ? (
        <AppText color="text2">
          This draft keeps {record.units === 'metric' ? 'kg and metres' : 'lb and miles'}. Your new
          unit preference applies to new drafts.
        </AppText>
      ) : null}
      <SetForm
        exercise={exercise}
        initial={record.entry.original}
        units={record.units}
        savedDraft={record.entry}
        onDraftChange={change}
        busy={busy}
        submitLabel={submitLabel}
        onLog={async (values) => {
          await onLog(values);
          ++version.current;
          await drafts.clear(context.scope).catch(cleanupFailed);
        }}
      />
      <AppText
        variant="caption"
        color={status === 'failed' ? 'caution' : 'text2'}
        accessibilityLiveRegion={status === 'failed' ? 'polite' : 'none'}
      >
        {status === 'failed'
          ? `Draft is only in memory: ${error}`
          : status === 'saving'
            ? 'Saving draft on this phone'
            : 'Draft saved on this phone'}
      </AppText>
      {status === 'failed' ? (
        <Button
          label="Retry saving draft"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            if (latest.current) void persist(latest.current);
          }}
        />
      ) : null}
    </>
  );
}
