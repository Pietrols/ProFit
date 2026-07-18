// Starter-template browser (AUDIT U3): makes the Piece 1 templates reachable
// outside onboarding and the AI chat — from empty-Home and the plan builder.
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api, NetworkError } from '../../api/client';
import { StarterTemplate } from '../../api/types';
import { getDb } from '../../data/db';
import { saveActivePlan } from '../../data/planRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  AccentRule,
  Body,
  Button,
  ErrorBanner,
  LoadingView,
  Screen,
  Title,
} from '../../ui';
import { useAuth, useUser } from '../auth/AuthContext';
import { HomeStackParamList } from '../home/HomeStack';

export function StarterTemplatesScreen() {
  const t = useAppTheme();
  const user = useUser();
  const { session } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [templates, setTemplates] = useState<StarterTemplate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setStatus('loading');
    try {
      const { templates: list } = await api.listTemplates(
        session.token,
        user.defaultContext,
        'beginner',
      );
      setTemplates(list);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [session, user.defaultContext]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(template: StarterTemplate) {
    if (!session || addingId) return;
    setAddingId(template.id);
    setError(null);
    try {
      const { plan } = await api.createPlanFromTemplate(session.token, {
        templateId: template.id,
        context: template.context,
        experience: 'beginner',
      });
      await saveActivePlan(await getDb(), plan);
      nav.popToTop();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'Offline — adding a plan needs a connection.'
          : 'Could not add the plan. Please try again.',
      );
      setAddingId(null);
    }
  }

  return (
    <Screen>
      <Title>Starter plans</Title>
      <AccentRule />
      {status === 'loading' ? (
        <LoadingView />
      ) : status === 'error' ? (
        <ErrorBanner message="Could not load the starter plans." onRetry={load} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ marginBottom: t.spacing.md }}>
            <Body muted>
              Ready-made, evidence-based starting points. Adding one replaces
              your current active plan.
            </Body>
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          {templates.map((tpl) => {
            const open = openId === tpl.id;
            return (
              <Pressable
                key={tpl.id}
                onPress={() => setOpenId(open ? null : tpl.id)}
                style={{
                  backgroundColor: t.colors.s1,
                  borderRadius: t.radius.lg,
                  padding: t.spacing.lg,
                  marginBottom: t.spacing.md,
                }}
              >
                <Text
                  style={{
                    fontFamily: t.typography.heading,
                    fontSize: 17,
                    color: t.colors.tx,
                    textTransform: 'uppercase',
                  }}
                >
                  {tpl.title}
                </Text>
                <Text
                  style={{
                    fontFamily: t.typography.body,
                    fontSize: 13,
                    color: t.colors.tx2,
                    marginTop: t.spacing.xs,
                  }}
                >
                  {tpl.description}
                </Text>
                {open ? (
                  <View style={{ marginTop: t.spacing.md, gap: t.spacing.sm }}>
                    {tpl.days.map((d) => (
                      <View key={d.name}>
                        <Text
                          style={{
                            fontFamily: t.typography.label,
                            fontSize: 12,
                            color: t.colors.tx2,
                            textTransform: 'uppercase',
                          }}
                        >
                          {d.name}
                        </Text>
                        {d.exercises.map((e) => (
                          <Text
                            key={e.exerciseId}
                            style={{
                              fontFamily: t.typography.body,
                              fontSize: 13,
                              color: t.colors.tx,
                            }}
                          >
                            {e.exercise.name} — {e.sets}×{e.reps}
                          </Text>
                        ))}
                      </View>
                    ))}
                    <Text
                      style={{
                        fontFamily: t.typography.body,
                        fontSize: 12,
                        color: t.colors.tx3,
                      }}
                    >
                      {tpl.disclaimer}
                    </Text>
                    <Button
                      label="Add this plan"
                      onPress={() => add(tpl)}
                      busy={addingId === tpl.id}
                    />
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: t.typography.body,
                      fontSize: 13,
                      color: t.colors.tx3,
                      marginTop: t.spacing.xs,
                    }}
                  >
                    {tpl.days.length} days — tap for details
                  </Text>
                )}
              </Pressable>
            );
          })}
          <Button label="Back" variant="ghost" onPress={() => nav.goBack()} />
          <View style={{ height: t.spacing.xxl }} />
        </ScrollView>
      )}
    </Screen>
  );
}
