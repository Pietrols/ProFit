// Conversational plan builder state (Piece 3), extracted from ChatScreen
// (AUDIT C2). Ephemeral, server-stateless side conversation: nothing is
// written until confirm() — the explicit "Add this plan" tap.
import { useState } from 'react';
import { api } from '../../api/client';
import { BuilderMessage, PlanProposal } from '../../api/types';
import { getDb } from '../../data/db';
import { getExercise } from '../../data/exercisesRepo';
import { saveActivePlan } from '../../data/planRepo';
import { useAuth } from '../auth/AuthContext';
import { proposalToCustomPlanInput } from './planBuilderConfirm';

export interface ProposalLines {
  day: string;
  items: string[];
}

interface BuilderState {
  messages: BuilderMessage[];
  proposal: PlanProposal | null;
  /** display lines resolved for the proposal card */
  lines: ProposalLines[];
}

const BUILDER_INTRO =
  "Let's build you a plan. Tell me a bit about yourself — how experienced " +
  'you are, where you train, and what you want to achieve.';

export function usePlanBuilder(onCoachError: (e: unknown) => void) {
  const { session } = useAuth();
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function resolveLines(p: PlanProposal): Promise<ProposalLines[]> {
    if (p.kind === 'template') {
      if (!session) return [];
      try {
        const { templates } = await api.listTemplates(session.token, p.context, p.experience);
        const tpl = templates.find((x) => x.id === p.templateId);
        return (
          tpl?.days.map((d) => ({
            day: d.name,
            items: d.exercises.map((e) => `${e.exercise.name} — ${e.sets}×${e.reps}`),
          })) ?? []
        );
      } catch {
        return []; // card still renders with the summary alone
      }
    }
    const db = await getDb();
    return Promise.all(
      p.days.map(async (d) => ({
        day: d.name,
        items: await Promise.all(
          d.exercises.map(async (e) => {
            const ex = await getExercise(db, e.exerciseId);
            return `${ex?.name ?? e.exerciseId} — ${e.sets}×${e.reps}`;
          }),
        ),
      })),
    );
  }

  /** Send one builder turn. Returns false if the turn failed (input should be restored). */
  async function send(text: string): Promise<boolean> {
    if (!text || sending || !session || !builder) return true;
    setSending(true);
    const sent = [...builder.messages, { role: 'user' as const, content: text }];
    setBuilder({ ...builder, messages: sent, proposal: null, lines: [] });
    try {
      const reply = await api.planBuilder(session.token, sent);
      if (reply.action === 'ask') {
        setBuilder((b) =>
          b && { ...b, messages: [...sent, { role: 'assistant' as const, content: reply.question }] },
        );
      } else {
        const lines = await resolveLines(reply.proposal);
        setBuilder((b) =>
          b && {
            ...b,
            messages: [...sent, { role: 'assistant' as const, content: reply.summary }],
            proposal: reply.proposal,
            lines,
          },
        );
      }
      return true;
    } catch (e) {
      // roll back the unanswered turn so it can be edited and resent
      setBuilder((b) => b && { ...b, messages: builder.messages });
      onCoachError(e);
      return false;
    } finally {
      setSending(false);
    }
  }

  // The ONLY place a builder proposal becomes a real plan — explicit tap.
  async function confirm() {
    const p = builder?.proposal;
    if (!session || !p || confirming) return;
    setConfirming(true);
    try {
      const { plan } =
        p.kind === 'template'
          ? await api.createPlanFromTemplate(session.token, {
              templateId: p.templateId,
              context: p.context,
              experience: p.experience,
            })
          : await api.createCustomPlan(session.token, proposalToCustomPlanInput(p));
      await saveActivePlan(await getDb(), plan);
      setBuilder((b) =>
        b && {
          ...b,
          proposal: null,
          lines: [],
          messages: [
            ...b.messages,
            {
              role: 'assistant' as const,
              content: `Added "${plan.name}" as your active plan — it's waiting on Home.`,
            },
          ],
        },
      );
    } catch (e) {
      onCoachError(e);
    } finally {
      setConfirming(false);
    }
  }

  return {
    active: builder !== null,
    messages: builder?.messages ?? [],
    proposal: builder?.proposal ?? null,
    lines: builder?.lines ?? [],
    sending,
    confirming,
    enter: () =>
      setBuilder({
        messages: [{ role: 'assistant', content: BUILDER_INTRO }],
        proposal: null,
        lines: [],
      }),
    exit: () => setBuilder(null),
    dismissProposal: () => setBuilder((b) => b && { ...b, proposal: null, lines: [] }),
    send,
    confirm,
  };
}
