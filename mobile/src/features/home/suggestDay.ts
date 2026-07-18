// Recovery-aware "train this today" suggestion (AUDIT M3). Pure and local:
// rotation is the least-recently-trained day of the split; a rough recent
// check-in (very sore / barely slept, within 36h) steers toward the plan's
// cardio day if one exists, or suggests dialing the session back.
import { RecoveryCheckin } from '../../data/recoveryRepo';
import { Plan, PlanDay } from '../../data/planRepo';

export interface DaySuggestion {
  dayId: string;
  reason: string;
  /** recommend the per-session dial-back for this one */
  easier: boolean;
}

const ROUGH_CHECKIN_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function isRough(checkin: RecoveryCheckin | null, now: Date): boolean {
  if (!checkin) return false;
  if (now.getTime() - new Date(checkin.loggedAt).getTime() > ROUGH_CHECKIN_MAX_AGE_MS) {
    return false;
  }
  return checkin.soreness >= 4 || checkin.sleepQuality <= 2;
}

export function suggestDay(
  plan: Plan,
  sessions: { planDayId: string | null; startedAt: string }[],
  checkin: RecoveryCheckin | null,
  now: Date = new Date(),
): DaySuggestion | null {
  const split = plan.days.filter((d) => !d.isDaily);
  if (split.length === 0) return null;

  // rotation: the split day trained longest ago (never-trained wins)
  const lastTrained = new Map<string, number>();
  for (const s of sessions) {
    if (!s.planDayId) continue;
    const at = new Date(s.startedAt).getTime();
    lastTrained.set(s.planDayId, Math.max(lastTrained.get(s.planDayId) ?? 0, at));
  }
  const byStaleness = [...split].sort(
    (a, b) => (lastTrained.get(a.id) ?? 0) - (lastTrained.get(b.id) ?? 0),
  );
  const next: PlanDay = byStaleness[0];

  if (isRough(checkin, now)) {
    const cardio = split.find((d) => d.category === 'cardio');
    if (cardio && cardio.id !== next.id) {
      return {
        dayId: cardio.id,
        reason: 'Rough check-in — easy cardio keeps the streak without digging deeper.',
        easier: false,
      };
    }
    return {
      dayId: next.id,
      reason: "Rough check-in — it's next up, but consider the easier version today.",
      easier: true,
    };
  }

  return { dayId: next.id, reason: 'Next up in your split.', easier: false };
}
