import assert from "node:assert/strict";
import test from "node:test";

import type { RoleStartBrief } from "./brief";
import type { RoleStartChip, RoleStartQuestion, RoleStartQuestionCandidate } from "./session";

process.env.OPENAI_API_KEY ||= "test-only-not-used";

const usage = { label: "t", model: "m", inputTokens: 1, outputTokens: 1, usd: 0, ms: 0, at: "" };

const brief = (): RoleStartBrief => ({
  summary: "",
  hardConditions: [],
  keywords: [],
  criteria: [
    { id: "cr_kafka", name: "Kafka 운영 경험", criteria: "Kafka 클러스터 운영", level: "important", requirement: "preferred", kind: "similarity" },
    { id: "cr_sql", name: "SQL", criteria: "분석 쿼리", level: "nice", requirement: "preferred", kind: "similarity" },
  ],
}) as unknown as RoleStartBrief;

const raw = (kafkaImportance: string) => ({
  summary: "",
  hardConditions: [],
  keywords: [],
  criteria: [
    { id: "cr_kafka", name: "Kafka 운영 경험", criteria: "Kafka 클러스터 운영", importance: kafkaImportance, kind: "similarity" as const, minYears: null, maxYears: null, signals: {} },
    { id: "cr_sql", name: "SQL", criteria: "분석 쿼리와 모델링", importance: "nice", kind: "similarity" as const, minYears: null, maxYears: null, signals: {} },
  ],
});

const chip = (id: string, effect: RoleStartChip["effect"], label = id): RoleStartChip => ({ id, label, effect });
const note = (id: string, label: string) => chip(id, { type: "note" }, label);

function answered(id: string, chips: RoleStartChip[], answer: { chipId?: string | null; text?: string | null }): RoleStartQuestion {
  return {
    id,
    question: `질문 ${id}`,
    why: "",
    chips,
    status: "answered",
    overlap: null,
    askedAt: "",
    answer: { chipId: answer.chipId ?? null, text: answer.text ?? null, applied: null },
  };
}

const drafted = (id: string, question: string): RoleStartQuestionCandidate => ({
  id,
  question,
  why: "",
  chips: [chip(`${id}_a`, { type: "set_importance", criterion: "Kafka 운영 경험", level: "required" }), chip(`${id}_b`, { type: "none" })],
});

test("replayLaterChips: a chip answered after the refine read the Brief is replayed on its output", async () => {
  const { replayLaterChips } = await import("./chatAnswers");
  const { briefFromRaw, applyChipEffect } = await import("./questions");
  const { levelOf } = await import("./brief");
  // The refine read the Brief, then the team set Kafka to 필수 on the next question.
  const base = brief();
  const history = [
    answered("q1", [note("n1", "있어요")], { text: "백엔드 출신이면 좋아요" }),
    answered("q2", [chip("c_req", { type: "set_importance", criterion: "Kafka 운영 경험", level: "required" })], { chipId: "c_req" }),
  ];
  const live = applyChipEffect(base, history[1]!.chips[0]!.effect, "답").brief;
  assert.equal(levelOf(live.criteria[0]!), "required");
  // The refine saves its model output for answer 0, written from the older Brief (Kafka 중요).
  const saved = replayLaterChips({ rewritten: briefFromRaw(raw("important"), base, "답"), history, answerIndex: 0 });
  assert.equal(levelOf(saved.criteria.find((item) => item.id === "cr_kafka")!), "required", "the later chip survives the refine");
  assert.equal(saved.criteria.find((item) => item.id === "cr_sql")!.criteria, "분석 쿼리와 모델링", "the refine's own change is kept");
});

test("replayLaterChips: an earlier chip's level is not guarded, so a later text answer's output wins", async () => {
  const { replayLaterChips } = await import("./chatAnswers");
  const { briefFromRaw, applyChipEffect } = await import("./questions");
  const { levelOf, withLevel } = await import("./brief");
  const history = [
    answered("q1", [chip("c_req", { type: "set_requirement", criterion: "Kafka 운영 경험", requirement: "must" })], { chipId: "c_req" }),
    answered("q2", [note("n1", "있어요")], { text: "Kafka는 필수까지는 아니고 중요 정도로 봐 주세요" }),
  ];
  const before = applyChipEffect(brief(), history[0]!.chips[0]!.effect, "답").brief;
  // The model rewrote the Brief from answer 1, which asked for Kafka at 중요.
  const saved = replayLaterChips({ rewritten: briefFromRaw(raw("important"), before, "답"), history, answerIndex: 1 });
  assert.equal(levelOf(saved.criteria.find((item) => item.id === "cr_kafka")!), "important", "the text answer wins over the earlier chip");
  assert.equal(saved.criteria.find((item) => item.id === "cr_sql")!.criteria, "분석 쿼리와 모델링", "the refine's own change is kept");
  // A hand edit made before the refine is in the Brief the model reads. No code guards it now:
  // it stands only when the model's output keeps it, which this input assumes.
  const edited = { ...before, criteria: before.criteria.map((item) => (item.id === "cr_kafka" ? withLevel(item, "nice") : item)) };
  const afterEdit = replayLaterChips({ rewritten: briefFromRaw(raw("nice"), edited, "답"), history, answerIndex: 1 });
  assert.equal(levelOf(afterEdit.criteria.find((item) => item.id === "cr_kafka")!), "nice", "the model output is used as given");
});

test("skip and drop: a queued question the Harper answer settles is skipped and not counted toward the limit", async () => {
  const { planDraftQueue, questionsTowardLimit, withoutSettled, answeredForOverlap } = await import("./chatAnswers");
  const { coveredQuestions } = await import("./chipGuard");
  const harper = answered("h1", [note("n1", "대규모 트래픽 서비스 출신"), note("n2", "없어요")], { chipId: "n1", text: "대규모 트래픽 서비스 출신" });
  const draft = [
    { ...drafted("d1", "대규모 트래픽 경험이 꼭 필요한가요?"), status: "pending" as const, overlap: 0.2, askedAt: "" },
    drafted("d2", "Kafka 운영 경험은 필수인가요?"),
    drafted("d3", "원격 근무가 가능한가요?"),
  ];
  // The overlap model (stubbed) reads the answer and says d1 is settled by it.
  let sent = "";
  const started = performance.now();
  const check = await coveredQuestions({
    asked: [],
    drafted: draft.map((item) => item.question),
    answered: [answeredForOverlap(harper)],
    ask: (async (call: { user: string }) => ((sent = call.user), { data: { covered: [], repeated: [0] }, usage })) as never,
  });
  const plan = planDraftQueue({
    drafted: draft,
    pending: null,
    chatQueued: [],
    historyLength: 1,
    covered: new Set(check.repeated.map((index) => draft[index]!.id)),
    wordsPending: true,
    now: "t",
  });
  const addedMs = performance.now() - started;
  assert.deepEqual(JSON.parse(sent).ANSWERED, [{ question: "질문 h1", answer: "대규모 트래픽 서비스 출신" }], "the answer goes with the question");
  assert.equal(plan.pending?.id, "d2", "the next queued question is shown at once, not after the refine");
  assert.deepEqual(plan.skipped, ["d1"]);
  assert.deepEqual(plan.queued.map((item) => item.id), ["d3"]);
  assert.equal(plan.waitForWords, false);
  assert.equal(
    questionsTowardLimit({ history: [harper], pending: plan.pending, queued: plan.queued }),
    2,
    "the Harper answer and the question on screen; the skipped one is not counted"
  );
  // Guard b: the background apply drops a queued question it settled.
  assert.deepEqual(withoutSettled(plan.queued, new Set(["d3"])), []);
  // Code time around the check (the stubbed model returns at once); the real cost is the one fast model call.
  console.log(`[chatAnswers.test] overlap check + plan without the model: ${addedMs.toFixed(2)} ms`);
  assert.ok(addedMs < 50, `the check adds little besides the model call (${addedMs.toFixed(2)} ms)`);
});

test("fallback: nothing left to ask, so the screen waits for the apply", async () => {
  const { planDraftQueue } = await import("./chatAnswers");
  const harper = answered("h1", [note("n1", "있어요")], { chipId: "n1", text: "있어요" });
  const only = { ...drafted("d1", "참고할 인물이 있나요?"), status: "pending" as const, overlap: null, askedAt: "" };
  const plan = planDraftQueue({
    drafted: [only],
    pending: null,
    chatQueued: [],
    historyLength: [harper].length,
    covered: new Set(["d1"]),
    wordsPending: true,
  });
  assert.equal(plan.pending, null);
  assert.equal(plan.waitForWords, true, "the questions step stays open for the refinement to ask next");
  const done = planDraftQueue({ drafted: [only], pending: null, chatQueued: [], historyLength: 1, covered: new Set(["d1"]), wordsPending: false });
  assert.equal(done.waitForWords, false, "with no words left to apply the Brief opens instead");
});

test("a link or a pasted profile never settles another question; a chip label or short words can", async () => {
  const { settlingAnswer } = await import("./chatAnswers");
  const card = [note("n1", "있어요")];
  assert.equal(settlingAnswer(answered("h", card, { text: "https://www.linkedin.com/in/someone" })), null);
  assert.equal(settlingAnswer(answered("h", card, { text: "경력 ".repeat(200) })), null);
  assert.equal(settlingAnswer({ ...answered("h", card, { text: "있어요" }), status: "skipped" }), null);
  assert.equal(settlingAnswer(answered("h", card, { chipId: "n1", text: "있어요" })), "있어요");
  assert.equal(settlingAnswer(answered("d", [chip("c", { type: "none" })], { text: "있어요" })), null, "only Harper's own chat cards");
});
