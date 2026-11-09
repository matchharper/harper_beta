import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { runQueuedCriteriaConsolidation } from "./criteriaProposals.server";
import { CRITERIA_REVIEW_TOOLS, proposeCriteriaChange, runCriteriaReviewAgent } from "./criteriaReview.server";
import { getEnabledOrgAgentTools } from "./agent/tools";
import { resolveCompanyCapabilities } from "./agent/capabilities/resolver";
import { companyAgentCorrespondenceTools, companyAgentScope, companyAgentServiceTools, withCompanyAgentScope } from "@/lib/agentContacts/companyScope";
import { formatCompanyMemory } from "./agent/companyMemory";

// Harper's review of pass reasons, end to end with the database and the model
// replaced: the consolidation job, the shared tool loop, the real tool
// executor (toolExecution.ts) and propose_criteria_change. The stand-in model
// reads the review text it is given and "decides" by a fixed reading of the
// reasons; the real decision is the company model's, under the
// criteria_proposal policy. No network runs.

const workspaceId = "workspace-1";
const roleId = "role-1";
const jobId = "job-1";
const MODEL = "google/gemini-3.8-flash" as const;

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};
let rpcs: Array<{ name: string; args: Row }> = [];
let input: Row;
let proposals: Row[] = [];

function from(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  let returning = false;
  let order: { column: string; ascending: boolean } | null = null;
  let limit = Infinity;
  const run = () => {
    let rows = (tables[table] ??= []).filter((row) => filters.every((filter) => filter(row)));
    if (patch) {
      for (const row of rows) Object.assign(row, structuredClone(patch));
      return { data: returning ? structuredClone(rows) : null, error: null };
    }
    if (order) {
      const { column, ascending } = order;
      rows = [...rows].sort((a, b) => (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1));
    }
    return { data: structuredClone(rows.slice(0, limit)), error: null };
  };
  const builder: any = {
    insert: async (row: Row) => ((tables[table] ??= []).push({ id: `${table}-${tables[table].length + 1}`, ...structuredClone(row) }), { data: null, error: null }),
    select: () => ((returning = Boolean(patch)), builder),
    update: (values: Row) => ((patch = values), builder),
    eq: (column: string, value: unknown) => {
      const [field, key] = column.split("->>");
      filters.push((row) => (key ? row[field]?.[key] : row[field]) === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
    order: (column: string, options?: { ascending?: boolean }) => ((order = { column, ascending: options?.ascending !== false }), builder),
    limit: (count: number) => ((limit = count), builder),
    maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
    single: async () => {
      const row = (run().data as Row[] | null)?.[0];
      return row ? { data: row, error: null } : { data: null, error: new Error(`no ${table} row`) };
    },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

// The proposal functions as the migration defines them (20261107021000):
// one pending per Role, never a change the company already answered.
const RPC: Record<string, (args: Row) => unknown> = {
  company_decision_consolidation_input_v1: () => structuredClone(input),
  consume_company_decisions_v1: (args) => args.p_through_id,
  create_company_brief_proposal_v1: (args) => {
    if (proposals.some((proposal) => proposal.status === "pending")) return { status: "pending_exists" };
    if ((input.answeredKeys as string[]).includes(args.p_content_key)) return { status: "answered_before" };
    const id = `proposal-${proposals.length + 1}`;
    proposals.push({ id, status: "pending", ...args });
    (tables.company_agent_update_proposals ??= []).push({ id, workspace_id: args.p_workspace_id, status: "pending", summary: args.p_summary });
    return { status: "created", proposalId: id };
  },
};
const admin: any = {
  from,
  rpc: async (name: string, args: Row) => {
    rpcs.push({ name, args });
    return { data: RPC[name]?.(args) ?? null, error: null };
  },
};
const called = (name: string) => rpcs.filter((call) => call.name === name);
const job = () => structuredClone(tables.company_agent_web_action_jobs[0]);

const criteria = [
  { id: "c-rn", name: "React Native 실무 경험", criteria: "RN으로 앱을 출시해 봤다", requirement: "preferred", importance: 1 },
  { id: "c-ts", name: "TypeScript", criteria: "TS로 제품 개발", requirement: "preferred", importance: 2 },
  { id: "c-mobile", name: "모바일 경력 3년", criteria: "모바일 3년 이상", requirement: "must", importance: 3 },
];

/** Six candidates passed since the cursor (100), with their own words. */
function seed(reasons: Array<string | null>, extra: Partial<Row> = {}) {
  const decisions = reasons.map((_, index) => ({
    id: 106 - index,
    subjectId: `talent-${106 - index}`,
    reasonTags: [],
    hasReasonText: reasons[index] !== null,
    createdAt: `2026-11-06T0${index}:00:00Z`,
  }));
  input = {
    roleId, workspaceId, open: true, criteria, cursor: 100, briefRevision: 4,
    decisions, pending: null, answeredKeys: [], ...extra,
  };
  tables = {
    company_agent_web_action_jobs: [{
      id: jobId, action_name: "consolidate_decisions", status: "processing", locked_by: "worker-1",
      company_workspace_id: workspaceId, role_id: roleId, conversation_id: "conversation-1", anchor_message_id: 77,
      created_at: "2026-11-06T09:00:00Z", action_context: { roleId, throughDecisionId: 106 },
    }],
    company_roles: [{ role_id: roleId, company_workspace_id: workspaceId, status: "active", source_type: "internal", is_expired: false }],
    company_workspace: [{ company_workspace_id: workspaceId, is_reviewing: false }],
    company_conversations: [{ id: "conversation-1", company_workspace_id: workspaceId, role_id: roleId }],
    company_decision_events: decisions.map((decision, index) => ({
      id: decision.id, role_id: roleId, action: "pass", detail: {}, reason_text: reasons[index],
    })),
    talent_progress: [],
    talent_users: decisions.map((decision) => ({ user_id: decision.subjectId, headline: `Engineer ${decision.id}`, deleted_at: null })),
  };
}

beforeEach(() => {
  rpcs = [];
  proposals = [];
});

type Completion = { tools: string[]; system: string; review: string; last: string; all: string };
type Reply = { tool?: { name?: string; args: Row } } | null;

/** A stand-in model: sees what Harper would see and answers with `next`. */
function model(next: (seen: Completion, index: number) => Reply) {
  const seen: Completion[] = [];
  const complete = async (args: any) => {
    const contents = args.messages.map((message: any) =>
      typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")
    );
    const entry = {
      tools: (args.tools ?? []).map((tool: any) => tool.function.name).sort(),
      system: contents[0],
      review: contents.find((content: string) => content.includes('<company_agent_event kind="criteria_review">')) ?? "",
      last: contents.at(-1),
      all: contents.join("\n"),
    };
    seen.push(entry);
    const reply = next(entry, seen.length - 1);
    const message = reply?.tool
      ? { role: "assistant", content: null, tool_calls: [{ id: `call-${seen.length}`, type: "function",
          function: { name: reply.tool.name ?? "propose_criteria_change", arguments: JSON.stringify(reply.tool.args) } }] }
      : { role: "assistant", content: "검토만 했어요." };
    return { model: MODEL, response: { choices: [{ message }] } } as any;
  };
  return { complete, seen };
}

/** A fixed reading: passes whose reasons mention React Native, when they are most of them. */
function readsRN(review: string) {
  const blocks = review.split("\n- decision ").slice(1).map((block) => ({
    id: Number(block.split(" ")[0]),
    rn: /React Native|\bRN\b/.test(block.split("\n").slice(1).join("\n")),
  }));
  const rn = blocks.filter((block) => block.rn).map((block) => block.id);
  return rn.length >= 3 && rn.length * 2 >= blocks.length ? rn : null;
}

const context = async () => ({
  roles: [{ roleId, name: "모바일 엔지니어", criteria }], workspace: { companyName: "Example" }, companyText: "Example",
  rolesText: "-", recentRecommendationsText: "-", recentContactsText: "-", summariesText: "-", conversationText: "-",
  conversationMessages: [], contextNotesText: "-", defaultLongTextObservations: [],
}) as any;

function run(stand: ReturnType<typeof model>, messages?: "off" | "chat" | "origin") {
  return runQueuedCriteriaConsolidation({
    admin,
    job: job(),
    enabled: true,
    now: new Date("2026-11-07T00:00:00Z"),
    usage: () => ({ calls: stand.seen.length }),
    review: (prepared) =>
      runCriteriaReviewAgent({
        admin, job: job(), prepared,
        dependencies: { buildContext: context, locale: async () => "ko", model: MODEL, loop: { complete: stand.complete }, messages },
      }),
  });
}

const RN_PATTERN = [
  "React Native 경험이 없어요",
  "RN 실무 경험 없음, 웹만 해 봤대요",
  "연봉 기대치가 너무 높아요",
  "React Native로 앱을 출시해 본 적이 없음",
  "지금은 이직 생각이 없대요",
  "RN 경험 부족",
];

test("a clear pattern in free-text reasons: Harper files one suggestion and the cursor moves", async () => {
  seed(RN_PATTERN);
  const stand = model((seen, index) => {
    if (index > 0) return null;
    const ids = readsRN(seen.review);
    return ids ? { tool: { args: { criterionId: "c-rn", decisionIds: ids, reason: "넘긴 후보 대부분이 React Native 실무 경험이 없었어요." } } } : null;
  });
  const result = await run(stand);
  assert.deepEqual(result, { proposalId: "proposal-1", status: "proposed", throughDecisionId: 106 });

  // What Harper was given: three tools, the policy, and the company's own words.
  const [first, second] = stand.seen;
  assert.deepEqual(first.tools, ["propose_criteria_change", "read_role", "read_talent"]);
  assert.deepEqual([...CRITERIA_REVIEW_TOOLS].sort(), first.tools);
  assert.match(first.system, /<capability_policy id="criteria_proposal">/);
  assert.match(first.review, /Passed since your last review, with a stated reason \(6\):/);
  assert.match(first.review, /- decision 106 \| 2026-11-06 09:00 \| passed \| candidate talent-106 \| headline: Engineer 106\n  reason: "React Native 경험이 없어요"/);
  assert.match(first.review, /- c-rn \| React Native 실무 경험 \| nice to have \(있으면 좋음\) \| can be raised to important \(중요\)/);

  // One suggestion, through the same To-do path as before, in Harper's words.
  const [create] = called("create_company_brief_proposal_v1");
  assert.deepEqual(create.args.p_payload, {
    version: 1,
    change: { type: "criterion_level", criterionKey: "c-rn", criterionName: "React Native 실무 경험", from: "nice", to: "important" },
    evidence: { count: 4, window: 6, decisionIds: [106, 105, 103, 101] },
    locale: "ko",
    rationale: "넘긴 후보 대부분이 React Native 실무 경험이 없었어요.",
  });
  assert.equal(create.args.p_kind, "criteria_refinement");
  assert.equal(create.args.p_base_brief_revision, 4);
  assert.equal(create.args.p_summary, "'React Native 실무 경험' 기준을 있으면 좋음에서 중요로 올릴까요? 넘긴 후보 대부분이 React Native 실무 경험이 없었어요. (이유를 남긴 6명 중 4명)");
  // Harper is told what actually happened.
  assert.match(second.last, /Suggestion proposal-1 added to the Role's To-do: React Native 실무 경험: nice → important, from 4 of the 6 candidates/);
  assert.match(second.last, /Nothing changed yet/);

  // The cursor moves past what was read; the job keeps what Harper could cite and what it filed.
  assert.deepEqual(called("consume_company_decisions_v1").map((call) => call.args), [{ p_role_id: roleId, p_through_id: 106 }]);
  const done = job();
  assert.equal(done.status, "completed_silent");
  assert.deepEqual(done.usage, { calls: 2 });
  assert.equal(done.action_context.criteriaReview.proposalId, "proposal-1");
  assert.equal(done.action_context.criteriaReview.withReason, 6);
  assert.deepEqual(done.action_context.agentExecution.model, MODEL);
});

test("mixed reasons: Harper makes no suggestion and the cursor still moves", async () => {
  seed(["React Native 경험이 없어요", "연봉이 안 맞아요", "지금은 이직 생각 없음", "TypeScript를 안 써 봄", "출퇴근이 멀어요", "팀 분위기와 안 맞을 듯"]);
  const stand = model((seen) => {
    const ids = readsRN(seen.review);
    return ids ? { tool: { args: { criterionId: "c-rn", decisionIds: ids, reason: "RN" } } } : null;
  });
  const result = await run(stand);
  assert.deepEqual(result, { status: "nothing", throughDecisionId: 106 });
  assert.equal(stand.seen.length, 1);
  assert.equal(called("create_company_brief_proposal_v1").length, 0);
  assert.equal(called("consume_company_decisions_v1").length, 1);
  assert.equal(job().status, "completed_silent");
  assert.equal(job().action_context.criteriaReview.withReason, 6);
  assert.equal(job().action_context.criteriaReview.proposalId, undefined);
});

test("no duplicate: one suggestion per review, none while one waits, never an answered change", async () => {
  // Twice in one review: the second is refused by the review itself.
  seed(RN_PATTERN);
  const args = { criterionId: "c-rn", decisionIds: [106, 105, 103, 101], reason: "RN 경험 부족이 반복돼요." };
  const twice = model((_, index) => (index < 2 ? { tool: { args } } : null));
  assert.equal((await run(twice)).status, "proposed");
  assert.equal(called("create_company_brief_proposal_v1").length, 1);
  assert.match(twice.seen[2].last, /Not added: this review already added suggestion proposal-1; one suggestion per review\./);

  // The next review while that suggestion waits: Harper does not run.
  rpcs = [];
  seed(RN_PATTERN, { pending: { id: "proposal-1", expiresAt: "2026-11-20T00:00:00Z", payload: proposals[0].p_payload } });
  const waiting = model(() => {
    throw new Error("Harper must not run while a suggestion waits");
  });
  assert.deepEqual(await run(waiting), { status: "pending", throughDecisionId: 106 });
  assert.equal(called("consume_company_decisions_v1").length, 1);

  // The company dismissed that change: it is not added again, and Harper is told.
  rpcs = [];
  proposals = [];
  seed(RN_PATTERN, { answeredKeys: ["criterion_level:c-rn:nice>important"] });
  const answered = model((seen, index) => (index === 0 ? { tool: { args } } : null));
  assert.deepEqual(await run(answered), { status: "nothing", throughDecisionId: 106 });
  assert.match(answered.seen[0].review, /Changes the company already applied or dismissed \(never suggested again\):\n- React Native 실무 경험: nice to have/);
  assert.match(answered.seen[1].last, /Not added: the company already applied or dismissed React Native 실무 경험: nice → important\. Nothing changed\./);
  assert.equal(proposals.length, 0);
});

test("the evidence is checked before anything is filed; refusals go back to Harper", async () => {
  seed([...RN_PATTERN.slice(0, 2), null, null, null, null]);
  // Two earlier passes (already reviewed) for context.
  input.decisions.push(
    { id: 95, subjectId: "talent-95", reasonTags: ["c-rn"], hasReasonText: false, createdAt: "2026-11-01T00:00:00Z" },
    { id: 94, subjectId: "talent-94", reasonTags: [], hasReasonText: true, createdAt: "2026-11-01T00:00:00Z" }
  );
  tables.company_decision_events.push({ id: 94, role_id: roleId, action: "pass", detail: {}, reason_text: "RN 없음" });
  const attempts: Row[] = [
    { criterionId: "c-rn", decisionIds: [106], reason: "RN" },
    { criterionId: "c-rn", decisionIds: [95, 94], reason: "RN" },
    { criterionId: "c-rn", decisionIds: [106, 103], reason: "RN" },
    { criterionId: "c-mobile", decisionIds: [106, 105], reason: "경력" },
    { criterionId: "c-rn", decisionIds: [106, 105], reason: "RN", roleId: "other-role" },
  ];
  const stand = model((_, index) => (index < attempts.length ? { tool: { args: attempts[index] } } : null));
  assert.equal((await run(stand)).status, "nothing");
  const results = stand.seen.slice(1).map((entry) => entry.last);
  assert.match(results[0], /at least two different candidates/);
  assert.match(results[1], /at least one pass since the last review/);
  assert.match(results[2], /Decision 103 is not a pass with a stated reason in this review/);
  assert.match(results[3], /already required \(필수\), the strictest level Harper suggests/);
  assert.match(results[4], /Role unavailable in this company event/);
  assert.equal(called("create_company_brief_proposal_v1").length, 0);
  assert.match(stand.seen[0].review, /Earlier passes with a stated reason on this Role, for context \(2\):/);
  assert.match(stand.seen[0].review, /Passed without any reason \(not citable\): 4 since your last review, 0 earlier\./);
});

test("a lost lease ends the review as superseded, before the cursor moves", async () => {
  seed(RN_PATTERN);
  const stand = model(() => {
    tables.company_agent_web_action_jobs[0].locked_by = "worker-2";
    return { tool: { args: { criterionId: "c-rn", decisionIds: [106, 105, 103], reason: "RN" } } };
  });
  await assert.rejects(run(stand), (error: any) => error?.constructor?.name === "AgentContactSupersededError");
  assert.equal(called("create_company_brief_proposal_v1").length, 0);
  assert.equal(called("consume_company_decisions_v1").length, 0);
});

test("the tool exists only in Harper's review: not in member chats, not in agent correspondence", async () => {
  const names = (tools: Array<{ function: { name: string } }>) => tools.map((tool) => tool.function.name);
  assert.ok(!names(getEnabledOrgAgentTools("chat")).includes("propose_criteria_change"));
  assert.ok(!names(getEnabledOrgAgentTools("slack")).includes("propose_criteria_change"));
  assert.ok(names(getEnabledOrgAgentTools("chat", { agentService: true })).includes("propose_criteria_change"));
  const member = resolveCompanyCapabilities({ surface: "chat", mode: "full", loaded: new Set() });
  assert.ok(!member.offeredToolNames.has("propose_criteria_change"));
  assert.doesNotMatch(member.catalogText, /criteria_proposal/);
  const progressive = resolveCompanyCapabilities({ surface: "chat", mode: "progressive", loaded: new Set() });
  assert.doesNotMatch(JSON.stringify(progressive.tools), /criteria_proposal/);
  assert.ok(companyAgentServiceTools().has("propose_criteria_change"));
  assert.ok(!companyAgentCorrespondenceTools().has("propose_criteria_change"));
  const receiver = resolveCompanyCapabilities({
    surface: "chat", mode: "progressive", loaded: new Set(["agent_correspondence"]),
    allowedToolNames: companyAgentCorrespondenceTools(), agentService: true,
  });
  assert.doesNotMatch(receiver.catalogText, /criteria_proposal/);

  // Called anywhere else, it refuses before reading anything.
  seed(RN_PATTERN);
  await assert.rejects(proposeCriteriaChange({ admin, input: { criterionId: "c-rn" } }), /only in Harper's review of pass reasons/);
  tables.company_agent_web_action_jobs[0].action_name = "agent_schedule_due";
  const elsewhere = withCompanyAgentScope(admin, {
    kind: "company_event", workspaceId, roleId, jobId, leaseOwner: "worker-1", assertCurrent: async () => undefined,
  });
  await assert.rejects(proposeCriteriaChange({ admin: elsewhere, input: { criterionId: "c-rn" } }), /only in Harper's review of pass reasons/);
  assert.equal(called("create_company_brief_proposal_v1").length, 0);
});

const PAYMENT_PATTERN = [
  "결제 시스템을 다뤄 본 적이 없어요",
  "PG 연동 경험이 없음",
  "연봉이 안 맞아요",
  "결제 도메인 경험 부족",
  "정산·결제 쪽 경험이 없대요",
  "이직 생각 없음",
];

test("reasons outside the current criteria: Harper suggests one new criterion through the same path", async () => {
  seed(PAYMENT_PATTERN);
  const args = {
    newCriterion: { name: "결제 도메인 경험", description: "결제·PG 연동을 실무로 다뤄 봤다", level: "important" },
    decisionIds: [106, 105, 103, 102],
    reason: "넘긴 후보 대부분이 결제 쪽 경험이 없었어요.",
  };
  const stand = model((_, index) => (index === 0 ? { tool: { args } } : null));
  assert.deepEqual(await run(stand), { proposalId: "proposal-1", status: "proposed", throughDecisionId: 106 });
  const [create] = called("create_company_brief_proposal_v1");
  assert.equal(create.args.p_kind, "criteria_refinement");
  assert.equal(create.args.p_content_key, "criterion_add:결제 도메인 경험");
  assert.deepEqual(create.args.p_payload.change, {
    type: "criterion_add", criterionName: "결제 도메인 경험", description: "결제·PG 연동을 실무로 다뤄 봤다", to: "important",
  });
  assert.equal(create.args.p_summary, "'결제 도메인 경험' 기준을 중요로 새로 넣을까요? 넘긴 후보 대부분이 결제 쪽 경험이 없었어요. (이유를 남긴 6명 중 4명)");
  assert.match(stand.seen[1].last, /Suggestion proposal-1 added to the Role's To-do: new criterion 결제 도메인 경험 \(important\), from 4 of the 6 candidates/);

  // Answered before: never again. Required or one candidate: refused in code.
  rpcs = [];
  proposals = [];
  seed(PAYMENT_PATTERN, { answeredKeys: ["criterion_add:결제 도메인 경험"] });
  const attempts: Row[] = [
    { ...args, newCriterion: { ...args.newCriterion, level: "required" } },
    { ...args, decisionIds: [106] },
    { ...args, criterionId: "c-rn" },
    { ...args, newCriterion: { ...args.newCriterion, name: "  결제 도메인  경험 " } },
  ];
  const again = model((_, index) => (index < attempts.length ? { tool: { args: attempts[index] } } : null));
  assert.equal((await run(again)).status, "nothing");
  const results = again.seen.slice(1).map((entry) => entry.last);
  assert.match(results[0], /A new criterion starts at nice to have \(있으면 좋음\) or important \(중요\)/);
  assert.match(results[1], /at least two different candidates/);
  assert.match(results[2], /exactly one of criterionId .* newCriterion .* or memoryNote/);
  assert.match(results[3], /Not added: the company already applied or dismissed new criterion 결제 도메인 경험 \(important\)\. Nothing changed\./);
  assert.equal(proposals.length, 0);
});

test("a new suggestion is also told once in the Role's web chat, in the card's words; off keeps it quiet", async () => {
  seed(RN_PATTERN);
  const args = { criterionId: "c-rn", decisionIds: [106, 105, 103, 101], reason: "넘긴 후보 대부분이 React Native 실무 경험이 없었어요." };
  const first = model((_, index) => (index === 0 ? { tool: { args } } : null));
  assert.equal((await run(first, "origin")).status, "proposed");
  const sent = () => (tables.company_messages ?? []).filter((row) => row.metadata?.criteriaProposalId === "proposal-1");
  assert.equal(sent().length, 1);
  assert.deepEqual(
    { ...sent()[0], id: undefined },
    {
      id: undefined, company_workspace_id: workspaceId, conversation_id: "conversation-1", role_id: roleId, role: "assistant",
      content: "'React Native 실무 경험' 기준을 있으면 좋음에서 중요로 올릴까요? 넘긴 후보 대부분이 React Native 실무 경험이 없었어요. (이유를 남긴 6명 중 4명)",
      message_type: "chat", status: "completed", model: MODEL,
      metadata: { source: "criteria_review", criteriaProposalId: "proposal-1", webActionJobId: jobId },
    }
  );

  // Harper calling again in that review, or the next review while it waits: no second message.
  rpcs = [];
  const keep = { messages: tables.company_messages, proposals: tables.company_agent_update_proposals };
  seed(RN_PATTERN, { pending: { id: "proposal-1", expiresAt: "2026-11-20T00:00:00Z", payload: proposals[0].p_payload } });
  Object.assign(tables, { company_messages: keep.messages, company_agent_update_proposals: keep.proposals });
  assert.equal((await run(model(() => null), "chat")).status, "pending");
  assert.equal(sent().length, 1);
  proposals = [];
  seed(RN_PATTERN);
  const twice = model((_, index) => (index < 2 ? { tool: { args } } : null));
  assert.equal((await run(twice, "chat")).status, "proposed");
  assert.equal(tables.company_messages.length, 1);

  // With messages off, the suggestion is only on the To-do.
  rpcs = [];
  proposals = [];
  seed(RN_PATTERN);
  const quiet = model((_, index) => (index === 0 ? { tool: { args } } : null));
  assert.equal((await run(quiet, "off")).status, "proposed");
  assert.equal((tables.company_messages ?? []).length, 0);
});

const TENURE_PATTERN = [
  "최근 두 회사 모두 6개월 안에 그만뒀어요",
  "연봉이 안 맞아요",
  "이전 두 직장을 다 반년도 안 다님",
  "짧게 옮겨 다닌 이력이라 어려워요",
  "React Native 경험 부족",
  "직전 두 곳 모두 몇 달 만에 퇴사",
];

test("reasons about a lasting company preference: Harper suggests one company memory note through the same path, told once in the chat", async () => {
  seed(TENURE_PATTERN);
  tables.talent_users[0].name = "김하나";
  tables.company_internal_roles = [{ role_id: roleId, team_id: "team-1" }];
  const args = {
    memoryNote: { text: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "company" },
    decisionIds: [106, 104, 103, 101],
    reason: "짧은 재직이 반복해서 넘긴 이유였어요.",
  };
  const stand = model((_, index) => (index === 0 ? { tool: { args } } : null));
  assert.deepEqual(await run(stand, "chat"), { proposalId: "proposal-1", status: "proposed", throughDecisionId: 106 });
  assert.match(stand.seen[0].review, /whether to save one company memory note/);
  // Harper chooses among raising, adding or a note, or nothing; the tool takes a note.
  assert.match(stand.seen[0].system, /Choose at most one: raise one existing criterion by one level; add one new criterion .*; or save one company memory note .* Or suggest nothing\./);
  assert.match(stand.seen[0].system, /A memory note holds what lasts beyond this Role's checks/);
  const tool = getEnabledOrgAgentTools("chat", { agentService: true }).find((item) => item.function.name === "propose_criteria_change")!;
  const note = (tool.function.parameters as any).properties.memoryNote;
  assert.deepEqual([note.required, note.properties.scope.enum], [["text", "scope"], ["company", "team"]]);
  assert.match(tool.function.description, /Give exactly one of the three/);
  const [create] = called("create_company_brief_proposal_v1");
  assert.equal(create.args.p_kind, "criteria_refinement");
  assert.equal(create.args.p_content_key, "memory_note:최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요");
  assert.deepEqual(create.args.p_payload, {
    version: 1,
    change: { type: "memory_note", note: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "company" },
    evidence: { count: 4, window: 6, decisionIds: [106, 104, 103, 101] },
    locale: "ko",
    rationale: "짧은 재직이 반복해서 넘긴 이유였어요.",
  });
  const summary =
    "'최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.' 내용을 회사 기억에 남길까요? 짧은 재직이 반복해서 넘긴 이유였어요. (이유를 남긴 6명 중 4명)";
  assert.equal(create.args.p_summary, summary);
  assert.equal(create.args.p_preview, "회사 기억: 최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.");
  assert.match(stand.seen[1].last, /Suggestion proposal-1 added to the Role's To-do: company memory note "최근 두 회사에서/);
  assert.match(stand.seen[1].last, /applying saves the note to company memory as written/);
  // The Role's web chat hears it once, in the card's words.
  const sent = (tables.company_messages ?? []).filter((row) => row.metadata?.criteriaProposalId === "proposal-1");
  assert.deepEqual(sent.map((row) => row.content), [summary]);

  // A team note goes to the Role's team. Names, answered notes and missing teams are refused in code.
  rpcs = [];
  proposals = [];
  seed(TENURE_PATTERN, { answeredKeys: ["memory_note:최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요"] });
  tables.talent_users[0].name = "김하나";
  const attempts: Row[] = [
    { ...args, memoryNote: { text: "김하나님처럼 짧게 다닌 분은 뽑지 않아요.", scope: "company" } },
    { ...args, memoryNote: { ...args.memoryNote, scope: "team" } },
    { ...args, memoryNote: { text: "최근 두 회사에서 모두, 6개월 안에 나온 분은 뽑지 않아요!", scope: "company" } },
  ];
  const again = model((_, index) => (index < attempts.length ? { tool: { args: attempts[index] } } : null));
  assert.equal((await run(again)).status, "nothing");
  const results = again.seen.slice(1).map((entry) => entry.last);
  assert.match(results[0], /names a candidate from this review/);
  assert.doesNotMatch(results[0], /김하나/);
  assert.match(results[1], /This Role has no team; use scope company/);
  assert.match(results[2], /Not added: the company already applied or dismissed company memory note/);
  assert.equal(proposals.length, 0);

  rpcs = [];
  seed(TENURE_PATTERN);
  tables.company_internal_roles = [{ role_id: roleId, team_id: "team-1" }];
  const team = model((_, index) => (index === 0 ? { tool: { args: { ...args, memoryNote: { ...args.memoryNote, scope: "team" } } } } : null));
  assert.equal((await run(team, "off")).status, "proposed");
  assert.deepEqual(called("create_company_brief_proposal_v1")[0].args.p_payload.change, {
    type: "memory_note", note: "최근 두 회사에서 모두 6개월 안에 나온 분은 뽑지 않아요.", scope: "team", teamId: "team-1",
  });
  assert.match(called("create_company_brief_proposal_v1")[0].args.p_summary, /내용을 팀 기억에 남길까요\?/);
});

test("the review's context carries company memory, so Harper does not suggest what it already says", async () => {
  seed(RN_PATTERN);
  const built: Row[] = [];
  const memory = formatCompanyMemory({ items: [{ ref: 9, revision: 1, scope: "company", teamId: null, roleId: null, label: "채용 규칙",
    content: "React Native 앱 출시 경험이 있는 분만 봐요.", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], total: 1, nextOffset: null }, true);
  const stand = model(() => null);
  await runQueuedCriteriaConsolidation({
    admin, job: job(), enabled: true, now: new Date("2026-11-07T00:00:00Z"), usage: () => ({ calls: stand.seen.length }),
    review: (prepared) => runCriteriaReviewAgent({ admin, job: job(), prepared, dependencies: {
      buildContext: async (args: any) => (built.push(args), { ...(await context()), contextNotesText: memory }),
      locale: async () => "ko", model: MODEL, loop: { complete: stand.complete },
    } }),
  });
  // Built as the Role-bound run (which reads company memory, see companyMemory.test.ts), with the company memo.
  assert.equal(companyAgentScope(built[0].admin)?.roleId, roleId);
  assert.deepEqual(built[0].initialDataKinds, ["workspace_memory"]);
  assert.match(stand.seen[0].all, /<context_notes>\n저장된 회사 메모리 1행; .*후보를 찾고 평가할 때 함께 쓰임.*\n#9 r1 · company · 채용 규칙 .*\nReact Native 앱 출시 경험이 있는 분만 봐요\./);
  assert.match(stand.seen[0].system, /Do not suggest a new criterion or a memory note for what it already says\./);
});
