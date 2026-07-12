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
import { getDb } from '../../data/db';
import { cacheChatMessages, ChatMessage, listChatLocal } from '../../data/chatRepo';
import { useAppTheme } from '../../theme/ThemeContext';
import { AccentRule, EmptyView, LoadingView, Screen, Title } from '../../ui';
import { useAuth } from '../auth/AuthContext';

type CoachState = 'ok' | 'unavailable' | 'offline' | 'rate_limited';

export function ChatScreen() {
  const t = useAppTheme();
  const { session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [coach, setCoach] = useState<CoachState>('ok');
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
      if (e instanceof ApiError && e.code === 'AI_UNAVAILABLE') setCoach('unavailable');
      else if (e instanceof ApiError && e.code === 'CHAT_RATE_LIMITED') setCoach('rate_limited');
      else if (e instanceof NetworkError) setCoach('offline');
      else setCoach('unavailable');
    } finally {
      setSending(false);
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

  return (
    <Screen>
      <Title>Coach</Title>
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

        {messages.length === 0 ? (
          <EmptyView
            title="Ask your coach"
            hint={'Try: "What can I swap for lat pulldown at home?" — answers use your plan, logs, and equipment.'}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
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
            onPress={send}
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
