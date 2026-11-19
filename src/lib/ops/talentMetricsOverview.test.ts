import assert from "node:assert/strict";
import test from "node:test";
import {
  applySiteOf,
  buildOpsTalentMetricsOverview,
  type OverviewSignupRow,
} from "@/lib/ops/talentMetricsOverview";

const now = new Date("2026-11-18T03:00:00.000Z");
const days = (count: number) => count * 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

function signup(
  userId: string,
  signedUpAgoDays: number,
  steps: Partial<Record<"firstChat" | "gmail" | "delegated" | "connected", number>> = {},
  inFunnel = false
): OverviewSignupRow {
  const signedUpAt = now.getTime() - days(signedUpAgoDays);
  const step = (key: keyof typeof steps) =>
    steps[key] === undefined
      ? null
      : new Date(signedUpAt + days(steps[key]!)).toISOString();
  return {
    bucketStart: "2026-11-02",
    connectedAt: step("connected"),
    delegatedAt: step("delegated"),
    firstChatAt: step("firstChat"),
    gmailAt: step("gmail"),
    inFunnel,
    isComparison: false,
    isCurrent: true,
    signedUpAt: new Date(signedUpAt).toISOString(),
    userId,
  };
}

test("funnel counts the last 7 days of signups; channel rates use signups whose 7 days have passed", () => {
  const overview = buildOpsTalentMetricsOverview({
    applications: [],
    attribution: new Map([
      ["a", { channel: "jobs", jobSlug: "job-1" }],
      ["b", { channel: "linkedin", jobSlug: null }],
    ]),
    filters: { from: "2026-10-20", interval: "week", to: "2026-11-18" },
    generatedAt: now,
    jobs: [{ companyName: "Acme", isPublished: true, roleTitle: "Engineer", slug: "job-1" }],
    pending: [],
    signups: [
      signup("a", 10, { connected: 2, delegated: 1, firstChat: 0.1, gmail: 0.5 }),
      signup("b", 9, { firstChat: 8, gmail: 3 }),
      signup("c", 2, { firstChat: 0.1 }, true),
      signup("d", 5, { connected: 3, delegated: 1 }, true),
    ],
    trendRows: [],
  });

  assert.deepEqual(
    overview.funnel.steps.map((step) => [step.key, step.count]),
    [["signup", 2], ["firstChat", 1], ["gmail", 0], ["delegated", 1], ["connected", 1]]
  );
  assert.equal(overview.funnel.medianDaysToConnection, 3);
  assert.deepEqual([overview.funnel.from, overview.funnel.to], ["2026-11-11", "2026-11-17"]);
  assert.equal(overview.summary.signups, 4);
  assert.equal(overview.summary.jobsSignupShare, 1 / 4);
  const jobs = overview.channels.find((row) => row.key === "jobs");
  assert.equal(jobs?.matured, 1);
  assert.equal(jobs?.connectedRate, 1);
  // A signup without attribution belongs to 기타.
  assert.equal(overview.channels.find((row) => row.key === "other")?.signups, 2);
  assert.deepEqual(overview.postings, [
    { companyName: "Acme", delegated: 1, isPublished: true, roleTitle: "Engineer", signups: 1, slug: "job-1" },
  ]);
});

test("apply sites group subdomains and pending waits split by days", () => {
  const overview = buildOpsTalentMetricsOverview({
    applications: [
      { at: at(-days(1)), bucketStart: "2026-11-16", host: "job-boards.eu.greenhouse.io", isCurrent: true, sentence: null, status: "completed", submitted: true },
      { at: at(-days(2)), bucketStart: "2026-11-16", host: "job-boards.greenhouse.io", isCurrent: true, sentence: "Stopped before submission.", status: "completed", submitted: false },
      { at: at(-days(3)), bucketStart: "2026-11-16", host: "teamkai.career.greetinghr.com", isCurrent: true, sentence: null, status: "failed", submitted: false },
      { at: at(-days(40)), bucketStart: "2026-10-05", host: "wanted.co.kr", isCurrent: false, sentence: null, status: "completed", submitted: false },
    ],
    attribution: new Map(),
    filters: { from: "2026-10-20", interval: "week", to: "2026-11-18" },
    generatedAt: now,
    jobs: [],
    pending: [
      { since: at(-days(1)), talentId: "a" },
      { since: at(-days(4)), talentId: "a" },
      { since: at(-days(20)), talentId: "b" },
    ],
    signups: [],
    trendRows: [
      { activeTalents: 5, applyDelegated: 4, connectedTalents: null, externalConnections: 1, internalConnections: 0, key: "2026-11-16", rowType: "bucket" },
    ],
  });

  assert.deepEqual(overview.applySites, [
    { attempts: 1, host: "greetinghr.com", submitted: 0 },
    { attempts: 2, host: "greenhouse.io", submitted: 1 },
  ]);
  assert.equal(overview.applyFailures.length, 2);
  assert.equal(overview.trend[0].applySubmitted, 1);
  assert.equal(overview.trend[0].applyConfirmed, 3);
  assert.equal(overview.trend[0].applyDelegated, 4);
  assert.equal(overview.trend[0].applySuccessRate, 1 / 3);
  assert.deepEqual(
    overview.pendingConnections,
    {
      buckets: [
        { count: 1, label: "0~2일" },
        { count: 1, label: "3~6일" },
        { count: 1, label: "7일 이상" },
      ],
      requests: 3,
      talents: 2,
    }
  );
  assert.equal(applySiteOf("recruit.wanted.co.kr"), "wanted.co.kr");
  assert.equal(applySiteOf(null), "알 수 없음");
});
