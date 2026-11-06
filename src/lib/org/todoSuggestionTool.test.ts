import assert from "node:assert/strict";
import test from "node:test";
import {
  TODO_SUGGESTION_RULES,
  TodoSuggestionInputError,
  formatTodoSuggestionList,
  parseTodoSuggestionAdd,
  sameTodoSuggestion,
} from "./todoSuggestionTool";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = {
  kind: "follow_up_candidate",
  title: "박도현 님이 3일째 답이 없어요. 한 번 더 물어볼까요?",
  plan: "박도현 님에게 면접 가능한 시간을 다시 물어보고, 답이 오면 알려 드릴게요.",
};

test("add input: candidates sorted and deduplicated, 3 days by default", () => {
  const parsed = parseTodoSuggestionAdd({ ...base, talentIds: [B, A, B] });
  assert.deepEqual(parsed, { ...base, talentIds: [A, B], expiresInDays: 3 });
  assert.equal(parseTodoSuggestionAdd({ ...base, expiresInDays: 7 }).expiresInDays, 7);
  // Whitespace is folded so the card stays one line.
  assert.equal(parseTodoSuggestionAdd({ ...base, title: "  두 줄\n 제목  " }).title, "두 줄 제목");
});

test("add input: fixable refusals", () => {
  const refused = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => parseTodoSuggestionAdd(input), (error: unknown) =>
      error instanceof TodoSuggestionInputError && pattern.test(error.message));
  refused({ ...base, kind: "Follow up" }, /kind must be a short lowercase label/);
  refused({ ...base, kind: "x" }, /kind must be/);
  refused({ ...base, title: "" }, /title is required/);
  refused({ ...base, plan: "   " }, /plan is required/);
  refused({ ...base, title: "가".repeat(TODO_SUGGESTION_RULES.titleMaxLength + 1) }, /keep it under 140/);
  refused({ ...base, expiresInDays: 0 }, /from 1 to 7/);
  refused({ ...base, expiresInDays: 8 }, /from 1 to 7/);
  refused({ ...base, expiresInDays: 2.5 }, /from 1 to 7/);
  refused({ ...base, talentIds: "abc" }, /must be a list/);
  refused({ ...base, talentIds: ["talent-1"] }, /not a candidate ID/);
  refused({ ...base, talentIds: Array.from({ length: 6 }, (_, i) => `${i}1111111-1111-4111-8111-111111111111`) }, /at most 5/);
});

test("add input: no contact details on the card, but dates are fine", () => {
  for (const text of ["dohyun@example.com 으로 다시 보낼까요?", "010-1234-5678로 연락할까요?", "01012345678", "+82 10 1234 5678", "02-123-4567", "(415) 555-0100"]) {
    assert.throws(() => parseTodoSuggestionAdd({ ...base, title: text }), /must not contain an email address or phone number/);
    assert.throws(() => parseTodoSuggestionAdd({ ...base, plan: text }), /must not contain/);
  }
  for (const text of ["2026-11-09까지 답이 없으면 다시 물어볼까요?", "후보 12명 중 3명", "연봉 6,000만 원 이상", "3~5년 차"]) {
    assert.equal(parseTodoSuggestionAdd({ ...base, title: text }).title, text);
  }
});

test("same suggestion: same kind about the same candidates, in any order", () => {
  assert.ok(sameTodoSuggestion({ kind: "k1", talent_ids: [B, A] }, { kind: "k1", talentIds: [A, B] }));
  assert.ok(sameTodoSuggestion({ kind: "k1", talent_ids: null }, { kind: "k1", talentIds: [] }));
  assert.ok(!sameTodoSuggestion({ kind: "k1", talent_ids: [A] }, { kind: "k1", talentIds: [A, B] }));
  assert.ok(!sameTodoSuggestion({ kind: "k1", talent_ids: [A] }, { kind: "k2", talentIds: [A] }));
});

test("list text: open ones with the cap, recent answers and muted kinds", () => {
  const row = (id: string, status: string, extra = {}) => ({
    id, kind: "follow_up_candidate", title: `title ${id}`, plan: "p", status, talent_ids: [A], source: "harper",
    expires_at: "2026-11-09T00:00:00.000Z", decided_at: null, created_at: "2026-11-06T00:00:00.000Z", ...extra,
  });
  const text = formatTodoSuggestionList({
    roleId: "role-1",
    open: [row("s1", "pending")],
    answered: [row("s2", "dismissed", { decided_at: "2026-11-05T00:00:00.000Z" })],
    mutedKinds: ["widen_search"],
  });
  assert.match(text, /Open \(1 of at most 3\):\n- s1 \| follow_up_candidate \| open until 2026-11-09T00:00:00.000Z \| title s1 \| candidates 1111/);
  assert.match(text, /- s2 \| follow_up_candidate \| dismissed \(not now\) 2026-11-05T00:00:00.000Z \| title s2/);
  assert.match(text, /stop suggesting: widen_search\./);
  assert.match(formatTodoSuggestionList({ roleId: "r", open: [], answered: [], mutedKinds: [] }), /Open \(0 of at most 3\):\n- none[\s\S]*- none\n[\s\S]*stop suggesting: none\./);
});
