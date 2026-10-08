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
  const { data, error, retry } = usePlans();
  if (error || !data) return <PlanState error={error} retry={retry} />;
  return <Screen title="My plans"><SyncBanner /><Button label="New plan" onPress={() => router.push('/plans/form')} />
    {!data.plans.length ? <EmptyState icon="clipboard-outline" title="Build your first plan" message="Choose a cycle or a weekly schedule. Add named days and exercises, then choose what to log." /> : null}
    {data.plans.map((plan) => <Card key={plan.id}><AppText variant="title">{plan.name}</AppText><AppText color="text2">{plan.shape === 'cycle' ? 'Cycle' : 'Weekly'} · {plan.difficulty}{plan.active ? ' · Active' : ''}</AppText><Button label={`Edit ${plan.name}`} variant="secondary" onPress={() => router.push({ pathname: '/plans/form', params: { id: plan.id } })} /></Card>)}
  </Screen>;
}
