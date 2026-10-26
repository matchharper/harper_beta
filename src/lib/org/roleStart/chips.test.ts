import assert from "node:assert/strict";
import test from "node:test";

// Clients are built at import time; the checks under test never reach them.
process.env.OPENAI_API_KEY ||= "test-only-not-used";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-only-not-used";

const usage = { label: "t", model: "m", inputTokens: 1, outputTokens: 1, usd: 0, ms: 0, at: "" };
const fakeAsk = (reply: unknown) => (async () => ({ data: reply, usage })) as never;

test("a question short of 4 chips is filled, keeping the given chips first", async () => {
  const { fillChips } = await import("./chipGuard");
  const filled = await fillChips({ question: "연봉 범위가 있나요?", chips: ["있어요", "있어요 ", "없어요"], ask: fakeAsk({ chips: ["있어요", "아직 정하지 않았어요", "경력에 따라 달라요", "협의 가능해요"] }) });
  assert.deepEqual(filled.chips, ["있어요", "없어요", "아직 정하지 않았어요", "경력에 따라 달라요", "협의 가능해요"]);
  const enough = await fillChips({ question: "q", chips: ["a", "b", "c", "d", "e", "f"], ask: (() => assert.fail("no call")) as never });
  assert.deepEqual(enough.chips, ["a", "b", "c", "d", "e"], "more than five: the first five, no call");
  await assert.rejects(fillChips({ question: "q", chips: ["a"], ask: fakeAsk({ chips: ["a", "b"] }) }), /too few/);
});

test("a question the role chat wrote as text becomes a card; the reply keeps the rest", async () => {
  const { questionCardFromReply } = await import("./chipGuard");
  const { card } = await questionCardFromReply({
    reply: "기준을 저장했어요.\n\n참고할 프로필이 있다면 알려주세요.",
    ask: (async (call: { label: string }) => ({
      usage,
      data:
        call.label === "chip_fill"
          ? { chips: ["있어요, 링크로 드릴게요", "없어요", "팀원 프로필을 참고해 주세요", "아직 정하지 않았어요"] }
          : { asks: true, question: "참고할 프로필이 있나요?", why: "", chips: ["있어요, 링크로 드릴게요", "없어요"], reply: "기준을 저장했어요." },
    })) as never,
  });
  assert.equal(card?.question, "참고할 프로필이 있나요?");
  assert.equal(card?.reply, "기준을 저장했어요.");
  assert.ok(card && card.chips.length >= 4 && card.chips.length <= 5, "filled to 4-5");
  const none = await questionCardFromReply({ reply: "저장했어요.", ask: fakeAsk({ asks: false, question: "", why: "", chips: [], reply: "저장했어요." }) });
  assert.equal(none.card, null);
});

test("draft and follow-up questions with fewer chips are kept for filling, not dropped", async () => {
  const { questionsFromRaw } = await import("./questions");
  const chip = (label: string) => ({ label, effect: { type: "none" } });
  const questions = questionsFromRaw([
    { question: "둘", why: "", chips: ["가", "나", "가 "].map(chip) },
    { question: "여섯", why: "", chips: ["가", "나", "다", "라", "마", "바"].map(chip) },
    { question: "칩 없음", why: "", chips: [] },
  ] as never);
  assert.deepEqual(questions.map((item) => [item.question, item.chips.length]), [["둘", 2], ["여섯", 5]]);
});

test("the role chat card tool needs a question; chips are filled, not refused", async () => {
  const { askRoleStartQuestionFromChat } = await import("./service");
  const access = { roleId: "00000000-0000-0000-0000-000000000000", workspaceId: "w", user: { id: "u" } as never };
  await assert.rejects(askRoleStartQuestionFromChat({ ...access, question: " ", chips: ["a"] }), /question is required/);
});

test("a reply that asks nothing makes no extra model call", async () => {
  const { mayAsk } = await import("./chipGuard");
  assert.equal(mayAsk("기준 5개를 저장했어요.\n\n- SQL 분석 경력 3년 이상"), false);
  assert.equal(mayAsk("근무 지역을 서울로 반영했어요."), false);
  assert.equal(mayAsk("연봉 범위가 정해져 있나요"), true);
  assert.equal(mayAsk("참고할 프로필이 있다면 편하게 알려주세요."), true);
  assert.equal(mayAsk("어떤 경험을 더 중요하게 볼까요?"), true);
});

test("a chat question a drafted question already covers is reported once, by its index", async () => {
  const { coveredQuestions } = await import("./chipGuard");
  const ask = (async () => ({
    data: { covered: [1, 1, 5, -1] },
    usage: { label: "question_overlap", model: "test", inputTokens: 0, outputTokens: 0, usd: 0, ms: 0, at: "" },
  })) as never;
  const result = await coveredQuestions({
    asked: ["연봉 범위가 정해졌나요?", "선호하는 연차가 있나요?"],
    drafted: ["경력은 몇 년 정도면 좋을까요?"],
    ask,
  });
  assert.deepEqual(result.covered, [1]);
  assert.deepEqual(result.repeated, [], "nothing answered: nothing repeated");
});

test("a drafted question that repeats a chat question the team already answered is reported by its index", async () => {
  const { coveredQuestions } = await import("./chipGuard");
  const ask = (async () => ({
    data: { covered: [], repeated: [0, 0, 3] },
    usage: { label: "question_overlap", model: "test", inputTokens: 0, outputTokens: 0, usd: 0, ms: 0, at: "" },
  })) as never;
  const result = await coveredQuestions({
    asked: [],
    drafted: ["Kafka 경험은 얼마나 중요하게 볼까요?", "Spark는 어느 수준이면 될까요?"],
    answered: ["Kafka 경험은 후보자를 볼 때 얼마나 중요한가요?"],
    ask,
  });
  assert.deepEqual(result.repeated, [0]);
  const none = await coveredQuestions({ asked: ["연봉 범위가 정해졌나요?"], drafted: ["Kafka 경험은 얼마나 중요하게 볼까요?"], ask });
  assert.deepEqual(none.repeated, [], "with nothing answered, a repeat from the model is ignored");
});

test("when chip filling fails, a question with 2 or more chips stays and one with fewer goes", async () => {
  const { keptWithoutFill } = await import("./chipGuard");
  const two = { question: "Kafka 경험은 얼마나 중요하게 볼까요?", chips: ["중요", "필수"] };
  assert.equal(keptWithoutFill(two), two);
  assert.equal(keptWithoutFill({ question: "Spark는 어느 수준이면 될까요?", chips: ["실무 경험"] }), null);
  assert.equal(keptWithoutFill({ question: "연차는요?", chips: [] }), null);
});

test("매우 잘 맞음 / 잘 맞음 get one chip per criterion the verdict read 잘 맞음 or better", async () => {
  const { likedReasonChips } = await import("./session");
  const chips = likedReasonChips({
    tldr: "",
    finalFit: "good",
    companyQuestion: null,
    criteria: [
      { criterionId: "c1", name: "결제 시스템 경험", fitness: "excellent", evidence: "결제 서비스를 3년 운영" },
      { criterionId: "c2", name: "리더 경험", fitness: "uncertain", evidence: "" },
      { criterionId: "c3", name: "백엔드 경력", fitness: "good", evidence: "" },
    ],
  });
  assert.deepEqual(chips.map((chip) => [chip.id, chip.label, chip.evidence]), [
    ["liked-c1", "결제 시스템 경험", "결제 서비스를 3년 운영"],
    ["liked-c3", "백엔드 경력", null],
  ]);
  assert.ok(chips.every((chip) => chip.appliesTo.includes("good") && !chip.appliesTo.includes("bad")));
  assert.deepEqual(likedReasonChips(null), []);
});
