import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { proactiveReviewWindow, enqueueDueCompanyProactiveReviews, parseProactiveReviewSchedule } from "./proactiveReview.server";

test("scheduled window is weekdays 17-19 KST, with no next-day catchup", () => {
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T16:59:59+09:00")).due, false);
  const window = proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"));
  assert.equal(window.due, true);
  assert.equal(window.date, "2026-10-15");
  assert.equal(window.deadlineAt, "2026-10-15T10:00:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T19:00:00+09:00")).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T17:00:00+09:00")).due, false);
});

test("external schedule moves the window and selected weekdays without changing defaults", () => {
  const schedule = parseProactiveReviewSchedule('{"daysOfWeek":[2,6],"startTimeKst":"09:30","windowMinutes":45}');
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T09:30:00+09:00"), schedule).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T09:29:59+09:00"), schedule).due, false);
  const start = proactiveReviewWindow(new Date("2026-10-17T09:30:00+09:00"), schedule);
  assert.equal(start.due, true);
  assert.equal(start.deadlineAt, "2026-10-17T01:15:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T10:15:00+09:00"), schedule).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"), parseProactiveReviewSchedule()).due, true);
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"), parseProactiveReviewSchedule('{"daysOfWeek":[]}')).due, false);
});

test("overnight windows keep the start-day deadline and idempotency date", () => {
  const schedule = parseProactiveReviewSchedule('{"daysOfWeek":[5],"startTimeKst":"23:30","windowMinutes":90}');
  const before = proactiveReviewWindow(new Date("2026-10-16T23:30:00+09:00"), schedule);
  const after = proactiveReviewWindow(new Date("2026-10-17T00:30:00+09:00"), schedule);
  assert.equal(before.due, true);
  assert.deepEqual(after, before);
  assert.equal(after.date, "2026-10-16");
  assert.equal(after.deadlineAt, "2026-10-16T16:00:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T01:00:00+09:00"), schedule).due, false);
});

test("invalid schedule values fail explicitly instead of triggering an unintended time", () => {
  for (const raw of ['[]', 'null', '{"daysOfWeek":[7]}', '{"startTimeKst":"24:00"}', '{"windowMinutes":0}', '{"windowMinutes":1441}']) {
    assert.throws(() => parseProactiveReviewSchedule(raw));
  }
});

type ChannelFixture = { id: string; company_workspace_id: string; slack_channel_id: string; is_enabled: boolean };
function schedulerFixture(channels: ChannelFixture[], options: {
  noOwner?: string[]; denied?: string[]; recent?: string[]; revoked?: string[];
} = {}) {
  const queued: any[] = [];
  const allowed: string[] = [];
  const cursors: Array<string | null> = [];
  const keys = new Set<string>();
  const ownerIds = new Map([...new Set(channels.map(c => c.company_workspace_id))]
    .map((workspace, i) => [workspace, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));
  const admin = createClient("https://scheduler.test", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      const q = url.searchParams;
      const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
      if (url.pathname.startsWith("/auth/v1/admin/users/")) {
        return json({ id: url.pathname.split("/").at(-1), aud: "authenticated", role: "authenticated" });
      }
      if (url.pathname === "/rest/v1/company_slack_channels") {
        if (q.get("is_enabled") === "eq.true") {
          cursors.push(q.get("id"));
          assert.equal(q.get("order"), "id.asc");
          return json(channels.filter(c => c.is_enabled && (!q.has("id") || c.id > q.get("id")!.slice(3)))
            .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(q.get("limit"))));
        }
        const rows = channels.filter(c => `eq.${c.id}` === q.get("id") && `eq.${c.company_workspace_id}` === q.get("company_workspace_id"));
        return json(rows.map(c => ({ ...c, is_enabled: c.is_enabled && !options.revoked?.includes(c.id) })));
      }
      const workspace = q.get("company_workspace_id")?.slice(3);
      if (url.pathname === "/rest/v1/company_user_workspace") {
        assert.equal(q.get("authority"), "eq.owner");
        assert.equal(q.get("order"), "created_at.asc,id.asc");
        assert.equal(q.get("limit"), "1");
        return json(options.noOwner?.includes(workspace!) ? [] : [{ company_user_id: ownerIds.get(workspace!), authority: "owner" }]);
      }
      if (url.pathname === "/rest/v1/company_messages") {
        assert.equal(q.get("role"), "eq.user");
        assert.equal(q.get("created_at"), "gte.2026-10-15T07:30:00.000Z");
        return json(options.recent?.includes(workspace!) ? [{ id: 1 }] : []);
      }
      assert.fail(`Unexpected request: ${url.pathname}`);
    } },
  });
  return { queued, allowed, cursors, ownerIds, dependencies: {
    admin: () => admin as any,
    allowed: async (args: { workspaceId: string; channelId: string }) => {
      allowed.push(args.channelId);
      return !options.denied?.includes(args.channelId);
    },
    enqueue: async (args: any) => {
      queued.push(args);
      const created = !keys.has(args.idempotencyKey);
      keys.add(args.idempotencyKey);
      return { created, dispatched: false, jobId: args.idempotencyKey };
    },
  } };
}

async function withDefaultReviewSchedule(run: () => Promise<void>) {
  const previous = process.env.COMPANY_PROACTIVE_REVIEW_SCHEDULE;
  delete process.env.COMPANY_PROACTIVE_REVIEW_SCHEDULE;
  try { await run(); } finally {
    if (previous === undefined) delete process.env.COMPANY_PROACTIVE_REVIEW_SCHEDULE;
    else process.env.COMPANY_PROACTIVE_REVIEW_SCHEDULE = previous;
  }
}

test("active channels are discovered automatically while owner, audience, recent-chat and current activation checks remain", async () => {
  await withDefaultReviewSchedule(async () => {
    const channels = [
      ["a", "w1", true], ["b", "w2", true], ["c", "w1", true],
      ["d", "disabled", false], ["e", "no-owner", true], ["f", "denied", true],
      ["g", "recent", true], ["h", "revoked", true],
    ].map(([id, workspace, enabled]) => ({ id: String(id), company_workspace_id: String(workspace), slack_channel_id: `C-${id}`, is_enabled: Boolean(enabled) }));
    const fixture = schedulerFixture(channels, { noOwner: ["no-owner"], denied: ["C-f"], recent: ["recent"], revoked: ["h"] });
    const now = new Date("2026-10-15T17:00:00+09:00");
    assert.equal(await enqueueDueCompanyProactiveReviews(now, fixture.dependencies), 3);
    assert.deepEqual(fixture.queued.map(q => [q.workspaceId, q.actionContext.channelDbId, q.user.id]), [
      ["w1", "a", fixture.ownerIds.get("w1")], ["w2", "b", fixture.ownerIds.get("w2")], ["w1", "c", fixture.ownerIds.get("w1")],
    ]);
    for (const q of fixture.queued) {
      assert.equal(q.actionName, "proactive_recruiting_review");
      assert.equal(q.dispatch, false);
      assert.equal(q.actionContext.deadlineAt, "2026-10-15T10:00:00.000Z");
      assert.equal(q.idempotencyKey, `proactive-review:${q.workspaceId}:${q.actionContext.channelDbId}:2026-10-15`);
    }
    assert.deepEqual(fixture.allowed, ["C-a", "C-b", "C-c", "C-f", "C-g"]);
    assert.equal(await enqueueDueCompanyProactiveReviews(now, fixture.dependencies), 0);
  });
});

test("automatic channel discovery reads past the first page and stays idle outside the scheduled window", async () => {
  await withDefaultReviewSchedule(async () => {
    const channels = Array.from({ length: 201 }, (_, i) => ({ id: String(i).padStart(4, "0"),
      company_workspace_id: `w${i}`, slack_channel_id: `C${i}`, is_enabled: true }));
    const fixture = schedulerFixture(channels);
    assert.equal(await enqueueDueCompanyProactiveReviews(new Date("2026-10-15T16:59:00+09:00"), fixture.dependencies), 0);
    assert.deepEqual(fixture.cursors, []);
    assert.equal(await enqueueDueCompanyProactiveReviews(new Date("2026-10-15T17:00:00+09:00"), fixture.dependencies), 201);
    assert.deepEqual(fixture.cursors, [null, "gt.0199", "gt.0200"]);
    assert.equal(fixture.queued.at(-1).workspaceId, "w200");
  });
});
