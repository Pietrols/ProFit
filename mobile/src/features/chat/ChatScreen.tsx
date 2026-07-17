import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError, NetworkError } from '../../api/client';
import { BuilderMessage, PlanProposal } from '../../api/types';
import { getDb } from '../../data/db';
import { cacheChatMessages, ChatMessage, listChatLocal } from '../../data/chatRepo';
import { getExercise } from '../../data/exercisesRepo';
import { saveActivePlan } from '../../data/planRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import { AccentRule, Button, EmptyView, LoadingView, Screen, Title } from '../../ui';
import { useAuth } from '../auth/AuthContext';
import { proposalToCustomPlanInput } from './planBuilderConfirm';

type CoachState = 'ok' | 'unavailable' | 'offline' | 'rate_limited';

// Conversational plan builder (Piece 3): ephemeral, server-stateless side
// conversation. Nothing is written until the user taps "Add this plan".
interface BuilderState {
  messages: BuilderMessage[];
  proposal: { summary: string; proposal: PlanProposal } | null;
  /** display lines resolved for the proposal card */
  lines: { day: string; items: string[] }[];
  added: boolean;
}

const BUILDER_INTRO =
  "Let's build you a plan. Tell me a bit about yourself — how experienced " +
  'you are, where you train, and what you want to achieve.';

export function ChatScreen() {
  const t = useAppTheme();
  const { session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [coach, setCoach] = useState<CoachState>('ok');
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    setMessages(await listChatLocal(db)); // offline-readable cache first
    setStatus('ready');
    if (!session) return;
    try {
      const { messages: remote } = await api.getChatHistory(session.token);
      await cacheChatMessages(db, remote);
      setMessages(await listChatLocal(db));
      setCoach('ok');
    } catch (e) {
      if (e instanceof NetworkError) setCoach('offline');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !session) return;
    setSending(true);
    setInput('');

    // optimistic local echo (replaced by server history on next load)
    const localMsg: ChatMessage = {
      id: Crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, localMsg]);

    try {
      const { reply } = await api.sendChat(session.token, text);
      setCoach('ok');
      setMessages((prev) => [...prev, { ...reply, role: 'assistant' }]);
      const db = await getDb();
      await cacheChatMessages(db, [localMsg, { ...reply, role: 'assistant' }]);
    } catch (e) {
      // roll the optimistic echo back — nothing answered it
      setMessages((prev) => prev.filter((m) => m.id !== localMsg.id));
      setInput(text);
      handleCoachError(e);
    } finally {
      setSending(false);
    }
  }

  function handleCoachError(e: unknown) {
    if (e instanceof ApiError && e.code === 'AI_UNAVAILABLE') setCoach('unavailable');
    else if (e instanceof ApiError && e.code === 'CHAT_RATE_LIMITED') setCoach('rate_limited');
    else if (e instanceof NetworkError) setCoach('offline');
    else setCoach('unavailable');
  }

  async function resolveProposalLines(
    p: PlanProposal,
  ): Promise<{ day: string; items: string[] }[]> {
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

  async function sendBuilder() {
    const text = input.trim();
    if (!text || sending || !session || !builder) return;
    setSending(true);
    setInput('');
    const sent = [...builder.messages, { role: 'user' as const, content: text }];
    setBuilder({ ...builder, messages: sent, proposal: null, lines: [] });
    try {
      const reply = await api.planBuilder(session.token, sent);
      setCoach('ok');
      if (reply.action === 'ask') {
        setBuilder((b) =>
          b && {
            ...b,
            messages: [...sent, { role: 'assistant' as const, content: reply.question }],
          },
        );
      } else {
        const lines = await resolveProposalLines(reply.proposal);
        setBuilder((b) =>
          b && {
            ...b,
            messages: [...sent, { role: 'assistant' as const, content: reply.summary }],
            proposal: { summary: reply.summary, proposal: reply.proposal },
            lines,
          },
        );
      }
    } catch (e) {
      // roll back the unanswered turn so it can be edited and resent
      setBuilder((b) => b && { ...b, messages: builder.messages });
      setInput(text);
      handleCoachError(e);
    } finally {
      setSending(false);
    }
  }

  // The ONLY place a builder proposal becomes a real plan — explicit tap.
  async function confirmProposal() {
    if (!session || !builder?.proposal || confirming) return;
    setConfirming(true);
    const p = builder.proposal.proposal;
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
          added: true,
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
      handleCoachError(e);
    } finally {
      setConfirming(false);
    }
  }

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  const banner: Record<Exclude<CoachState, 'ok'>, string> = {
    unavailable: 'Coach unavailable right now — your history is safe and everything else still works.',
    offline: "You're offline — reading past conversations; sending needs a connection.",
    rate_limited: 'Coach chat limit reached for now — try again in a bit.',
  };

  // builder messages rendered through the same bubble list
  const shownMessages: ChatMessage[] = builder
    ? builder.messages.map((m, i) => ({
        id: `b-${i}`,
        role: m.role,
        content: m.content,
        createdAt: '',
      }))
    : messages;

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Title>{builder ? 'Plan builder' : 'Coach'}</Title>
        {builder ? (
          <Pressable onPress={() => setBuilder(null)} hitSlop={8} accessibilityRole="button">
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 13,
                color: t.colors.tx3,
                textTransform: 'uppercase',
              }}
            >
              Exit
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() =>
              setBuilder({
                messages: [{ role: 'assistant', content: BUILDER_INTRO }],
                proposal: null,
                lines: [],
                added: false,
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            style={{
              backgroundColor: t.colors.gdim,
              borderColor: t.colors.green,
              borderWidth: 1,
              borderRadius: t.radius.sm,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.xs,
            }}
          >
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 13,
                color: t.colors.green,
                textTransform: 'uppercase',
              }}
            >
              Build a plan
            </Text>
          </Pressable>
        )}
      </View>
      <AccentRule />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {coach !== 'ok' && (
          <View
            style={{
              backgroundColor: t.colors.bdim,
              borderRadius: t.radius.md,
              padding: t.spacing.md,
              marginBottom: t.spacing.sm,
            }}
          >
            <Text style={{ fontFamily: t.typography.body, fontSize: 13, color: t.colors.blue }}>
              {banner[coach]}
            </Text>
          </View>
        )}

        {shownMessages.length === 0 ? (
          <EmptyView
            title="Ask your coach"
            hint={'Try: "What can I swap for lat pulldown at home?" — answers use your plan, logs, and equipment.'}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={shownMessages}
            keyExtractor={(m) => m.id}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <View
                style={{
                  alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  backgroundColor: item.role === 'user' ? t.colors.s2 : t.colors.bdim,
                  borderRadius: t.radius.lg,
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.sm,
                  marginBottom: t.spacing.sm,
                }}
              >
                <Text
                  style={{
                    fontFamily: t.typography.body,
                    fontSize: 14,
                    color: item.role === 'user' ? t.colors.tx : t.colors.blue,
                  }}
                >
                  {item.content}
                </Text>
              </View>
            )}
          />
        )}

        {builder?.proposal ? (
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
            {builder.lines.map((d) => (
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
                <Button label="Add this plan" onPress={confirmProposal} busy={confirming} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Not this one"
                  variant="ghost"
                  onPress={() =>
                    setBuilder((b) => b && { ...b, proposal: null, lines: [] })
                  }
                />
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingTop: t.spacing.sm }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask the coach…"
            placeholderTextColor={t.colors.tx3}
            multiline
            style={{
              flex: 1,
              fontFamily: t.typography.body,
              color: t.colors.tx,
              backgroundColor: t.colors.s1,
              borderColor: t.colors.line2,
              borderWidth: 1,
              borderRadius: t.radius.md,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
              maxHeight: 100,
            }}
          />
          <Pressable
            onPress={builder ? sendBuilder : send}
            disabled={sending || !input.trim()}
            style={[
              {
                width: 48,
                borderRadius: t.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: input.trim() ? t.colors.blue : t.colors.s2,
                opacity: sending ? 0.6 : 1,
              },
              input.trim() ? t.glow(t.colors.bGlow) : null,
            ]}
          >
            <Text
              style={{
                fontFamily: t.typography.label,
                fontSize: 16,
                color: input.trim() ? t.colors.onBlue : t.colors.tx3,
              }}
            >
              ➤
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
