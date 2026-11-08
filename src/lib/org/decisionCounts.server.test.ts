import assert from "node:assert/strict";
import test from "node:test";
import { candidateSaveId, readOrgCandidateSaves } from "./candidateSaved.server";
import { readOrgDecisionCounts } from "./decisionCounts.server";
import {
  buildOrgHomeInboxGroups,
  paginateOrgInbox,
} from "./inboxPagination";
import { buildRoleOverviewCounts } from "./roleBoardSummary";
import { fetchOrgBoard } from "./server";
import { readOrgNow } from "./todo.server";
import { fetchOrgAgentPipelineSnapshot } from "./agent/data";
import { fetchCurrentRoleSummaries } from "@/lib/ops/autoIntroToCompanyNotifications";
import { withCurrentCandidateCounts } from "@/lib/email/slackConnectionReminder";

// One fixture, every surface. The company sees the same "waiting" and "to
// request" numbers on Home, the overview, the inbox, the To-do, Slack, the
// no-Slack reminder and the chat index, and never the people Harper is
// still reviewing.

type Row = Record<string, any>;

/** An in-memory stand-in for the Supabase admin client: filters, order, ranges, embedded rows as stored. */
function fakeAdmin(
  tables: Record<string, Row[]>,
  options: { rpc?: Record<string, (args: any) => unknown>; users?: Row[] } = {}
) {
  const path = (row: Row, column: string) =>
    column.split(".").reduce<any>((value, key) => (Array.isArray(value) ? value[0]?.[key] : value?.[key]), row);
  class Query implements PromiseLike<any> {
    private filters: Array<(row: Row) => boolean> = [];
    private orders: Array<[string, boolean]> = [];
    private window: [number, number] = [0, Infinity];
    private mode: "many" | "maybe" | "single" = "many";
    private head = false;
    constructor(private table: string) {}
    select(_columns?: string, options?: { head?: boolean }) { this.head = Boolean(options?.head); return this; }
    eq(column: string, value: unknown) { this.filters.push((row) => path(row, column) === value); return this; }
    neq(column: string, value: unknown) { this.filters.push((row) => path(row, column) !== value); return this; }
    in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(path(row, column))); return this; }
    is(column: string, value: unknown) { this.filters.push((row) => (path(row, column) ?? null) === value); return this; }
    not(column: string, op: string, value: unknown) {
      if (op === "is") this.filters.push((row) => (path(row, column) ?? null) !== value);
      return this;
    }
    // As in SQL, a null never passes a comparison.
    private compare(column: string, test: (value: string) => boolean) {
      this.filters.push((row) => path(row, column) != null && test(String(path(row, column))));
      return this;
    }
    gte(column: string, value: unknown) { return this.compare(column, (current) => current >= String(value)); }
    gt(column: string, value: unknown) { return this.compare(column, (current) => current > String(value)); }
    lt(column: string, value: unknown) { return this.compare(column, (current) => current < String(value)); }
    lte(column: string, value: unknown) { return this.compare(column, (current) => current <= String(value)); }
    or() { return this; }
    contains(column: string, value: unknown) {
      this.filters.push((row) => {
        const current = path(row, column);
        return Array.isArray(value)
          ? Array.isArray(current) && value.every((item) => current.includes(item))
          : Boolean(current) && Object.entries(value as Row).every(([key, item]) => current[key] === item);
      });
      return this;
    }
    order(column: string, options?: { ascending?: boolean }) { this.orders.push([column, options?.ascending !== false]); return this; }
    limit(count: number) { this.window = [0, count - 1]; return this; }
    range(from: number, to: number) { this.window = [from, to]; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    single() { this.mode = "single"; return this; }
    returns() { return this; }
    then(resolve?: ((value: any) => any) | null, reject?: ((reason: any) => any) | null): Promise<any> {
      const rows = (tables[this.table] ?? [])
        .filter((row) => this.filters.every((filter) => filter(row)))
        .sort((left, right) => {
          for (const [column, ascending] of this.orders) {
            const a = String(path(left, column) ?? ""), b = String(path(right, column) ?? "");
            if (a !== b) return (a < b ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        })
        .slice(this.window[0], this.window[1] + 1);
      const result = this.head
        ? { data: null, error: null, count: rows.length }
        : this.mode === "many"
          ? { data: rows, error: null, count: rows.length }
          : { data: rows[0] ?? null, error: this.mode === "single" && !rows[0] ? { message: "no rows" } : null };
      return Promise.resolve(result).then(resolve, reject);
    }
  }
  return {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: any) =>
      options.rpc?.[name]
        ? { data: options.rpc[name](args), error: null }
        : { data: null, error: { code: "PGRST202", message: `missing ${name}` } },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: options.users?.find((user) => user.id === id) ?? null },
          error: null,
        }),
      },
    },
  } as any;
}

const WS = "10000000-0000-4000-8000-000000000001";
const ROLE_A = "20000000-0000-4000-8000-00000000000a";
const ROLE_B = "20000000-0000-4000-8000-00000000000b";
const OWNER = { id: "30000000-0000-4000-8000-000000000001", email: "owner@acme.test" };
const STAFF = { id: "30000000-0000-4000-8000-000000000002", email: "ops@matchharper.com" };
const talent = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number) => `2026-11-0${day}T00:00:00.000Z`;

/**
 * Role A: waiting T1; waiting but saved T2 (older); waiting but deleted T3;
 * 내부:수락 T4 and an implicit like T5 (Harper reviewing); 내부:수락 that the
 * company connected T6 (connected); to request T7; to request but saved T8.
 * Role B (test-only, fixture talent T9): to request T9; T10 hidden because
 * the Role is not available to them; waiting T11.
 */
function fixture() {
  const role = (roleId: string, name: string, information: Row = {}) => ({
    role_id: roleId, company_workspace_id: WS, name, status: "active", source_type: "internal",
    is_expired: false, expires_at: null, information, type: null, created_at: at(1), updated_at: at(1),
    company_role_assignees: [],
    company_internal_roles: { is_harper_tailored_role: false, team_id: null, request: "Engineer", criteria: [],
      is_company_first_search: true, intro_search_date: ["Mon", "Wed", "Fri"], intro_search_time: 9,
      max_pending_talents: null, is_promote: false, is_anonymous: false },
  });
  const recommendation = (id: string, talentId: string, roleId: string, extra: Row = {}) => ({
    id, talent_id: talentId, role_id: roleId, fit_summary: null, fit_reasons: [], feedback: null,
    saved_stage: null, recommended_at: at(2), created_at: at(2), updated_at: at(2), ...extra,
  });
  const tag = (talentId: string, roleId: string, value: string, day: number) => ({
    id: `tag-${talentId}-${value}`, talent_id: talentId, opportunity_id: roleId, tag: value,
    created_at: at(day), updated_at: at(day),
  });
  const intro = (id: string, talentId: string, roleId: string) => ({
    id, talent_id: talentId, role_id: roleId, company_workspace_id: WS, status: "ready", close_reason: null,
    selection_reason: "Fits", presentation: {}, talent_decision_at: null, recommendation_id: null,
    requested_at: null, company_appeal: null, next_stage_id: null, candidate_sent_at: null,
    selected_at: at(3), created_at: at(3), updated_at: at(3),
  });
  const save = (roleId: string, talentId: string, recommendationId: string, stage: string) => ({
    id: candidateSaveId(WS, { roleId, talentId, recommendationId }), kind: "org_candidate_saved",
    created_at: at(4), metadata: { saved: true, stage },
  });
  return {
    company_workspace: [{ company_workspace_id: WS, company_name: "Acme", is_reviewing: false, is_internal: false }],
    company_user_workspace: [{ id: "m1", company_user_id: OWNER.id, company_workspace_id: WS, authority: "owner",
      access_scope: "organization", team_id: null, company_workspace_team_members: [], created_at: at(1) }],
    company_roles: [role(ROLE_A, "Backend"), role(ROLE_B, "Fixture", { testOnly: true, testTalentIds: [talent(9)] })],
    talent_users: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({ user_id: talent(n), name: `Person ${n}`, deleted_at: null as string | null }))
      .concat([{ user_id: talent(3), name: "Deleted", deleted_at: at(1) }]),
    talent_effective_opportunity_recommendations_v1: [
      recommendation("r1", talent(1), ROLE_A), recommendation("r2", talent(2), ROLE_A),
      recommendation("r3", talent(3), ROLE_A), recommendation("r4", talent(4), ROLE_A),
      recommendation("r5", talent(5), ROLE_A, { feedback: "like" }), recommendation("r6", talent(6), ROLE_A),
      recommendation("r11", talent(11), ROLE_B),
    ],
    talent_opportunity_tag: [
      tag(talent(1), ROLE_A, "내부:연결대기", 3), tag(talent(2), ROLE_A, "내부:연결대기", 1),
      tag(talent(3), ROLE_A, "내부:연결대기", 1), tag(talent(4), ROLE_A, "내부:수락", 2),
      tag(talent(6), ROLE_A, "내부:수락", 2), tag(talent(11), ROLE_B, "내부:연결대기", 2),
    ],
    company_intro_candidates: [
      intro("i7", talent(7), ROLE_A), intro("i8", talent(8), ROLE_A),
      intro("i9", talent(9), ROLE_B), intro("i10", talent(10), ROLE_B),
    ],
    talent_progress: [
      { id: "p6", kind: "org_stage_change", role_id: ROLE_A, recommendation_id: "r6", metadata: { stage: "connected" } },
      save(ROLE_A, talent(2), "r2", "pending_connection"),
      save(ROLE_A, talent(8), "company-intro:i8", "company_intro"),
    ],
  } as Record<string, Row[]>;
}

const EXPECTED: Record<string, { pending_connection: number; company_intro: number; saved: number; reviewing: number }> = {
  [ROLE_A]: { pending_connection: 1, company_intro: 1, saved: 2, reviewing: 2 },
  [ROLE_B]: { pending_connection: 1, company_intro: 1, saved: 0, reviewing: 0 },
};
const HIDDEN = ["r4", "r5", talent(4), talent(5)];

test("number contract: every surface's number function returns the same numbers", async () => {
  const tables = fixture();
  const admin = fakeAdmin(tables, {
    users: [OWNER],
    rpc: { read_company_candidate_delivery_v1: () => [] },
  });
  const roles = [{ roleId: ROLE_A }, { roleId: ROLE_B }];

  // The shared reader (Slack, email and the To-do use it), as the owner.
  const decisions = await readOrgDecisionCounts({ admin, user: null, workspaceId: WS, roleIds: [ROLE_A, ROLE_B] });
  for (const roleId of [ROLE_A, ROLE_B])
    assert.deepEqual(decisions.get(roleId)!.counts, EXPECTED[roleId], `decision counts ${roleId}`);
  // The saved T2 waited longer, but only counted people set the age.
  assert.equal(decisions.get(ROLE_A)!.oldestWaitingSince, at(3));

  // Inbox tab badges: the board route's page counts.
  for (const roleId of [ROLE_A, ROLE_B]) {
    const board = await fetchOrgBoard({ admin, countReviewing: true, includeProfileLabels: false, roleId, user: OWNER as any, workspaceId: WS });
    const items = await readOrgCandidateSaves(admin, WS, board.items);
    assert.deepEqual(paginateOrgInbox({ ...board, items }, "pending_connection", "latest", 0).counts, EXPECTED[roleId], `inbox ${roleId}`);
  }

  // Home groups and the roles overview, from the workspace board.
  const board = await fetchOrgBoard({ admin, countReviewing: true, includeProfileLabels: false, user: OWNER as any, workspaceId: WS });
  const items = await readOrgCandidateSaves(admin, WS, board.items);
  const groups = buildOrgHomeInboxGroups(roles, items);
  const overview = buildRoleOverviewCounts(items);
  for (const roleId of [ROLE_A, ROLE_B]) {
    for (const stage of ["pending_connection", "company_intro"] as const) {
      const n = EXPECTED[roleId][stage];
      assert.equal(groups.find((group) => group.id === `${roleId}:${stage}`)?.remaining ?? 0, n, `home ${roleId} ${stage}`);
      assert.equal(overview.get(`${roleId}:${stage}`) ?? 0, n, `overview ${roleId} ${stage}`);
    }
    assert.equal(board.reviewingCountByRoleId?.[roleId] ?? 0, EXPECTED[roleId].reviewing, `home reviewing ${roleId}`);
  }
  // accepted + connected by the company counts as connected.
  assert.equal(overview.get(`${ROLE_A}:connected`), 1);

  // To-do decide items and its per-Role numbers.
  const now = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: "all", locale: "ko",
    readCreditSlots: async () => [] });
  for (const roleId of [ROLE_A, ROLE_B]) {
    const decide = (kind: string) => now.items.find((item) => item.roleId === roleId && item.kind === kind)?.count ?? 0;
    assert.equal(decide("pending_connection"), EXPECTED[roleId].pending_connection, `todo waiting ${roleId}`);
    assert.equal(decide("company_intro"), EXPECTED[roleId].company_intro, `todo to request ${roleId}`);
    assert.deepEqual(now.roles.find((role) => role.roleId === roleId)?.counts, EXPECTED[roleId], `todo roles ${roleId}`);
  }

  // Slack Mon/Wed/Fri table (waiting column).
  const [summary] = await fetchCurrentRoleSummaries(admin, { limit: 10, roleId: null, workspaceId: WS }, new Date());
  for (const roleId of [ROLE_A, ROLE_B])
    assert.equal(summary!.roles.find((role) => role.roleId === roleId)?.pendingDecisionCount,
      EXPECTED[roleId].pending_connection, `slack ${roleId}`);

  // Chat role index (formatRoles reads these counts).
  const snapshot = await fetchOrgAgentPipelineSnapshot({ admin, audience: "company_safe", roles: roles as any,
    user: OWNER as any, workspaceId: WS });
  for (const roleId of [ROLE_A, ROLE_B]) {
    const counts = snapshot.countsByRoleId.get(roleId)!;
    assert.deepEqual(
      { pending_connection: counts.waiting, company_intro: counts.intro, saved: counts.saved, reviewing: counts.reviewing },
      EXPECTED[roleId], `chat ${roleId}`);
    assert.equal(snapshot.countsByRoleId.get(ROLE_A)!.active, 1, "connected counts as active");
  }

  // No-Slack reminder: the queued snapshot's numbers are replaced at send time.
  const reminder = withCurrentCandidateCounts({
    id: OWNER.id, name: null, locale: "ko", verifiedEmail: true, suppressed: false,
    workspaces: [{ name: "Acme", internal: true, membership: "owner", setupUrl: "",
      roles: [ROLE_A, ROLE_B].map((id) => ({ id, name: id, active: true, testOnly: false, canDeliverToSlack: false,
        setupNeeded: "", pendingConnectionCount: 9, readyCandidateCount: 9, previouslyPresentedReadyCount: 5 })) }],
  }, new Map([...decisions].map(([roleId, read]) => [roleId, read.counts])));
  for (const role of reminder.workspaces[0]!.roles) {
    assert.equal(role.pendingConnectionCount, EXPECTED[role.id!].pending_connection, `reminder waiting ${role.id}`);
    assert.equal(role.readyCandidateCount, EXPECTED[role.id!].company_intro, `reminder ready ${role.id}`);
    assert.ok(role.previouslyPresentedReadyCount <= role.readyCandidateCount);
    // 확인 중 never goes to email.
    assert.ok(!JSON.stringify(role).includes("reviewing"));
  }
});

test("privacy: a company user gets the reviewing number, never those people or their IDs", async () => {
  const admin = fakeAdmin(fixture(), { users: [OWNER], rpc: { read_company_candidate_delivery_v1: () => [] } });
  const board = await fetchOrgBoard({ admin, countReviewing: true, includeProfileLabels: false, user: OWNER as any, workspaceId: WS });
  assert.equal(board.reviewingCountByRoleId?.[ROLE_A], 2);
  assert.ok(board.items.every((item) => item.stage !== "accepted"));
  assert.ok(!board.stages.some((stage) => stage.id === "accepted"));
  const decisions = await readOrgDecisionCounts({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_A] });
  const now = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_A], locale: "ko",
    readCreditSlots: async () => [] });
  for (const [label, value] of [["board", board], ["decision counts", [...decisions]], ["to-do", now]] as const) {
    const json = JSON.stringify(value);
    for (const id of HIDDEN) assert.ok(!json.includes(id), `${label} leaks ${id}`);
  }
  // Without countReviewing nothing about them is returned at all.
  const plain = await fetchOrgBoard({ admin, includeProfileLabels: false, user: OWNER as any, workspaceId: WS });
  assert.equal(plain.reviewingCountByRoleId, undefined);

  // Harper staff see the people themselves; the number is the same.
  const staffAdmin = fakeAdmin(fixture(), { users: [STAFF], rpc: { read_company_candidate_delivery_v1: () => [] } });
  const staffBoard = await fetchOrgBoard({ admin: staffAdmin, countReviewing: true, includeProfileLabels: false,
    user: STAFF as any, workspaceId: WS });
  const accepted = staffBoard.items.filter((item) => item.roleId === ROLE_A && item.stage === "accepted");
  assert.deepEqual(accepted.map((item) => item.recommendationId).sort(), ["r4", "r5"]);
  assert.equal(staffBoard.reviewingCountByRoleId?.[ROLE_A], accepted.length);
});

test("panel sections: scheduled and blocked appear and clear themselves", async () => {
  const tables = fixture();
  // The billing summary always lists the shared pool (slotId null) first.
  const slot = { id: "s", slotId: "slot-a" as string | null, label: "", roleId: ROLE_A as string | null,
    roleName: null, remaining: 0, allowance: 3, renewsAt: null, cancelAt: null };
  let slots = [{ ...slot, id: "shared", slotId: null, roleId: null }, slot];
  let eligible = true;
  const admin = fakeAdmin(tables, {
    users: [OWNER],
    rpc: {
      read_company_candidate_delivery_v1: () => [],
      company_role_scheduled_search_v1: ({ p_role_ids }: { p_role_ids: string[] }) =>
        p_role_ids.map((role_id) => ({ role_id, eligible, days: ["Wed"], hour: 9 })),
    },
  });
  const read = async () => {
    const now = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_A], locale: "ko",
      now: new Date("2026-11-09T00:00:00Z"), readCreditSlots: async () => slots as any });
    const line = (kind: string) => now.items.find((item) => item.kind === kind);
    return { now, line };
  };

  tables.company_agent_schedules = [
    { id: "50000000-0000-4000-8000-000000000001", revision: 1, title: "Follow up",
      next_run_at: "2026-11-10T00:00:00Z", created_by: "agent", status: "active", target_refs: {},
      company_workspace_id: WS, role_id: ROLE_A },
    // Paused: it keeps a stored time but does not run.
    { id: "50000000-0000-4000-8000-000000000002", revision: 4, title: "Weekly summary",
      next_run_at: "2026-11-09T12:00:00Z", created_by: "user", status: "paused", target_refs: {},
      company_workspace_id: WS, role_id: ROLE_A },
  ];
  tables.company_agent_operations = [
    { id: "op1", company_workspace_id: WS, role_id: ROLE_A, kind: "member_search", status: "failed",
      created_at: at(5), finished_at: at(5), external: [] },
    { id: "op2", company_workspace_id: WS, role_id: ROLE_A, kind: "external_search", status: "running",
      created_at: at(6), finished_at: null, external: [{ trigger: "agent_initiative" }] },
    { id: "op3", company_workspace_id: WS, role_id: ROLE_A, kind: "external_search", status: "failed",
      created_at: at(7), finished_at: at(7), external: [{ trigger: "shadow" }] },
  ];
  tables.company_slack_channels = [{ id: "c1", company_workspace_id: WS, slack_team_id: "T1", is_enabled: true }];
  tables.company_slack_integrations = [{ company_workspace_id: WS, slack_team_id: "T1", status: "revoked",
    bot_token_ciphertext: "x" }];

  let { now, line } = await read();
  // 예정: the next scheduled search (Wed 9:00 KST) and Harper's own scheduled work.
  assert.equal(line("scheduled_search")?.column, "scheduled");
  assert.equal(line("scheduled_search")?.nextAt, "2026-11-11T00:00:00.000Z");
  assert.equal(line("harper_scheduled")?.column, "scheduled");
  // Harper's work: when it runs and who set it up; paused work after it, with no time.
  const scheduled = now.items.filter((item) => item.kind === "harper_scheduled");
  assert.deepEqual(scheduled.map((item) => [item.detail, item.scheduleStatus, item.nextAt, item.scheduledBy]), [
    ["Follow up", "active", "2026-11-10T00:00:00Z", "harper"],
    ["Weekly summary", "paused", null, "team"],
  ]);
  // Cancelling needs manage_candidates: without it the rows carry nothing to cancel with.
  assert.ok(scheduled.every((item) => item.scheduleId === undefined && item.scheduleRevision === undefined));
  const manager = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_A], locale: "ko",
    now: new Date("2026-11-09T00:00:00Z"), readCreditSlots: async () => slots as any, canManage: true });
  assert.deepEqual(manager.items.filter((item) => item.kind === "harper_scheduled")
    .map((item) => [item.scheduleId, item.scheduleRevision]), [
    ["50000000-0000-4000-8000-000000000001", 1],
    ["50000000-0000-4000-8000-000000000002", 4],
  ]);
  // Harper가 하는 중: the external search; the shadow run never shows.
  assert.equal(line("external_search_running")?.column, "in_progress");
  // 막힌 것: the failed member search, Slack disconnected, no intros left with someone waiting.
  assert.deepEqual(now.items.filter((item) => item.column === "blocked").map((item) => [item.kind, item.detail ?? null]).sort(),
    [["intros_empty", null], ["search_failed", "member_search"], ["slack_delivery_error", "integration"]]);
  assert.equal(line("intros_empty")?.count, 1);
  assert.equal(now.roles[0]!.introsLeft, 0);
  assert.equal(now.roles[0]!.nextScheduledSearchAt, "2026-11-11T00:00:00.000Z");
  // Blocked items are not decisions: the decision count is unchanged.
  assert.equal(now.myTurn, now.items.filter((item) => item.column === "my_turn").length);

  // Each clears itself once its cause is gone.
  tables.company_agent_operations.push({ id: "op4", company_workspace_id: WS, role_id: ROLE_A, kind: "member_search",
    status: "succeeded", created_at: at(8), finished_at: at(8), external: [] });
  tables.company_slack_integrations[0]!.status = "active";
  slots = [slots[0]!, { ...slot, remaining: 2 }];
  eligible = false;
  ({ now, line } = await read());
  assert.deepEqual(now.items.filter((item) => item.column === "blocked"), []);
  assert.equal(line("scheduled_search"), undefined);
  assert.equal(now.roles[0]!.introsLeft, 2);

  // A failed Slack send blocks until a later send works.
  tables.company_first_slack_outbox = [{ company_workspace_id: WS, role_ids: [ROLE_A], status: "failed",
    delivery_channel: "slack", updated_at: at(8) }];
  ({ line } = await read());
  assert.equal(line("slack_delivery_error")?.detail, "send");
  tables.company_first_slack_outbox.push({ company_workspace_id: WS, role_ids: [ROLE_A], status: "sent",
    delivery_channel: "slack", updated_at: at(9) });
  ({ line } = await read());
  assert.equal(line("slack_delivery_error"), undefined);
});
test("Home: an ended Role keeps its numbers but has no To-do lines read", async () => {
  const tables = fixture();
  tables.company_roles.find((row) => row.role_id === ROLE_A)!.status = "ended";
  const admin = fakeAdmin(tables, { users: [OWNER], rpc: { read_company_candidate_delivery_v1: () => [] } });
  const home = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: "all", locale: "ko",
    readCreditSlots: async () => [] });
  assert.ok(!home.items.some((item) => item.roleId === ROLE_A));
  assert.ok(home.items.some((item) => item.roleId === ROLE_B));
  assert.deepEqual(home.roles.find((role) => role.roleId === ROLE_A)?.counts, EXPECTED[ROLE_A]);
  // The Role screen still reads its own To-do.
  const own = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_A], locale: "ko",
    readCreditSlots: async () => [] });
  assert.equal(own.items.find((item) => item.kind === "pending_connection")?.count, EXPECTED[ROLE_A].pending_connection);
});

test("Home: one Role that cannot be read leaves the others' To-do", async (t) => {
  const admin = fakeAdmin(fixture(), { users: [OWNER], rpc: { read_company_candidate_delivery_v1: () => [] } });
  const from = admin.from;
  admin.from = (table: string) => {
    const query = from(table);
    if (table !== "company_role_start_sessions") return query;
    let failing = false;
    const eq = query.eq.bind(query);
    query.eq = (column: string, value: unknown) => { if (value === ROLE_B) failing = true; eq(column, value); return query; };
    const then = query.then.bind(query);
    query.then = (resolve: any, reject: any) =>
      failing ? Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve, reject) : then(resolve, reject);
    return query;
  };
  const logged = t.mock.method(console, "error", () => {});
  const home = await readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: "all", locale: "ko",
    readCreditSlots: async () => [] });
  assert.ok(home.items.some((item) => item.roleId === ROLE_A));
  assert.ok(!home.items.some((item) => item.roleId === ROLE_B));
  assert.equal(logged.mock.callCount(), 1);
  // The Role screen still says it could not load.
  await assert.rejects(readOrgNow({ admin, user: OWNER as any, workspaceId: WS, roleIds: [ROLE_B], locale: "ko",
    readCreditSlots: async () => [] }));
});
