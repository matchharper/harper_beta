import type { TalentAdminClient } from "./admin";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";

export const TALENT_CALL_NOTE_KIND = "call_note";
export const TALENT_CALL_NOTE_ORIGIN_TYPE = "career_realtime_call";
export const TALENT_CALL_NOTE_SCHEMA_VERSION = 2;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallNoteTranscriptInputEntry = {
  role: "assistant" | "user";
  text: string;
  timestamp?: string | null;
};

export type TalentCallNoteEntry = {
  role: "harper" | "user";
  text: string;
  timestamp: string | null;
};

export type TalentCallNoteV1 = {
  schema_version: 1;
  call_id: string;
  conversation_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  entries: TalentCallNoteEntry[];
};

export type TalentCallNoteV2 = Omit<TalentCallNoteV1, "schema_version"> & {
  schema_version: 2;
  title: string;
  key_points: string[];
};

export type TalentCallNote = TalentCallNoteV1 | TalentCallNoteV2;

export type TalentCallNoteDocument = {
  id: string;
  kind: typeof TALENT_CALL_NOTE_KIND;
  fileName: string;
  storagePath: null;
  contentType: null;
  sizeBytes: number;
  isPublic: false;
  isPrimary: false;
  createdAt: string;
  updatedAt: string;
  originType: typeof TALENT_CALL_NOTE_ORIGIN_TYPE;
  originId: string;
  downloadUrl: null;
};

export type TalentCallNoteStoredDocument = {
  created_at: string;
  extracted_text: string | null;
  file_name: string;
  id: string;
};

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCallNoteTitle(value: unknown) {
  return stripPostgresUnsafeChars(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeCallNoteKeyPoints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) =>
      stripPostgresUnsafeChars(String(point ?? ""))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600)
    )
    .filter(Boolean)
    .slice(0, 3);
}

export function isCallNoteId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function normalizeCallNoteTranscript(
  value: unknown
): TalentCallNoteEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (record.role !== "assistant" && record.role !== "user") return null;
      const text = stripPostgresUnsafeChars(String(record.text ?? "")).trim();
      if (!text) return null;
      return {
        role:
          record.role === "assistant" ? ("harper" as const) : ("user" as const),
        text,
        timestamp: normalizeTimestamp(record.timestamp),
      };
    })
    .filter((entry): entry is TalentCallNoteEntry => entry !== null);
}

export function buildTalentCallNote(args: {
  callId: string;
  conversationId: string;
  durationSeconds: number;
  endedAt?: string | null;
  keyPoints: string[];
  startedAt?: string | null;
  title: string;
  transcript: unknown;
}): TalentCallNoteV2 | null {
  if (!isCallNoteId(args.callId)) return null;
  const entries = normalizeCallNoteTranscript(args.transcript);
  if (entries.length === 0) return null;
  const title = normalizeCallNoteTitle(args.title);
  const keyPoints = normalizeCallNoteKeyPoints(args.keyPoints);
  if (!title || keyPoints.length === 0) return null;

  const endedAt = normalizeTimestamp(args.endedAt) ?? new Date().toISOString();
  const durationSeconds = Math.max(0, Math.floor(args.durationSeconds || 0));
  const startedAt =
    normalizeTimestamp(args.startedAt) ??
    new Date(
      new Date(endedAt).getTime() - durationSeconds * 1000
    ).toISOString();

  return {
    schema_version: TALENT_CALL_NOTE_SCHEMA_VERSION,
    call_id: args.callId,
    conversation_id: args.conversationId,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    title,
    key_points: keyPoints,
    entries,
  };
}

export function parseTalentCallNote(value: unknown): TalentCallNote | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (
    (record.schema_version !== 1 &&
      record.schema_version !== TALENT_CALL_NOTE_SCHEMA_VERSION) ||
    !isCallNoteId(record.call_id) ||
    typeof record.conversation_id !== "string" ||
    !normalizeTimestamp(record.started_at) ||
    !normalizeTimestamp(record.ended_at) ||
    !Array.isArray(record.entries)
  ) {
    return null;
  }

  const entries = record.entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      if (item.role !== "harper" && item.role !== "user") return null;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return null;
      return {
        role: item.role,
        text,
        timestamp: normalizeTimestamp(item.timestamp),
      } satisfies TalentCallNoteEntry;
    })
    .filter((entry): entry is TalentCallNoteEntry => entry !== null);
  if (entries.length === 0) return null;

  const base = {
    call_id: record.call_id,
    conversation_id: record.conversation_id,
    started_at: normalizeTimestamp(record.started_at)!,
    ended_at: normalizeTimestamp(record.ended_at)!,
    duration_seconds: Math.max(
      0,
      Math.floor(
        typeof record.duration_seconds === "number"
          ? record.duration_seconds
          : 0
      )
    ),
    entries,
  };

  if (record.schema_version === 1) {
    return { schema_version: 1, ...base };
  }

  const title = normalizeCallNoteTitle(record.title);
  const keyPoints = normalizeCallNoteKeyPoints(record.key_points);
  if (!title || keyPoints.length === 0) return null;
  return {
    schema_version: TALENT_CALL_NOTE_SCHEMA_VERSION,
    ...base,
    title,
    key_points: keyPoints,
  };
}

function toCallNoteDocument(row: {
  created_at: string;
  file_name: string;
  id: string;
  size_bytes: number | null;
  updated_at: string;
}): TalentCallNoteDocument {
  return {
    id: row.id,
    kind: TALENT_CALL_NOTE_KIND,
    fileName: row.file_name,
    storagePath: null,
    contentType: null,
    sizeBytes: row.size_bytes ?? 0,
    isPublic: false,
    isPrimary: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originType: TALENT_CALL_NOTE_ORIGIN_TYPE,
    originId: row.id,
    downloadUrl: null,
  };
}

export async function fetchTalentCallNoteDocument(args: {
  admin: TalentAdminClient;
  documentId: string;
  userId: string;
}): Promise<TalentCallNoteStoredDocument | null> {
  const { data, error } = await args.admin
    .from("talent_documents")
    .select("id, file_name, created_at, extracted_text")
    .eq("id", args.documentId)
    .eq("talent_id", args.userId)
    .eq("kind", TALENT_CALL_NOTE_KIND)
    .eq("origin_type", TALENT_CALL_NOTE_ORIGIN_TYPE)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as TalentCallNoteStoredDocument | null;
}

export async function saveTalentCallNote(args: {
  admin: TalentAdminClient;
  callId?: string | null;
  conversationId: string;
  durationSeconds: number;
  endedAt?: string | null;
  keyPoints: string[];
  startedAt?: string | null;
  title: string;
  transcript: unknown;
  userId: string;
}): Promise<TalentCallNoteDocument | null> {
  const callNote = buildTalentCallNote({
    callId: args.callId ?? "",
    conversationId: args.conversationId,
    durationSeconds: args.durationSeconds,
    endedAt: args.endedAt,
    keyPoints: args.keyPoints,
    startedAt: args.startedAt,
    title: args.title,
    transcript: args.transcript,
  });
  if (!callNote) return null;

  const extractedText = JSON.stringify(callNote);
  const row = {
    id: callNote.call_id,
    talent_id: args.userId,
    kind: TALENT_CALL_NOTE_KIND,
    file_name: callNote.title,
    storage_path: null,
    content_type: null,
    size_bytes: Buffer.byteLength(extractedText, "utf8"),
    extracted_text: extractedText,
    origin_type: TALENT_CALL_NOTE_ORIGIN_TYPE,
    origin_id: callNote.call_id,
    is_public: false,
    is_primary: false,
    is_deleted: false,
  };
  const { data, error } = await args.admin
    .from("talent_documents")
    .insert(row)
    .select("id, file_name, created_at, updated_at, size_bytes")
    .single();

  if (!error && data) return toCallNoteDocument(data);
  if (error?.code !== "23505") {
    throw new Error(error?.message ?? "Failed to save call note");
  }

  const { data: existing, error: existingError } = await args.admin
    .from("talent_documents")
    .select("id, file_name, created_at, updated_at, size_bytes")
    .eq("id", callNote.call_id)
    .eq("talent_id", args.userId)
    .eq("kind", TALENT_CALL_NOTE_KIND)
    .eq("origin_type", TALENT_CALL_NOTE_ORIGIN_TYPE)
    .eq("origin_id", callNote.call_id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing)
    throw new Error("Call note id conflicts with another document");
  return toCallNoteDocument(existing);
}
