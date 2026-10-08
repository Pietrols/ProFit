import { useState } from 'react';
import { STARTER_PLANS } from '@/features/plans/starters';
import { router } from 'expo-router';
import { usePlans } from '@/features/plans/usePlans';
import { PlanState } from '@/features/plans/PlanState';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
export default function PlansScreen() {
  const { data, error, retry, useStarter } = usePlans();
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState<string | null>(null);
  if (error || !data) return <PlanState error={error} retry={retry} />;
  return <Screen title="My plans"><SyncBanner /><Button label="New plan" onPress={() => router.push('/plans/form')} />
    {!data.plans.length ? <EmptyState icon="clipboard-outline" title="Build your first plan" message="Choose a cycle or a weekly schedule. Add named days and exercises, then choose what to log." /> : null}
    {data.plans.map((plan) => <Card key={plan.id}><AppText variant="title">{plan.name}</AppText><AppText color="text2">{plan.shape === 'cycle' ? 'Cycle' : 'Weekly'} · {plan.difficulty}{plan.active ? ' · Active' : ''}</AppText><Button label={`Edit ${plan.name}`} variant="secondary" onPress={() => router.push({ pathname: '/plans/form', params: { id: plan.id } })} /></Card>)}
    <AppText variant="title">Starter plans</AppText>
    {failed ? <AppText color="caution" accessibilityLiveRegion="polite">{failed}</AppText> : null}
    {STARTER_PLANS.map((starter) => <Card key={starter.id}><AppText variant="title">{starter.name}</AppText><AppText color="text2">{starter.description}</AppText><Button label={`Use this plan: ${starter.name}`} disabled={busy} onPress={() => { setBusy(true); setFailed(null); void useStarter(starter).then((id) => router.push({ pathname: '/plans/form', params: { id } }), (e: unknown) => setFailed(e instanceof Error ? e.message : 'Could not copy this plan.')).finally(() => setBusy(false)); }} /></Card>)}
  </Screen>;
}
