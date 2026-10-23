import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-only-not-used";

test("a renamed criterion keeps its id when the model returns it", async () => {
  const { briefFromRaw } = await import("./questions");
  const previous = {
    summary: "",
    hardConditions: [],
    keywords: [],
    criteria: [{ id: "cr_keep", name: "데이터 품질 모니터링 구축 경험", criteria: "모니터링", requirement: "preferred" as const, kind: "similarity" as const }],
  };
  const raw = (id: string | null, name: string) => ({
    summary: "",
    hardConditions: [],
    keywords: [],
    criteria: [{ id, name, criteria: "모니터링", requirement: "preferred" as const, kind: "similarity" as const, minYears: null, maxYears: null, signals: {} }],
  });
  const renamed = briefFromRaw(raw("cr_keep", "데이터 품질 관리 경험"), previous, "요청");
  assert.equal(renamed.criteria[0]!.id, "cr_keep");
  assert.equal(renamed.criteria[0]!.changeReason, "요청");
  const unknown = briefFromRaw(raw(null, "완전히 새 기준"), previous, "요청");
  assert.notEqual(unknown.criteria[0]!.id, "cr_keep");
});

test("removing a criterion by chip drops only the summary sentences that name it", async () => {
  const { applyChipEffect, withoutMentions } = await import("./questions");
  const summary = "Spark·Airflow 경험을 갖춘 데이터 엔지니어를 찾고 있어요. Kafka 경험은 가점으로 살펴봐요. 판교 오피스에 주 3일 출근해요.";
  const brief = {
    summary,
    keywords: [],
    hardConditions: [],
    criteria: [{ id: "k", name: "Kafka 경험", criteria: "Kafka를 쓴 경험", requirement: "preferred", importance: 2 }],
  } as never;
  const { brief: next } = applyChipEffect(brief, { type: "remove_criterion", criterion: "Kafka 경험" } as never, "테스트");
  assert.equal(next.summary, "Spark·Airflow 경험을 갖춘 데이터 엔지니어를 찾고 있어요. 판교 오피스에 주 3일 출근해요.");
  assert.equal(next.criteria.length, 0);
  assert.equal(withoutMentions("Kafka 경험이 있는 분을 찾아요.", "Kafka 경험"), "Kafka 경험이 있는 분을 찾아요.", "never empties the summary");
  assert.equal(withoutMentions("메시징 경험은 가점이에요.", "Kafka 경험"), "메시징 경험은 가점이에요.", "word for word only");
});
