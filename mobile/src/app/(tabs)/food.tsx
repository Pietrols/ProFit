import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/EmptyState';

export default function FoodScreen() {
  return (
    <Screen title="Food">
      <EmptyState
        icon="restaurant-outline"
        title="Nothing logged today"
        message="Log meals, save your usual foods and see each day against your calorie target."
      />
    </Screen>
  );
}
