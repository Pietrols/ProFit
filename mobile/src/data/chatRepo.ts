// Local cache of the server-owned chat history so past coach conversations
// are readable offline. Idempotent replace on server ids.
import { DbLike } from './types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export async function cacheChatMessages(
  db: DbLike,
  messages: ChatMessage[],
): Promise<void> {
  for (const m of messages) {
    await db.runAsync(
      `INSERT OR REPLACE INTO chat_messages (id, role, content, created_at)
       VALUES (?,?,?,?)`,
      [m.id, m.role, m.content, m.createdAt],
    );
  }
}

export async function listChatLocal(db: DbLike): Promise<ChatMessage[]> {
  const rows = await db.getAllAsync<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>('SELECT * FROM chat_messages ORDER BY created_at ASC');
  return rows.map((r) => ({
    id: r.id,
    role: r.role as ChatMessage['role'],
    content: r.content,
    createdAt: r.created_at,
  }));
}
