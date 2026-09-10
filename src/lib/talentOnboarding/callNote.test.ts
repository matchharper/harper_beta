import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTalentCallNote,
  buildTalentCallNoteContinuationContext,
  fetchTalentCallNoteDocument,
  mergeTalentCallNoteContinuation,
  parseTalentCallNote,
  saveTalentCallNote,
  updateTalentCallNote,
} from "./callNote";
import type { TalentAdminClient } from "./admin";

const CALL_ID = "9de379c1-b735-42a6-8e92-3939b12e87f0";

test("builds a versioned call note and maps assistant to harper", () => {
  const note = buildTalentCallNote({
    callId: CALL_ID,
    conversationId: "conversation-1",
    durationSeconds: 65.8,
    startedAt: "2026-09-06T01:00:00.000Z",
    endedAt: "2026-09-06T01:01:06.000Z",
    title: "보상 기준 정리",
    keyPoints: ["기본급을 우선해서 본다.", "제안을 보며 기준을 조정한다."],
    transcript: [
      {
        role: "assistant",
        text: " 안녕하세요. ",
        timestamp: "2026-09-06T01:00:01.000Z",
      },
      {
        role: "user",
        text: "반가워요.",
        timestamp: "2026-09-06T01:00:03.000Z",
      },
    ],
  });

  assert.deepEqual(note, {
    schema_version: 3,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:06.000Z",
    duration_seconds: 65,
    title: "보상 기준 정리",
    key_points: ["기본급을 우선해서 본다.", "제안을 보며 기준을 조정한다."],
    entries: [
      {
        role: "harper",
        text: "안녕하세요.",
        timestamp: "2026-09-06T01:00:01.000Z",
      },
      {
        role: "user",
        text: "반가워요.",
        timestamp: "2026-09-06T01:00:03.000Z",
      },
    ],
    sessions: [
      {
        call_id: CALL_ID,
        conversation_id: "conversation-1",
        started_at: "2026-09-06T01:00:00.000Z",
        ended_at: "2026-09-06T01:01:06.000Z",
        duration_seconds: 65,
        entry_start: 0,
        entry_count: 2,
      },
    ],
  });
});

test("does not create notes for old requests, empty transcripts, or invalid ids", () => {
  const base = {
    conversationId: "conversation-1",
    durationSeconds: 0,
    keyPoints: ["핵심 내용"],
    title: "짧은 통화",
    transcript: [{ role: "assistant", text: "hello" }],
  };
  assert.equal(buildTalentCallNote({ ...base, callId: "" }), null);
  assert.equal(
    buildTalentCallNote({ ...base, callId: CALL_ID, transcript: [] }),
    null
  );
});

test("parses valid persisted notes and rejects malformed payloads", () => {
  const note = buildTalentCallNote({
    callId: CALL_ID,
    conversationId: "conversation-1",
    durationSeconds: 10,
    keyPoints: ["인사를 나눴다."],
    title: "인사",
    transcript: [{ role: "assistant", text: "hello" }],
  });
  assert.ok(note);
  assert.deepEqual(parseTalentCallNote(JSON.stringify(note)), note);
  assert.equal(parseTalentCallNote("not-json"), null);
  assert.equal(parseTalentCallNote({ ...note, schema_version: 4 }), null);
});

test("continues to parse legacy version 1 notes", () => {
  const legacy = {
    schema_version: 1 as const,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    duration_seconds: 60,
    entries: [
      {
        role: "user" as const,
        text: "기존 콜노트입니다.",
        timestamp: null,
      },
    ],
  };

  assert.deepEqual(parseTalentCallNote(JSON.stringify(legacy)), legacy);
});

test("continues to parse existing version 2 notes", () => {
  const existing = {
    schema_version: 2 as const,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    duration_seconds: 60,
    title: "기존 콜노트",
    key_points: ["기존 요점"],
    entries: [
      {
        role: "user" as const,
        text: "기존 발화입니다.",
        timestamp: null,
      },
    ],
  };

  assert.deepEqual(parseTalentCallNote(JSON.stringify(existing)), existing);
});

test("appends only the new transcript and records a continuation session", () => {
  const original = {
    schema_version: 2 as const,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    duration_seconds: 60,
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    key_points: ["기존 요점"],
    title: "기존 제목",
    entries: [{ role: "user" as const, text: "기존 발화", timestamp: null }],
  };

  const continued = mergeTalentCallNoteContinuation({
    callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
    conversationId: "conversation-1",
    durationSeconds: 45,
    startedAt: "2026-09-10T01:00:00.000Z",
    endedAt: "2026-09-10T01:00:45.000Z",
    existing: original,
    keyPoints: ["통합된 새 요점"],
    title: "갱신된 제목",
    transcript: [
      { role: "assistant", text: "이어서 이야기해볼게요." },
      { role: "user", text: "새 발화" },
    ],
  });

  assert.ok(continued?.changed);
  assert.equal(continued.note.entries.length, 3);
  assert.equal(continued.note.entries[0]?.text, "기존 발화");
  assert.equal(continued.note.entries[2]?.text, "새 발화");
  assert.equal(continued.note.sessions.length, 2);
  assert.deepEqual(continued.note.sessions[1], {
    call_id: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
    conversation_id: "conversation-1",
    started_at: "2026-09-10T01:00:00.000Z",
    ended_at: "2026-09-10T01:00:45.000Z",
    duration_seconds: 45,
    entry_start: 1,
    entry_count: 2,
  });
  assert.equal(continued.note.duration_seconds, 105);
  assert.equal(continued.note.title, "갱신된 제목");

  const retry = mergeTalentCallNoteContinuation({
    callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
    conversationId: "conversation-1",
    durationSeconds: 45,
    existing: continued.note,
    keyPoints: ["중복 요청"],
    title: "중복 요청",
    transcript: [{ role: "user", text: "중복 발화" }],
  });
  assert.equal(retry?.changed, false);
  assert.equal(retry?.note.entries.length, 3);
});

test("can append a resumed-call transcript without inventing summary points", () => {
  const continued = mergeTalentCallNoteContinuation({
    callId: "2bfffc34-329d-4cb0-b3b1-18bca7704dad",
    conversationId: "conversation-1",
    durationSeconds: 15,
    existing: {
      schema_version: 1,
      call_id: CALL_ID,
      conversation_id: "conversation-1",
      started_at: "2026-09-06T01:00:00.000Z",
      ended_at: "2026-09-06T01:01:00.000Z",
      duration_seconds: 60,
      entries: [{ role: "user", text: "기존 발화", timestamp: null }],
    },
    keyPoints: [],
    title: "기존 콜노트",
    transcript: [{ role: "user", text: "새 발화" }],
  });

  assert.ok(continued?.changed);
  assert.deepEqual(continued.note.key_points, []);
  assert.equal(continued.note.entries.at(-1)?.text, "새 발화");
  assert.deepEqual(parseTalentCallNote(continued.note), continued.note);
});

test("builds bounded continuation context from key points and user speech only", () => {
  const note = buildTalentCallNote({
    callId: CALL_ID,
    conversationId: "conversation-1",
    durationSeconds: 60,
    keyPoints: ["요점 1", "요점 2", "요점 3"],
    title: "보상 기준",
    transcript: [
      { role: "assistant", text: "Harper의 긴 답변" },
      { role: "user", text: "사용자의 기준" },
    ],
  });
  assert.ok(note);

  const context = buildTalentCallNoteContinuationContext(note);
  assert.match(context, /보상 기준/);
  assert.match(context, /요점 1/);
  assert.match(context, /사용자의 기준/);
  assert.doesNotMatch(context, /Harper의 긴 답변/);
  assert.ok(context.length <= 6_000);
});

test("saves with the authenticated owner and never upserts", async () => {
  const inserted: { value: Record<string, unknown> | null } = { value: null };
  const admin = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.value = row;
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: CALL_ID,
                file_name: "보상 기준 정리",
                created_at: "2026-09-06T01:01:06.000Z",
                updated_at: "2026-09-06T01:01:06.000Z",
                size_bytes: 123,
                origin_type: "career_realtime_call",
                origin_id: CALL_ID,
              },
              error: null,
            }),
          }),
        };
      },
    }),
  } as unknown as TalentAdminClient;

  const document = await saveTalentCallNote({
    admin,
    callId: CALL_ID,
    conversationId: "conversation-1",
    durationSeconds: 10,
    keyPoints: ["기본급을 우선한다."],
    title: "보상 기준 정리",
    transcript: [{ role: "assistant", text: "hello" }],
    userId: "authenticated-user",
  });

  assert.equal(inserted.value?.talent_id, "authenticated-user");
  assert.equal(inserted.value?.id, CALL_ID);
  assert.equal(inserted.value?.storage_path, null);
  assert.equal(inserted.value?.file_name, "보상 기준 정리");
  assert.equal(document?.id, CALL_ID);
  assert.equal(document?.updatedAt, "2026-09-06T01:01:06.000Z");
  assert.equal(document?.originType, "career_realtime_call");
  assert.equal(document?.originId, CALL_ID);
});

test("accepts an owned duplicate but rejects a foreign id collision", async () => {
  const createConflictAdmin = (owned: boolean) => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      maybeSingle: async () => ({
        data: owned
          ? {
              id: CALL_ID,
              file_name: "보상 기준 정리",
              created_at: "2026-09-06T01:01:06.000Z",
              updated_at: "2026-09-06T01:01:06.000Z",
              size_bytes: 123,
              origin_type: "career_realtime_call",
              origin_id: CALL_ID,
            }
          : null,
        error: null,
      }),
    };
    const admin = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            }),
          }),
        }),
        select: () => query,
      }),
    } as unknown as TalentAdminClient;
    return { admin, filters };
  };
  const args = {
    callId: CALL_ID,
    conversationId: "conversation-1",
    durationSeconds: 10,
    keyPoints: ["핵심 내용"],
    title: "통화 주제",
    transcript: [{ role: "user" as const, text: "hello" }],
    userId: "authenticated-user",
  };

  const owned = createConflictAdmin(true);
  assert.equal(
    (await saveTalentCallNote({ ...args, admin: owned.admin }))?.id,
    CALL_ID
  );
  assert.deepEqual(owned.filters, [
    ["id", CALL_ID],
    ["talent_id", "authenticated-user"],
    ["kind", "call_note"],
    ["origin_type", "career_realtime_call"],
    ["origin_id", CALL_ID],
  ]);

  const foreign = createConflictAdmin(false);
  await assert.rejects(
    saveTalentCallNote({ ...args, admin: foreign.admin }),
    /conflicts with another document/
  );
});

test("scopes call note reads to the authenticated owner and active kind", async () => {
  const filters: Array<[string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const admin = {
    from: () => ({ select: () => query }),
  } as unknown as TalentAdminClient;

  assert.equal(
    await fetchTalentCallNoteDocument({
      admin,
      documentId: CALL_ID,
      userId: "authenticated-user",
    }),
    null
  );
  assert.deepEqual(filters, [
    ["id", CALL_ID],
    ["talent_id", "authenticated-user"],
    ["kind", "call_note"],
    ["origin_type", "career_realtime_call"],
    ["is_deleted", false],
  ]);
});

test("updates only the owned active call note and advances updated_at", async () => {
  const continuationCallId = "2bfffc34-329d-4cb0-b3b1-18bca7704dad";
  const readFilters: Array<[string, unknown]> = [];
  const updateFilters: Array<[string, unknown]> = [];
  const updatePayload: { value: Record<string, unknown> | null } = {
    value: null,
  };
  const existingNote = {
    schema_version: 2,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:00.000Z",
    duration_seconds: 60,
    title: "기존 제목",
    key_points: ["기존 요점"],
    entries: [{ role: "user", text: "기존 발화", timestamp: null }],
  };
  const readQuery = {
    eq(column: string, value: unknown) {
      readFilters.push([column, value]);
      return readQuery;
    },
    maybeSingle: async () => ({
      data: {
        id: CALL_ID,
        file_name: "기존 제목",
        created_at: "2026-09-06T01:01:00.000Z",
        updated_at: "2026-09-06T01:01:00.000Z",
        size_bytes: 100,
        extracted_text: JSON.stringify(existingNote),
      },
      error: null,
    }),
  };
  const updateQuery = {
    eq(column: string, value: unknown) {
      updateFilters.push([column, value]);
      return updateQuery;
    },
    select() {
      return updateQuery;
    },
    maybeSingle: async () => ({
      data: {
        id: CALL_ID,
        file_name: "갱신된 제목",
        created_at: "2026-09-06T01:01:00.000Z",
        updated_at: "2026-09-10T01:00:45.000Z",
        size_bytes: 200,
      },
      error: null,
    }),
  };
  const admin = {
    from: () => ({
      select: () => readQuery,
      update: (payload: Record<string, unknown>) => {
        updatePayload.value = payload;
        return updateQuery;
      },
    }),
  } as unknown as TalentAdminClient;

  const document = await updateTalentCallNote({
    admin,
    callId: continuationCallId,
    conversationId: "conversation-1",
    documentId: CALL_ID,
    durationSeconds: 45,
    startedAt: "2026-09-10T01:00:00.000Z",
    endedAt: "2026-09-10T01:00:45.000Z",
    keyPoints: ["통합 요점"],
    title: "갱신된 제목",
    transcript: [{ role: "user", text: "새 발화" }],
    userId: "authenticated-user",
  });

  assert.equal(document?.updatedAt, "2026-09-10T01:00:45.000Z");
  assert.equal(updatePayload.value?.file_name, "갱신된 제목");
  assert.equal(typeof updatePayload.value?.updated_at, "string");
  const savedNote = parseTalentCallNote(updatePayload.value?.extracted_text);
  assert.equal(savedNote?.schema_version, 3);
  assert.equal(savedNote?.entries.length, 2);
  assert.deepEqual(readFilters, [
    ["id", CALL_ID],
    ["talent_id", "authenticated-user"],
    ["kind", "call_note"],
    ["origin_type", "career_realtime_call"],
    ["is_deleted", false],
  ]);
  assert.deepEqual(updateFilters, [
    ["id", CALL_ID],
    ["talent_id", "authenticated-user"],
    ["kind", "call_note"],
    ["origin_type", "career_realtime_call"],
    ["is_deleted", false],
    ["updated_at", "2026-09-06T01:01:00.000Z"],
  ]);
});
