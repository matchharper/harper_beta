import {
  endSimulationSession,
  SESSION_IDLE_MS,
  type SimulationSession,
} from "./session";
import type { SessionRecord } from "./sessionStore";

// Local UX prototype only. This state intentionally disappears on server restart.
type Entry = {
  userId: string;
  conversationId: string;
  record: SessionRecord;
  startKey?: string;
  keys: Set<string>;
};
const scope = globalThis as typeof globalThis & {
  harperDevSimulationSessions?: Map<number, Entry>;
};
const entries = () => (scope.harperDevSimulationSessions ??= new Map());
export function readDevSimulationSession(userId: string, messageId: number) {
  if (process.env.NODE_ENV !== "development") return null;
  const entry = entries().get(messageId);
  return entry?.userId === userId ? structuredClone(entry.record) : null;
}
export function devSessionOperation(args: {
  userId: string;
  conversationId: string;
  operation: "read" | "touch" | "begin" | "save";
  record?: SessionRecord;
  state?: SimulationSession;
  key?: string;
  messageId?: number;
}): SessionRecord | null {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Local simulation sessions are development-only");
  const map = entries();
  const explicitId = args.record?.messageId ?? args.messageId;
  const entry =
    explicitId !== undefined
      ? map.get(explicitId)
      : [...map.values()].find(
          (e) =>
            e.userId === args.userId &&
            e.conversationId === args.conversationId &&
            e.record.state.status === "active"
        );
  if (
    entry &&
    (entry.userId !== args.userId ||
      entry.conversationId !== args.conversationId)
  )
    throw new Error("Session unavailable");
  if (args.operation === "begin") {
    if (entry) {
      if (entry.startKey === args.key) return structuredClone(entry.record);
      throw new Error("An active simulation already exists");
    }
    if (!args.state || args.state.status !== "active")
      throw new Error("Invalid session");
    let id = Date.now();
    while (map.has(id)) id++;
    const record = {
      messageId: id,
      state: { ...structuredClone(args.state), revision: 1 },
    };
    map.set(id, {
      userId: args.userId,
      conversationId: args.conversationId,
      record,
      startKey: args.key,
      keys: new Set(),
    });
    return structuredClone(record);
  }
  if (!entry) return null;
  if (args.operation === "read") return structuredClone(entry.record);
  if (args.key && entry.keys.has(args.key))
    return structuredClone(entry.record);
  if (entry.record.state.status !== "active")
    throw new Error("Session is no longer active");
  if (args.operation === "save") {
    if (
      !args.state ||
      args.record?.state.revision !== entry.record.state.revision
    )
      throw new Error("Session revision conflict");
    if (args.state.sessionId !== entry.record.state.sessionId)
      throw new Error("Invalid session update");
    entry.record.state = {
      ...structuredClone(args.state),
      revision: entry.record.state.revision + 1,
    };
    if (args.key) entry.keys.add(args.key);
  } else {
    const state = entry.record.state;
    const now = Date.now();
    if (
      state.analysisStatus === "running" &&
      now - Date.parse(state.analysisStartedAt) > 10 * 60_000
    ) {
      state.analysisStatus = "failed";
      state.revision++;
    } else if (
      state.analysisStatus !== "running" &&
      now - Date.parse(state.lastActivityAt) > SESSION_IDLE_MS
    ) {
      entry.record.state = {
        ...endSimulationSession(state, "expired"),
        revision: state.revision + 1,
      };
    }
    entry.record.state.lastActivityAt = new Date(now).toISOString();
  }
  return structuredClone(entry.record);
}

// Serialize local mutations across awaited persistence; roll back on archive failure.
const localOperations = new Map<string, Promise<unknown>>();
export async function devSessionTransaction<T>(
  userId: string,
  conversationId: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = `${userId}:${conversationId}`;
  const previous = localOperations.get(key) ?? Promise.resolve();
  const pending = previous
    .catch(() => {})
    .then(async () => {
      const before = [...entries().entries()]
        .filter(
          ([, e]) => e.userId === userId && e.conversationId === conversationId
        )
        .map(([id, e]) => [id, structuredClone(e)] as const);
      try {
        return await operation();
      } catch (error) {
        for (const [id, e] of entries()) {
          if (e.userId === userId && e.conversationId === conversationId)
            entries().delete(id);
        }
        for (const [id, e] of before) entries().set(id, e);
        throw error;
      }
    });
  localOperations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (localOperations.get(key) === pending) localOperations.delete(key);
  }
}
