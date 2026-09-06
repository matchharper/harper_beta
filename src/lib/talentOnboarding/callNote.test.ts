import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTalentCallNote,
  fetchTalentCallNoteDocument,
  parseTalentCallNote,
  saveTalentCallNote,
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
    schema_version: 1,
    call_id: CALL_ID,
    conversation_id: "conversation-1",
    started_at: "2026-09-06T01:00:00.000Z",
    ended_at: "2026-09-06T01:01:06.000Z",
    duration_seconds: 65,
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
  });
});

test("does not create notes for old requests, empty transcripts, or invalid ids", () => {
  const base = {
    conversationId: "conversation-1",
    durationSeconds: 0,
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
    transcript: [{ role: "assistant", text: "hello" }],
  });
  assert.ok(note);
  assert.deepEqual(parseTalentCallNote(JSON.stringify(note)), note);
  assert.equal(parseTalentCallNote("not-json"), null);
  assert.equal(parseTalentCallNote({ ...note, schema_version: 2 }), null);
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
                created_at: "2026-09-06T01:01:06.000Z",
                size_bytes: 123,
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
    transcript: [{ role: "assistant", text: "hello" }],
    userId: "authenticated-user",
  });

  assert.equal(inserted.value?.talent_id, "authenticated-user");
  assert.equal(inserted.value?.id, CALL_ID);
  assert.equal(inserted.value?.storage_path, null);
  assert.equal(document?.id, CALL_ID);
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
              created_at: "2026-09-06T01:01:06.000Z",
              size_bytes: 123,
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
