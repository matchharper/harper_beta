import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFT_EXPIRED_REASON, KILLED_TICK_NOTE, MIN_POSTINGS, PEOPLE_UNTIL_MS, QUEUE_DAYS, SEARCH_END_BY_MS, SEARCH_MAX_MS,
  SEND_CALL_TIMEOUT_MS, SEND_UNTIL_MS, STEP_MAX_ATTEMPTS, TICK_LIMIT_MS, bodyWithPostings, draftExpired, draftedAt,
  mayStartPerson, maySendNow, retryDelayMs, runErrorAfterTick, searchDeadline, searchStep, sendCallTimeoutMs,
  sendQueueFull, stillOpenPostings,
} from "./tickRules";
import type { AgentPosting } from "./types";

const S = 1_000;
const start = Date.parse("2026-11-17T03:00:00Z");

test("time slices: sending stops at 240 s, new people at 170 s, all inside the route's 300 s", () => {
  assert.equal(maySendNow(start, start + 239 * S), true);
  assert.equal(maySendNow(start, start + SEND_UNTIL_MS), false);
  assert.equal(mayStartPerson(start, start + 169 * S), true);
  assert.equal(mayStartPerson(start, start + PEOPLE_UNTIL_MS), false);
  assert.ok(SEND_UNTIL_MS + SEND_CALL_TIMEOUT_MS < TICK_LIMIT_MS);
  assert.ok(SEARCH_END_BY_MS < TICK_LIMIT_MS);
});

test("a search gets at most 150 s, ends by 255 s into the tick, and is not started with under a minute left", () => {
  // Early in the tick (after the reply read and sending): the full 150 s.
  assert.equal(searchDeadline(start, start + 40 * S), start + 40 * S + SEARCH_MAX_MS);
  // Later: cut to the tick's end.
  assert.equal(searchDeadline(start, start + 150 * S), start + SEARCH_END_BY_MS);
  // Under a minute left: none.
  assert.equal(searchDeadline(start, start + 200 * S), null);
});

test("a provider call never runs past the tick (20 s at most, less near the end, 1 s at least)", () => {
  assert.equal(sendCallTimeoutMs(start, start + 10 * S), SEND_CALL_TIMEOUT_MS);
  assert.equal(sendCallTimeoutMs(start, start + 260 * S), 10 * S);
  assert.equal(sendCallTimeoutMs(start, start + 299 * S), 1 * S);
});

test("throttle: no new people while the written mails cover 3 days of the cap", () => {
  assert.equal(QUEUE_DAYS, 3);
  assert.equal(sendQueueFull(89, 30), false);
  assert.equal(sendQueueFull(90, 30), true);
  assert.equal(sendQueueFull(0, 30), false);
  // A cap of 0 sends nothing: any queue is full (no money for mails that never go).
  assert.equal(sendQueueFull(0, 0), true);
  // The cap is whole mails.
  assert.equal(sendQueueFull(11, 4.9), false);
  assert.equal(sendQueueFull(12, 4.9), true);
});

test("a written mail expires 5 days after it was written", () => {
  const events = [
    { kind: "found" as const, at: "2026-11-01T00:00:00.000Z" },
    { kind: "drafted" as const, at: "2026-11-10T00:00:00.000Z" },
    { kind: "note" as const, at: "2026-11-12T00:00:00.000Z" },
  ];
  assert.equal(draftedAt(events, "2026-11-12T00:00:00.000Z"), "2026-11-10T00:00:00.000Z");
  assert.equal(draftedAt([], "2026-11-12T00:00:00.000Z"), "2026-11-12T00:00:00.000Z");
  assert.equal(draftExpired("2026-11-10T00:00:00.000Z", new Date("2026-11-15T00:00:00.000Z")), false);
  assert.equal(draftExpired("2026-11-10T00:00:00.000Z", new Date("2026-11-15T00:00:01.000Z")), true);
  assert.equal(draftExpired(null, new Date("2026-11-15T00:00:00.000Z")), false);
  assert.match(DRAFT_EXPIRED_REASON, /만료/);
});

const posting = (roleId: string | null, title: string): AgentPosting => ({
  kind: roleId ? "customer" : "external", roleId, url: roleId ? null : `https://jobs.example.com/${title}`, companyName: `Co ${title}`,
  title, location: null, why: "fits",
});

test("before sending, closed postings are dropped; fewer than 2 left → skip", () => {
  const postings = [posting("r1", "A"), posting("r2", "B"), posting(null, "C")];
  const one = stillOpenPostings(postings, new Set(["r1"]));
  assert.deepEqual(one.kept.map((item) => item.title), ["B", "C"]);
  assert.deepEqual(one.dropped.map((item) => item.title), ["A"]);
  assert.equal(one.skip, false);
  const two = stillOpenPostings(postings, new Set(["r1", "r2"]));
  assert.equal(two.kept.length, 1);
  assert.equal(two.skip, true);
  assert.equal(MIN_POSTINGS, 2);
  // A posting known by URL alone cannot be checked and stays.
  assert.equal(stillOpenPostings([posting(null, "X"), posting(null, "Y")], new Set(["r9"])).skip, false);
});

test("the draft's postings list is swapped only when the body ends with it", () => {
  const body = "Opening line.\n\n- A\n- B\n- C";
  assert.equal(bodyWithPostings(body, "- A\n- B\n- C", "- B\n- C"), "Opening line.\n\n- B\n- C");
  assert.equal(bodyWithPostings(`${body}\n`, "- A\n- B\n- C", "- B\n- C"), "Opening line.\n\n- B\n- C");
  assert.equal(bodyWithPostings("Edited body without the list", "- A\n- B", "- B"), null);
  assert.equal(bodyWithPostings(body, "", "- B"), null);
});

test("a source's search: marked tried before it starts, given up after 2 unfinished tries", () => {
  assert.equal(searchStep({}, "linkedin"), "try");
  assert.equal(searchStep({ search_attempts_linkedin: 1 }, "linkedin"), "try");
  assert.equal(searchStep({ search_attempts_linkedin: 2 }, "linkedin"), "give_up");
  assert.equal(searchStep({ search_attempts_linkedin: 2, searched_linkedin: 1 }, "linkedin"), "done");
  assert.equal(searchStep({ searched_okky: 1 }, "linkedin"), "try");
});

test("a step that failed for a passing reason is tried 3 times: after 5, then 20 minutes, then given up", () => {
  assert.equal(STEP_MAX_ATTEMPTS, 3);
  assert.equal(retryDelayMs(1), 5 * 60 * S);
  assert.equal(retryDelayMs(2), 20 * 60 * S);
  assert.equal(retryDelayMs(3), null);
  assert.equal(retryDelayMs(4), null);
});

test("the run's error: kept while ticks have problems, cleared by a tick without", () => {
  assert.deepEqual(runErrorAfterTick([]), { error: null, clear: true });
  assert.deepEqual(runErrorAfterTick(["  "]), { error: null, clear: true });
  assert.deepEqual(runErrorAfterTick([KILLED_TICK_NOTE]), { error: KILLED_TICK_NOTE, clear: false });
  const both = runErrorAfterTick(["메일 보내기를 잠시 멈췄어요", "메일 보내기를 잠시 멈췄어요", "사람 찾기 실패"]);
  assert.equal(both.error, "메일 보내기를 잠시 멈췄어요 · 사람 찾기 실패");
  assert.equal(both.clear, false);
  assert.ok((runErrorAfterTick(["x".repeat(2_000)]).error ?? "").length <= 1_000);
});
