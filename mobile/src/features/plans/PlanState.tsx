import { AppText } from '@/ui/AppText';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
export function PlanState({ error, retry, missing = false }: { error: string | null; retry: () => void; missing?: boolean }) {
  return <Screen><EmptyState icon={error ? 'warning-outline' : 'clipboard-outline'} title={error ? 'Could not load plans' : missing ? 'No longer available' : 'Loading plans'} message={error ?? (missing ? 'This plan or day may have been deleted on another phone.' : 'Reading plans saved on this phone.')} actionLabel={error || missing ? 'Try again' : undefined} onAction={retry} />{!error && !missing ? <AppText color="text2">Loading…</AppText> : null}</Screen>;
}
