import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTalentMemoryRetrievalQuery,
  normalizeTalentContextRow,
  projectBriefsToLegacyInsights,
  renderTalentContextPrompt,
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
