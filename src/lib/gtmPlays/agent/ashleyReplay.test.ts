import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CandidateDraft } from "./ashleyAgent";
import type { PreSendResult } from "./ashleyCheck";
import {
  assertReplayCannotSend, gradeReplay, parseExpect, replayBlockedHost, replayMeetsBar, replayOutcome, replayTotals,
} from "./ashleyReplay";

const reply = (check: PreSendResult): CandidateDraft => ({
  kind: "reply", type: "question", reason: "질문 · pay", signals: [], body: "Hi", link: null, check, language: "en", asks: [],
  searched: false, fixedCopy: false,
});

test("outcome: a decided mail, a reply that passes the check (would go), a held reply", () => {
  assert.deepEqual(replayOutcome({ kind: "decided", action: "stop", type: "unsubscribe", reason: "수신 거부 · x" }), {
    action: "stop", wouldSend: false, reason: "수신 거부 · x", checkReasons: [],
  });
  assert.equal(replayOutcome(reply({ status: "ok" })).wouldSend, true);
  const held = replayOutcome(reply({ status: "fail", reasons: ["연봉 금액"] }));
  assert.deepEqual([held.action, held.wouldSend, held.checkReasons], ["held", false, ["연봉 금액"]]);
});

test("grade: a missed stop and a wrong send fail the bar; a held draft counts as handed to a person", () => {
  const send = replayOutcome(reply({ status: "ok" }));
  const missed = gradeReplay(["stop"], send);
  assert.deepEqual(missed, { status: "fail", missedStop: true, wrongSend: true });
  assert.deepEqual(gradeReplay(["stop"], { action: "hand_to_human", wouldSend: false, reason: "", checkReasons: [] }), {
    status: "fail", missedStop: true, wrongSend: false,
  });
  assert.deepEqual(gradeReplay(["reply", "stop"], send), { status: "pass", missedStop: false, wrongSend: false });
  assert.deepEqual(gradeReplay(["no_reply", "hand_to_human"], send), { status: "fail", missedStop: false, wrongSend: true });
  const held = replayOutcome(reply({ status: "fail", reasons: ["x"] }));
  assert.equal(gradeReplay(["hand_to_human"], held).status, "pass");
  assert.equal(gradeReplay(["reply"], held).status, "fail");
  assert.equal(gradeReplay(["no_reply"], { action: "member", wouldSend: false, reason: "", checkReasons: [] }).status, "pass");
  assert.equal(gradeReplay(null, send).status, "unlabelled");
  const totals = replayTotals([missed, gradeReplay(["reply"], send), gradeReplay(null, send)]);
  assert.deepEqual(totals, { cases: 3, pass: 1, fail: 1, unlabelled: 1, missedStops: 1, wrongSends: 1 });
  assert.equal(replayMeetsBar(totals), false);
  assert.equal(replayMeetsBar(replayTotals([gradeReplay(["reply"], send)])), true);
});

test("the replay refuses a sender and blocks the mail provider and Slack", () => {
  assert.throws(() => assertReplayCannotSend({ send: async () => ({}) }), /refusing to run/);
  assert.doesNotThrow(() => assertReplayCannotSend({}));
  assert.equal(replayBlockedHost("api.resend.com"), true);
  assert.equal(replayBlockedHost("slack.com"), true);
  assert.equal(replayBlockedHost("hooks.slack.com"), true);
  assert.equal(replayBlockedHost("openrouter.ai"), false);
  assert.equal(replayBlockedHost("notslack.com"), false);
  assert.deepEqual(parseExpect(["stop", "stop"]), ["stop"]);
  assert.equal(parseExpect(["stop", "maybe"]), null);
  assert.equal(parseExpect([]), null);
});

test("the committed made-up cases: valid, unique, example addresses only, every stop language", () => {
  const file = JSON.parse(readFileSync(new URL("../../../../scripts/gtm-agent/ashley-replay-cases.json", import.meta.url), "utf8")) as {
    cases: Array<{ id: string; expect: unknown; mail: { text: string }; postings: Array<{ url: string | null }> }>;
  };
  const ids = file.cases.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of file.cases) assert.ok(parseExpect(item.expect), `${item.id} expect`);
  const raw = JSON.stringify(file);
  for (const address of raw.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) assert.match(address, /@(example\.(com|org)|matchharper\.com)$/, address);
  for (const url of raw.match(/https?:\/\/[^\s"]+/g) ?? []) assert.match(new URL(url).hostname, /(^|\.)example\.(com|org)$|(^|\.)matchharper\.com$/, url);
  const stops = file.cases.filter((item) => JSON.stringify(item.expect) === '["stop"]');
  assert.ok(stops.length >= 8, "stop requests in several languages");
});
