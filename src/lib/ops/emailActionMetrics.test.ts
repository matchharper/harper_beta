import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emailActionDays,
  emailActionPoints,
  summarizeEmailActions,
  type EmailActionDailyRow,
  type OpsEmailActionMetricsResponse,
} from "./emailActionMetrics";

const row = (day: string, kind: EmailActionDailyRow["kind"], emails: number, acted: number, openEmails = 0): EmailActionDailyRow => ({
  day, kind, emails, acted, openEmails, emailReply: acted, chat: 0, opportunity: 0,
});

const response = (rows: EmailActionDailyRow[], webOpens: OpsEmailActionMetricsResponse["webOpens"] = []): OpsEmailActionMetricsResponse => ({
  generatedAt: "2026-11-30T00:00:00.000Z",
  startDay: "2026-11-20",
  endDay: "2026-11-29",
  windowHours: 72,
  rows,
  webOpens,
});

test("days fill the whole range and the button lines start with the first button email", () => {
  const days = emailActionDays(response([
    row("2026-11-21", "plain", 10, 2),
    row("2026-11-24", "plain", 10, 1),
    row("2026-11-24", "choice_reply", 4, 2),
    row("2026-11-24", "choice_web", 1, 1),
  ]));
  assert.equal(days.length, 10);
  const daily = emailActionPoints(days, false);
  const before = daily.find((point) => point.day === "2026-11-21")!;
  assert.equal(before.all, 0.2);
  assert.equal(before.choice, null);
  assert.equal(before.plain, null);
  const after = daily.find((point) => point.day === "2026-11-24")!;
  assert.equal(after.all, 4 / 15);
  assert.equal(after.choice, 3 / 5);
  assert.equal(after.plain, 0.1);
  assert.equal(after.label, "11.24");
  // An empty day has no rate rather than 0%.
  assert.equal(daily.find((point) => point.day === "2026-11-22")!.all, null);
});

test("seven-day points add the trailing week together and carry pending emails", () => {
  const days = emailActionDays(response([
    row("2026-11-20", "plain", 10, 5),
    row("2026-11-26", "plain", 10, 1),
    row("2026-11-27", "plain", 10, 0, 10),
  ]));
  const rolling = emailActionPoints(days, true);
  assert.equal(rolling.find((point) => point.day === "2026-11-26")!.all, 6 / 20);
  // 11.20 leaves the window on 11.27.
  assert.equal(rolling.find((point) => point.day === "2026-11-27")!.all, 1 / 20);
  assert.equal(rolling.find((point) => point.day === "2026-11-27")!.pending, true);
  assert.equal(rolling.find((point) => point.day === "2026-11-26")!.pending, false);
});

test("the summary uses only days whose windows closed and counts web opens from the first button email", () => {
  const rows = [
    ...["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"].map((day) => row(day, "plain", 10, 1)),
    row("2026-11-27", "plain", 10, 3),
    row("2026-11-27", "choice_web", 2, 2),
    row("2026-11-28", "choice_reply", 5, 1, 5),
  ];
  const summary = summarizeEmailActions(emailActionDays(response(rows, [{ day: "2026-11-27", opens: 2 }, { day: "2026-11-21", opens: 9 }])));
  assert.equal(summary.firstChoiceDay, "2026-11-27");
  assert.deepEqual([summary.recent?.from, summary.recent?.to], ["2026-11-21", "2026-11-27"]);
  assert.equal(summary.recent?.counts.emails, 72);
  assert.deepEqual([summary.previous?.from, summary.previous?.to], ["2026-11-20", "2026-11-20"]);
  // 11.28 is still open, so its button emails wait.
  assert.equal(summary.sinceChoice?.choice_reply.emails, 0);
  assert.equal(summary.sinceChoice?.choice_web.acted, 2);
  assert.equal(summary.sinceChoice?.plain.emails, 10);
  assert.equal(summary.webOpensSinceChoice, 2);
});
