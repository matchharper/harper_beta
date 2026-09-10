import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTalentMemoryRetrievalQuery,
  mutateTalentContexts,
  normalizeTalentContextRow,
  projectBriefsToLegacyInsights,
  readTalentContextsForAgent,
  renderTalentContextPrompt,
  selectRecentAndRelevantMemoriesForPrompt,
  talentContextEmbeddingNeedsRefresh,
  TALENT_CONTEXT_EMBEDDING_MODEL,
  type TalentContextRow,
} from "./talentContexts";

const row = (
  id: number,
  collection: "brief" | "memory",
  content: string,
  options: { key?: string; label?: string; revision?: number } = {}
): TalentContextRow => ({
  collection,
  content,
  created_at: "2026-09-07T00:00:00.000Z",
  deleted_at: null,
  id,
  importance: collection === "memory" ? 2 : null,
  key: options.key ?? null,
  label: collection === "brief" ? (options.label ?? "기준") : null,
  ref: id === 10 ? 1 : id === 20 ? 2 : id,
  revision: options.revision ?? 1,
  source_refs: [],
  talent_id: "00000000-0000-0000-0000-000000000001",
  updated_at: "2026-09-07T00:00:00.000Z",
});

test("normalizes valid rows and rejects a Brief without a label", () => {
  assert.equal(
    normalizeTalentContextRow(row(1, "brief", "서울 또는 원격"))?.id,
    1
  );
  assert.equal(
    normalizeTalentContextRow({ ...row(2, "brief", "서울"), label: null }),
    null
  );
});

test("keeps a per-change external source identity for imported memories", async () => {
  const captured: { rpcArgs?: Record<string, unknown> } = {};
  const admin = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      captured.rpcArgs = args;
      return { data: { applied: [] }, error: null };
    },
  } as unknown as Parameters<typeof mutateTalentContexts>[0]["admin"];

  await mutateTalentContexts({
    admin,
    changes: [
      {
        collection: "memory",
        content: "Example Labs에 지원했다.",
        importance: 2,
        op: "add",
        sourceRefs: [
          { originId: "company-hash", type: "gmail_career_history" },
        ],
      },
    ],
    requestId: "gmail-import-test",
    userId: "00000000-0000-0000-0000-000000000001",
  });

  assert.deepEqual(
    (captured.rpcArgs?.p_changes as Array<Record<string, unknown>>)[0]
      ?.source_refs,
    [{ originId: "company-hash", type: "gmail_career_history" }]
  );
});

test("fills missing add metadata and ignores empty optional update metadata", async () => {
  const captured: { rpcArgs?: Record<string, unknown> } = {};
  const admin = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      captured.rpcArgs = args;
      return { data: { applied: [] }, error: null };
    },
  } as unknown as Parameters<typeof mutateTalentContexts>[0]["admin"];

  await mutateTalentContexts({
    admin,
    changes: [
      {
        collection: "memory",
        content: "Prefers concise follow-ups.",
        op: "add",
      },
      {
        collection: "brief",
        content: "Open to remote platform roles.",
        label: null,
        op: "add",
      },
      {
        content: "Now prefers smaller teams.",
        expectedRevision: 2,
        id: 31,
        label: null as unknown as string,
        op: "update",
      },
    ],
    requestId: "missing-context-metadata-test",
    userId: "00000000-0000-0000-0000-000000000001",
  });

  const changes = captured.rpcArgs?.p_changes as Array<Record<string, unknown>>;
  assert.equal(changes[0]?.importance, 1);
  assert.equal(changes[1]?.label, "Career criteria");
  assert.equal(changes[2]?.content, "Now prefers smaller teams.");
  assert.equal("label" in changes[2]!, false);
});

test("normalizes Memory importance without exposing it in prompt text", () => {
  const memory = row(9, "memory", "면접 일정은 평일 저녁을 선호한다.");
  const normalized = normalizeTalentContextRow({ ...memory, importance: 3 });
  assert.equal(normalized?.importance, 3);
  assert.doesNotMatch(
    renderTalentContextPrompt({
      allBriefs: [],
      briefs: [],
      memories: normalized ? [normalized] : [],
      memorySelection: "semantic",
      memoryTruncated: false,
    }),
    /importance|중요도|\b3\b/
  );
});

test("keeps the stored short ref when a row revision changes", () => {
  const before = row(10, "brief", "서울");
  const after = row(10, "brief", "서울 또는 원격", { revision: 2 });
  assert.equal(before.ref, after.ref);
  assert.equal(after.revision, 2);
});

test("renders all Brief rows and selected Memory rows without database ids", () => {
  const brief = {
    ...row(912345, "brief", "서울 또는 원격", {
      key: "location",
      label: "선호 근무 지역",
    }),
    ref: 1,
  };
  const memory = {
    ...row(998877, "memory", "초기 팀에서 빠르게 성장한 경험을 선호한다."),
    ref: 2,
  };
  const output = renderTalentContextPrompt({
    allBriefs: [brief],
    briefs: [brief],
    memories: [memory],
    memorySelection: "semantic",
    memoryTruncated: true,
  });

  assert.match(output, /\[1\] 선호 근무 지역: 서울 또는 원격/);
  assert.match(output, /\[2\] 초기 팀에서 빠르게 성장한 경험/);
  assert.doesNotMatch(output, /912345|998877|location/);
  assert.match(output, /read_talent_context/);

  const onboardingExtractionOutput = renderTalentContextPrompt(
    {
      allBriefs: [brief],
      briefs: [brief],
      memories: [memory],
      memorySelection: "semantic",
      memoryTruncated: false,
    },
    { includeCompatibilityKeys: true }
  );
  assert.match(onboardingExtractionOutput, /onboarding key: location/);
  assert.equal(onboardingExtractionOutput.match(/서울 또는 원격/g)?.length, 1);
});

test("legacy projection includes only keyed Brief rows", () => {
  const result = projectBriefsToLegacyInsights([
    row(1, "brief", "서울 또는 원격", {
      key: "location",
      label: "선호 근무 지역",
    }),
    row(2, "brief", "제품 의사결정부터 참여", {
      label: "제품 의사결정 참여",
    }),
    row(3, "memory", "과거에 해외 이직을 준비했다."),
  ]);
  assert.deepEqual(result, { location: "서울 또는 원격" });
});

test("memory retrieval query keeps the newest context within its bound", () => {
  assert.equal(
    buildTalentMemoryRetrievalQuery(["older context", "latest answer"], 13),
    "latest answer"
  );
  assert.equal(buildTalentMemoryRetrievalQuery(["old", "A🙂B"], 3), "A🙂B");
});

test("refreshes an embedding when either content or the embedding model changed", () => {
  const content = "다음에도 기억할 내용";
  const currentHash =
    "282c5c4b2d42a49a39e42d153be82de86cebb17059c1decdc2237cef4f892085";

  assert.equal(
    talentContextEmbeddingNeedsRefresh({
      content,
      embeddingContentHash: currentHash,
      embeddingModel: TALENT_CONTEXT_EMBEDDING_MODEL,
    }),
    false
  );
  assert.equal(
    talentContextEmbeddingNeedsRefresh({
      content: `${content} 수정`,
      embeddingContentHash: currentHash,
      embeddingModel: TALENT_CONTEXT_EMBEDDING_MODEL,
    }),
    true
  );
  assert.equal(
    talentContextEmbeddingNeedsRefresh({
      content,
      embeddingContentHash: currentHash,
      embeddingModel: "older-model",
    }),
    true
  );
});

test("blends recent and semantically relevant memories into one bounded list", () => {
  const recent = Array.from({ length: 6 }, (_, index) =>
    row(100 + index, "memory", `recent-${index} ${"가".repeat(45)}`)
  );
  const relevant = [
    recent[1],
    row(200, "memory", `relevant-old ${"나".repeat(90)}`),
  ];
  const selected = selectRecentAndRelevantMemoriesForPrompt({
    recentMemories: recent,
    relevantMemories: relevant,
    tokenBudget: 300,
  });

  assert.ok(selected.rows.some((item) => item.content.startsWith("recent-0")));
  assert.ok(
    selected.rows.some((item) => item.content.startsWith("relevant-old"))
  );
  assert.equal(
    selected.rows.filter((item) => item.id === recent[1].id).length,
    1
  );
  assert.equal(
    selected.rows.reduce(
      (sum, item) =>
        sum +
        Array.from(item.content).reduce(
          (cost, character) =>
            cost + (character.codePointAt(0)! <= 0x7f ? 0.25 : 1),
          0
        ),
      0
    ) <= 300,
    true
  );
});

test("renders the blended selection under one Relevant memories heading", () => {
  const memory = row(8, "memory", "최근에 수정한 기억");
  const output = renderTalentContextPrompt({
    allBriefs: [],
    briefs: [],
    memories: [memory],
    memorySelection: "semantic",
    memoryTruncated: true,
  });

  assert.equal(output.match(/Relevant memories/g)?.length, 1);
  assert.doesNotMatch(output, /Recent memories/);
});

test("cursor reads report hasMore only when a next cursor is available", async () => {
  const storedRows = [
    row(3, "memory", "세 번째"),
    row(2, "memory", "두 번째"),
    row(1, "memory", "첫 번째"),
  ];
  const admin = {
    from: () => {
      let beforeId: number | null = null;
      const query = {
        eq: () => query,
        is: () => query,
        lt: (_field: string, value: number) => {
          beforeId = value;
          return query;
        },
        order: () => query,
        select: () => query,
        limit: async (value: number) => ({
          data: storedRows
            .filter((item) => beforeId === null || item.id < beforeId)
            .slice(0, value),
          error: null,
        }),
      };
      return query;
    },
  } as unknown as Parameters<typeof readTalentContextsForAgent>[0]["admin"];

  const firstPage = await readTalentContextsForAgent({
    admin,
    collection: "memory",
    limit: 2,
    userId: storedRows[0].talent_id,
  });
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextCursor, 2);
  assert.deepEqual(
    firstPage.items.map((item) => item.ref),
    [3, 2]
  );

  const finalPage = await readTalentContextsForAgent({
    admin,
    beforeId: firstPage.nextCursor,
    collection: "memory",
    limit: 2,
    userId: storedRows[0].talent_id,
  });
  assert.equal(finalPage.hasMore, false);
  assert.equal(finalPage.nextCursor, null);
  assert.deepEqual(
    finalPage.items.map((item) => item.ref),
    [1]
  );
});
