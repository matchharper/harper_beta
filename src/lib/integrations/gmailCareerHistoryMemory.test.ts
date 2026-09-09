import assert from "node:assert/strict";
import test from "node:test";
import { GMAIL_CAREER_HISTORY_ORIGIN_TYPE } from "./gmailCareerHistoryCore";
import {
  buildGmailCareerMemoryChanges,
  fetchLatestGmailCareerMemory,
  gmailCareerMemoryOriginId,
} from "./gmailCareerHistoryMemory";
import type { TalentContextRow } from "../talentOnboarding/talentContexts";

function memoryRow(args: {
  company: string;
  content: string;
  id: number;
  importance?: 1 | 2 | 3;
}): TalentContextRow {
  return {
    collection: "memory",
    content: args.content,
    created_at: "2026-09-01T00:00:00.000Z",
    deleted_at: null,
    id: args.id,
    importance: args.importance ?? 2,
    key: null,
    label: null,
    ref: args.id,
    revision: 1,
    source_refs: [
      {
        originId: gmailCareerMemoryOriginId(args.company),
        type: GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
      },
    ],
    talent_id: "00000000-0000-0000-0000-000000000001",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

test("reconciles Gmail-owned memories without duplicating unchanged companies", () => {
  const existingAcme = memoryRow({
    company: "Acme",
    content: "Acme에 지원했다.",
    id: 11,
  });
  const removedCompany = memoryRow({
    company: "Old Co",
    content: "Old Co에 지원했다.",
    id: 12,
  });

  const changes = buildGmailCareerMemoryChanges({
    entries: [
      {
        company: "Acme",
        content: "Acme에 지원한 뒤 인터뷰까지 진행했다.",
        latestActivityAt: "2026-08-01",
      },
      {
        company: "New Labs",
        content: "New Labs에 지원했다.",
        latestActivityAt: "2026-07-01",
      },
    ],
    existingRows: [existingAcme, removedCompany],
  });

  assert.deepEqual(changes, [
    {
      content: "Acme에 지원한 뒤 인터뷰까지 진행했다.",
      expectedRevision: 1,
      id: 11,
      importance: 2,
      op: "update",
    },
    {
      collection: "memory",
      content: "New Labs에 지원했다.",
      importance: 2,
      op: "add",
      sourceRefs: [
        {
          originId: gmailCareerMemoryOriginId("New Labs"),
          type: GMAIL_CAREER_HISTORY_ORIGIN_TYPE,
        },
      ],
    },
    { expectedRevision: 1, id: 12, op: "delete" },
  ]);
});

test("keeps an unchanged company row and deletes only stale Gmail rows", () => {
  const acme = memoryRow({
    company: "Acme",
    content: "Acme에 지원했다.",
    id: 21,
  });

  assert.deepEqual(
    buildGmailCareerMemoryChanges({
      entries: [
        {
          company: "Acme",
          content: "Acme에 지원했다.",
          latestActivityAt: "2026-08-01",
        },
      ],
      existingRows: [acme],
    }),
    []
  );
  assert.deepEqual(
    buildGmailCareerMemoryChanges({ entries: [], existingRows: [acme] }),
    [{ expectedRevision: 1, id: 21, op: "delete" }]
  );
});

test("serializes the Gmail source filter as JSONB instead of a Postgres array", async () => {
  const calls: Array<{ args: unknown[]; method: string }> = [];
  const query: any = {};
  for (const method of ["select", "eq", "is", "filter", "order", "limit"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ args, method });
      return query;
    };
  }
  query.maybeSingle = async () => ({ data: null, error: null });

  await fetchLatestGmailCareerMemory({
    admin: { from: () => query } as never,
    talentId: "00000000-0000-0000-0000-000000000001",
  });

  const sourceFilter = calls.find((call) => call.method === "filter");
  assert.deepEqual(sourceFilter?.args, [
    "source_refs",
    "cs",
    '[{"type":"gmail_career_history"}]',
  ]);
  assert.equal(
    calls.some((call) => call.method === "contains"),
    false
  );
});
