import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type TalentSummary = {
  email: string | null;
  headline: string | null;
  name: string | null;
  profilePicture: string | null;
  userId: string;
};

type UntypedAdminClient = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type InternalDebugCallItem = OpsDebugCallItem & {
  sortAt: string;
};

type RawCallMessage = {
  content: string | null;
  conversation_id: string | null;
  created_at: string | null;
  id: number | null;
  message_type: string | null;
  role: string | null;
  user_id: string | null;
};

export type OpsDebugCallStatus =
  | "all"
  | "pending"
  | "active"
  | "completed"
  | "abandoned";

export type OpsDebugCallTranscriptEntry = {
  createdAt: string;
  id: number;
  messageType: "call_transcript" | "call_wrapup";
  role: string;
  text: string;
};

export type OpsDebugCallItem = {
  assistantTurnCount: number;
  completedAt: string | null;
  conversationId: string | null;
  createdAt: string;
  durationSeconds: number | null;
  id: string;
  kind: string;
  lastActiveAt: string;
  startedAt: string;
  state: Record<string, unknown>;
  status: string;
  talent: TalentSummary;
  transcriptCount: number;
  transcriptEntries: OpsDebugCallTranscriptEntry[];
  transcriptPreview: string | null;
  updatedAt: string;
  userId: string;
  userTurnCount: number;
  wrapupMessages: OpsDebugCallTranscriptEntry[];
};

export type OpsDebugCallStats = {
  abandonedCount: number;
  activeCount: number;
  completedCount: number;
  pendingCount: number;
  sourceLimitReached: boolean;
  totalCount: number;
  withTranscriptCount: number;
};

export type OpsDebugCallsResponse = {
  calls: OpsDebugCallItem[];
  filters: {
    kind: string;
    query: string;
    startedFrom: string | null;
    startedTo: string | null;
    status: OpsDebugCallStatus;
  };
  hasMore: boolean;
  limit: number;
  nextOffset: number | null;
  offset: number;
  stats: OpsDebugCallStats;
};

const DEFAULT_DEBUG_CALL_LIMIT = 40;
const MAX_DEBUG_CALL_LIMIT = 80;
const MAX_DEBUG_CALL_SOURCE_LIMIT = 1200;
const CALL_TRANSCRIPT_MESSAGE_TYPE = "call_transcript";
const CALL_WRAPUP_MESSAGE_TYPE = "call_wrapup";
const CALL_MESSAGE_TYPES = [
  CALL_TRANSCRIPT_MESSAGE_TYPE,
  CALL_WRAPUP_MESSAGE_TYPE,
];
const CALL_START_SLACK_MS = 5 * 60 * 1000;
const CALL_END_SLACK_MS = 20 * 60 * 1000;

function toUntypedAdmin(
  admin: ReturnType<typeof getTalentSupabaseAdmin>
): UntypedAdminClient {
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirstRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSearchQuery(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function normalizeKind(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function parseDateOnly(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

function toKstDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function toKstNextDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)
  ).toISOString();
}

function normalizeDateRange(args: {
  startedFrom?: string | null;
  startedTo?: string | null;
}) {
  let from = parseDateOnly(args.startedFrom);
  let to = parseDateOnly(args.startedTo);
  if (!from && to) from = to;
  if (from && !to) to = from;
  if (from && to && to < from) {
    const nextFrom = to;
    to = from;
    from = nextFrom;
  }

  return {
    from,
    startIso: from ? toKstDayStartIso(from) : null,
    to,
    endExclusiveIso: to ? toKstNextDayStartIso(to) : null,
  };
}

function parseTimestamp(value: string | null | undefined) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDurationSeconds(call: {
  completedAt: string | null;
  lastActiveAt: string;
  startedAt: string;
}) {
  const startedAt = parseTimestamp(call.startedAt);
  const endedAt = parseTimestamp(call.completedAt ?? call.lastActiveAt);
  if (startedAt === null || endedAt === null || endedAt < startedAt)
    return null;
  return Math.round((endedAt - startedAt) / 1000);
}

function parseTalent(value: unknown, fallbackUserId: string): TalentSummary {
  const row = getFirstRecord(value);
  const userId = getString(row.user_id) ?? fallbackUserId;
  return {
    email: getString(row.email),
    headline: getString(row.headline),
    name: getString(row.name),
    profilePicture: getString(row.profile_picture),
    userId,
  };
}

function normalizeMessageType(
  value: string | null
): "call_transcript" | "call_wrapup" | null {
  if (value === CALL_TRANSCRIPT_MESSAGE_TYPE)
    return CALL_TRANSCRIPT_MESSAGE_TYPE;
  if (value === CALL_WRAPUP_MESSAGE_TYPE) return CALL_WRAPUP_MESSAGE_TYPE;
  return null;
}

function buildTranscriptPreview(entries: OpsDebugCallTranscriptEntry[]) {
  const preview = entries
    .slice(0, 6)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return preview ? preview.slice(0, 280) : null;
}

function transcriptEntryFromRow(
  row: RawCallMessage
): OpsDebugCallTranscriptEntry | null {
  const messageType = normalizeMessageType(row.message_type);
  const text = getString(row.content);
  if (!messageType || !text || row.id === null) return null;

  return {
    createdAt: getString(row.created_at) ?? new Date(0).toISOString(),
    id: row.id,
    messageType,
    role: getString(row.role) ?? "unknown",
    text,
  };
}

function callFromRow(row: any): InternalDebugCallItem {
  const userId = getString(row.user_id) ?? "";
  const startedAt = getString(row.started_at) ?? new Date(0).toISOString();
  const lastActiveAt = getString(row.last_active_at) ?? startedAt;
  const completedAt = getString(row.completed_at);
  const createdAt = getString(row.created_at) ?? startedAt;
  const updatedAt = getString(row.updated_at) ?? lastActiveAt;

  return {
    assistantTurnCount: 0,
    completedAt,
    conversationId: getString(row.conversation_id),
    createdAt,
    durationSeconds: getDurationSeconds({
      completedAt,
      lastActiveAt,
      startedAt,
    }),
    id: getString(row.id) ?? "",
    kind: getString(row.kind) ?? "unknown",
    lastActiveAt,
    sortAt: lastActiveAt,
    startedAt,
    state: asRecord(row.state),
    status: getString(row.status) ?? "unknown",
    talent: parseTalent(row.talent, userId),
    transcriptCount: 0,
    transcriptEntries: [],
    transcriptPreview: null,
    updatedAt,
    userId,
    userTurnCount: 0,
    wrapupMessages: [],
  };
}

function compareCalls(a: InternalDebugCallItem, b: InternalDebugCallItem) {
  const aTime = parseTimestamp(a.sortAt) ?? 0;
  const bTime = parseTimestamp(b.sortAt) ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  return b.id.localeCompare(a.id);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function messageKey(row: Pick<RawCallMessage, "conversation_id" | "user_id">) {
  return `${row.conversation_id ?? ""}:${row.user_id ?? ""}`;
}

function getCallWindow(call: InternalDebugCallItem) {
  const startedAt = parseTimestamp(call.startedAt);
  if (startedAt === null) return null;

  const startWindow = startedAt - CALL_START_SLACK_MS;
  const activeEnd =
    call.status === "active" || call.status === "pending"
      ? Date.now()
      : (parseTimestamp(call.completedAt ?? call.lastActiveAt) ?? startedAt);
  const endWindow = Math.max(activeEnd, startedAt) + CALL_END_SLACK_MS;
  return {
    end: endWindow,
    span: endWindow - startWindow,
    start: startWindow,
    startedAt,
  };
}

function chooseBestCallForMessage(
  calls: InternalDebugCallItem[],
  message: RawCallMessage
) {
  const messageAt = parseTimestamp(message.created_at);
  if (messageAt === null) return null;

  const matches = calls
    .map((call) => {
      const window = getCallWindow(call);
      if (!window || messageAt < window.start || messageAt > window.end) {
        return null;
      }
      return {
        call,
        distanceFromStart: Math.abs(messageAt - window.startedAt),
        span: window.span,
        statusRank: call.status === "completed" ? 0 : 1,
      };
    })
    .filter(Boolean) as {
    call: InternalDebugCallItem;
    distanceFromStart: number;
    span: number;
    statusRank: number;
  }[];

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (a.span !== b.span) return a.span - b.span;
    if (a.statusRank !== b.statusRank) return a.statusRank - b.statusRank;
    if (a.distanceFromStart !== b.distanceFromStart) {
      return a.distanceFromStart - b.distanceFromStart;
    }
    return b.call.id.localeCompare(a.call.id);
  });

  return matches[0]?.call ?? null;
}

function attachMessagesToCalls(args: {
  calls: InternalDebugCallItem[];
  messages: RawCallMessage[];
}) {
  const callsByKey = new Map<string, InternalDebugCallItem[]>();
  const messagesByCallId = new Map<string, RawCallMessage[]>();

  for (const call of args.calls) {
    if (!call.conversationId) continue;
    const key = `${call.conversationId}:${call.userId}`;
    const current = callsByKey.get(key) ?? [];
    current.push(call);
    callsByKey.set(key, current);
  }

  for (const message of args.messages) {
    const candidates = callsByKey.get(messageKey(message)) ?? [];
    const call = chooseBestCallForMessage(candidates, message);
    if (!call) continue;
    const current = messagesByCallId.get(call.id) ?? [];
    current.push(message);
    messagesByCallId.set(call.id, current);
  }

  return args.calls.map((call) => {
    const entries = (messagesByCallId.get(call.id) ?? [])
      .map(transcriptEntryFromRow)
      .filter(Boolean) as OpsDebugCallTranscriptEntry[];
    const transcriptEntries = entries.filter(
      (entry) => entry.messageType === CALL_TRANSCRIPT_MESSAGE_TYPE
    );
    const wrapupMessages = entries.filter(
      (entry) => entry.messageType === CALL_WRAPUP_MESSAGE_TYPE
    );

    return {
      ...call,
      assistantTurnCount: transcriptEntries.filter(
        (entry) => entry.role === "assistant"
      ).length,
      transcriptCount: transcriptEntries.length,
      transcriptEntries,
      transcriptPreview: buildTranscriptPreview(transcriptEntries),
      userTurnCount: transcriptEntries.filter((entry) => entry.role === "user")
        .length,
      wrapupMessages,
    };
  });
}

function getMessageDateBounds(calls: InternalDebugCallItem[]) {
  const starts = calls
    .map((call) => parseTimestamp(call.startedAt))
    .filter((value): value is number => value !== null);
  const ends = calls
    .map((call) =>
      parseTimestamp(call.completedAt ?? call.lastActiveAt ?? call.startedAt)
    )
    .filter((value): value is number => value !== null);
  if (starts.length === 0 || ends.length === 0) {
    return { endIso: null, startIso: null };
  }
  return {
    endIso: new Date(Math.max(...ends) + 24 * 60 * 60 * 1000).toISOString(),
    startIso: new Date(Math.min(...starts) - 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function fetchCallCandidates(args: {
  admin: UntypedAdminClient;
  dateRange: ReturnType<typeof normalizeDateRange>;
  kind: string;
  limit: number;
  status: OpsDebugCallStatus;
}) {
  let query = args.admin
    .from("talent_calls")
    .select(
      `
        id,
        user_id,
        conversation_id,
        kind,
        status,
        state,
        started_at,
        last_active_at,
        completed_at,
        created_at,
        updated_at,
        talent:talent_users!talent_calls_user_id_fkey (
          user_id,
          name,
          email,
          headline,
          profile_picture
        )
      `
    )
    .order("last_active_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, args.limit - 1);

  if (args.dateRange.startIso) {
    query = query.gte("started_at", args.dateRange.startIso);
  }
  if (args.dateRange.endExclusiveIso) {
    query = query.lt("started_at", args.dateRange.endExclusiveIso);
  }
  if (args.kind) {
    query = query.eq("kind", args.kind);
  }
  if (args.status !== "all") {
    query = query.eq("status", args.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load talent calls");
  }

  return (data ?? []).map(callFromRow);
}

async function fetchCallMessages(args: {
  admin: UntypedAdminClient;
  calls: InternalDebugCallItem[];
}) {
  const conversationIds = Array.from(
    new Set(args.calls.map((call) => call.conversationId).filter(Boolean))
  ) as string[];
  if (conversationIds.length === 0) return [];

  const bounds = getMessageDateBounds(args.calls);
  const messages: RawCallMessage[] = [];
  const pageSize = 1000;

  for (const conversationPage of chunk(conversationIds, 120)) {
    for (let offset = 0; ; offset += pageSize) {
      let query = args.admin
        .from("talent_messages")
        .select(
          "id, conversation_id, user_id, role, content, message_type, created_at"
        )
        .in("conversation_id", conversationPage)
        .in("message_type", CALL_MESSAGE_TYPES)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (bounds.startIso) {
        query = query.gte("created_at", bounds.startIso);
      }
      if (bounds.endIso) {
        query = query.lte("created_at", bounds.endIso);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message ?? "Failed to load call transcripts");
      }

      messages.push(...((data ?? []) as RawCallMessage[]));
      if (!data || data.length < pageSize) break;
    }
  }

  return messages;
}

function includesSearchQuery(item: OpsDebugCallItem, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    item.id,
    item.conversationId,
    item.kind,
    item.status,
    item.talent.email,
    item.talent.headline,
    item.talent.name,
    JSON.stringify(item.state),
    ...item.transcriptEntries.map((entry) => entry.text),
    ...item.wrapupMessages.map((entry) => entry.text),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function buildStats(args: {
  calls: OpsDebugCallItem[];
  sourceLimitReached: boolean;
}): OpsDebugCallStats {
  return {
    abandonedCount: args.calls.filter((item) => item.status === "abandoned")
      .length,
    activeCount: args.calls.filter((item) => item.status === "active").length,
    completedCount: args.calls.filter((item) => item.status === "completed")
      .length,
    pendingCount: args.calls.filter((item) => item.status === "pending").length,
    sourceLimitReached: args.sourceLimitReached,
    totalCount: args.calls.length,
    withTranscriptCount: args.calls.filter((item) => item.transcriptCount > 0)
      .length,
  };
}

export function parseOpsDebugCallLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_DEBUG_CALL_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_DEBUG_CALL_LIMIT;
  return Math.max(1, Math.min(MAX_DEBUG_CALL_LIMIT, Math.floor(n)));
}

export function parseOpsDebugCallOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseOpsDebugCallStatus(
  value: string | null
): OpsDebugCallStatus {
  if (
    value === "pending" ||
    value === "active" ||
    value === "completed" ||
    value === "abandoned"
  ) {
    return value;
  }
  return "all";
}

export async function fetchOpsDebugCalls(args: {
  kind?: string | null;
  limit?: number;
  offset?: number;
  query?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
  status?: OpsDebugCallStatus;
}): Promise<OpsDebugCallsResponse> {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const limit = Math.max(
    1,
    Math.min(MAX_DEBUG_CALL_LIMIT, args.limit ?? DEFAULT_DEBUG_CALL_LIMIT)
  );
  const offset = Math.max(0, args.offset ?? 0);
  const query = normalizeSearchQuery(args.query);
  const kind = normalizeKind(args.kind);
  const status = args.status ?? "all";
  const dateRange = normalizeDateRange({
    startedFrom: args.startedFrom,
    startedTo: args.startedTo,
  });
  const sourceLimit = query
    ? MAX_DEBUG_CALL_SOURCE_LIMIT
    : Math.min(MAX_DEBUG_CALL_SOURCE_LIMIT, Math.max(offset + limit + 1, 300));

  const candidates = await fetchCallCandidates({
    admin,
    dateRange,
    kind,
    limit: sourceLimit,
    status,
  });
  const messages = await fetchCallMessages({ admin, calls: candidates });
  const allCalls = attachMessagesToCalls({ calls: candidates, messages })
    .filter((item) => includesSearchQuery(item, query))
    .sort(compareCalls);

  const page = allCalls.slice(offset, offset + limit);
  const nextOffset =
    offset + page.length < allCalls.length ? offset + page.length : null;
  const sourceLimitReached = candidates.length >= sourceLimit;

  return {
    calls: page.map(({ sortAt: _sortAt, ...item }) => item),
    filters: {
      kind,
      query,
      startedFrom: dateRange.from,
      startedTo: dateRange.to,
      status,
    },
    hasMore: nextOffset !== null,
    limit,
    nextOffset,
    offset,
    stats: buildStats({ calls: allCalls, sourceLimitReached }),
  };
}
