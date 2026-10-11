/** Live LLM + real local PostgreSQL scenario runner. Never connects to a writable remote DB. */
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { config } from "dotenv";
import { assertContactEvaluationStep, contactEvaluationSteps } from "./lib/companyAgentEvaluationContract";

const root = path.resolve(__dirname, "..");
const task = path.join(root, "docs/evaluation/company-talent-contacts");
const datasetVersion = process.env.CONTACT_QA_DATASET ?? "v2";
const roleVersion = process.env.CONTACT_QA_ROLE_DATASET ?? "v2";
if (!["v2", "v3"].includes(datasetVersion) || !["v2", "v3"].includes(roleVersion)) throw Error("Unsupported frozen version");
const runId = process.env.CONTACT_QA_RUN_ID || "2026-09-23-immediate-v2";
if (!/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Invalid local run ID");
const runDir = path.join(task, "runs", runId);
mkdirSync(runDir, { recursive: true, mode: 0o700 });
chmodSync(runDir, 0o700);
const save = (name: string, value: unknown) =>
  writeFileSync(path.join(runDir, name), JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
config({ path: path.join(root, ".env.local"), quiet: true });
// Preserve only LLM provider credentials. All DB and auth traffic is local;
// email/Slack/Calendar are intentionally not connected to real recipients.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55439";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "contact-qa-local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "contact-qa-local";
process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3107";
process.env.COMPANY_TALENT_REQUEST_TOKEN_SECRET =
  "isolated-company-contact-qa-token-secret";
for (const key of Object.keys(process.env))
  if (
    /SLACK.*TOKEN|RESEND_API_KEY|GOOGLE.*CLIENT_SECRET|VERCEL.*TOKEN/.test(key)
  )
    delete process.env[key];
const db = postgres(
  "postgresql://postgres:isolated-contact-qa@127.0.0.1:55437/postgres",
  { max: 1, onnotice: () => {} }
);
const capture = JSON.parse(
  readFileSync(path.join(task, "private/schema-and-identities-v2.json"), "utf8")
);
const fixtureFile = path.join(task, "private/fixture.json");
const command = process.argv[2] || "state";
const scenario = process.argv[3] || "UCT01";
const commandId = `${Date.now()}-${command}-${scenario}`;
const trace: any[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? String(input))
  );
  const llm = ["api.openai.com", "api.anthropic.com", "openrouter.ai"].includes(
    url.hostname
  );
  if (url.hostname !== "127.0.0.1" && !llm)
    throw Error(`QA external network blocked: ${url.hostname}`);
  const start = Date.now();
  const response = await originalFetch(input, init);
  if (url.hostname === "127.0.0.1" && !response.ok) {
    const failure = { path: url.pathname, status: response.status, body: await response.clone().text() };
    trace.push({ localTransportFailure: failure }); save(`${commandId}-local-errors.json`, trace.filter(x => x.localTransportFailure));
    console.error("Local transport failure:", failure);
  }
  if (llm && !url.pathname.includes("embeddings")) {
    let request: any = init?.body ?? null;
    try {
      request = JSON.parse(request);
    } catch {}
    const raw = await response.clone().text();
    let result: any = raw;
    try {
      result = JSON.parse(raw);
    } catch {}
    trace.push({
      endpoint: url.origin + url.pathname,
      request,
      result,
      status: response.status,
      durationMs: Date.now() - start,
    });
    save(`${commandId}-llm.json`, trace);
  }
  return response;
};
const localRequire = createRequire(import.meta.url);
// Match Next's after-response scheduling in a standalone process, without
// replacing any prompt, model, tool implementation, or DB result.
const nextPath = localRequire.resolve("next/server");
const nextServer = localRequire(nextPath);
const background: Promise<unknown>[] = [];
localRequire.cache[nextPath]!.exports = {
  ...nextServer,
  after: (fn: () => unknown) =>
    background.push(
      Promise.resolve()
        .then(fn)
        .catch((error) => ({ backgroundError: String(error) }))
    ),
};
const uuid = () => randomUUID();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function insert(table: string, row: Record<string, any>) {
  return await db`insert into ${db(table)} ${db(row)} on conflict do nothing returning *`;
}

async function setup() {
  if (existsSync(fixtureFile))
    throw Error("Fixture already exists; do not overwrite state");
  await db.unsafe(
    'create extension if not exists "uuid-ossp" with schema public; create extension if not exists pg_trgm with schema public'
  );
  const restore = JSON.parse(
    readFileSync(
      path.join(process.env.CONTACT_QA_SANDBOX!, "restore-report.json"),
      "utf8"
    )
  );
  for (const issue of restore.errors) {
    try {
      if (issue.name.includes("hnsw")) continue;
      if (issue.kind === "table") {
        const cols = capture.columns.filter(
          (c: any) => c.table_name === issue.name
        );
        const defs = cols.map(
          (c: any) =>
            `"${c.name}" ${c.type.replace(/vector\(\d+\)/g, "vector")} ${c.identity ? "generated by default as identity" : c.default_expr ? `default ${c.default_expr}` : ""} ${c.not_null ? "not null" : ""}`
        );
        await db.unsafe(
          `create table public."${issue.name}" (${defs.join(",")})`
        );
      } else if (issue.kind === "constraint") {
        if (
          (await db`select 1 from pg_constraint where conname=${issue.name}`)
            .length
        )
          continue;
        const c = capture.constraints.find((c: any) => c.name === issue.name);
        await db.unsafe(
          `alter table ${c.table_name} add constraint "${c.name}" ${c.definition}`
        );
      } else if (issue.kind === "index")
        await db.unsafe(
          capture.indexes.find((i: any) => i.name === issue.name).definition
        );
    } catch (error: any) {
      if (!["42P07", "42710"].includes(error.code)) throw error;
    }
  }
  await db.unsafe(`create schema if not exists realtime;
    create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$ select pg_notify('qa_realtime',left(payload::text,7000)) $$`);
  // Recover only incomplete local setup, never a frozen live run.
  for (const stale of await db`select role_id from company_roles where information->>'testFixture'='unified-company-talent-contact-qa'`) {
    await db`delete from company_roles where role_id=${stale.role_id}`;
  }
  const workspace = capture.workspace[0];
  for (const t of capture.talents)
    await insert("auth.users", { id: t.user_id, email: t.email });
  for (const row of capture.companyDb) await insert("company_db", row);
  await insert("company_workspace", workspace);
  if (datasetVersion === "v3") {
    const context = JSON.parse(readFileSync(path.join(task, "context-v1.json"), "utf8"));
    await db`update company_workspace set company_name=${context.companyName},company_description=${context.description},pitch=${context.description},brief=null,request=null,homepage_url=null,career_url=null,linkedin_url=null where company_workspace_id=${workspace.company_workspace_id}`;
    for (const row of capture.companyDb) await db`update company_db set name=${context.companyName},description=${context.description},short_description=${context.description},website_url=null,funding_url=null,related_links=null where id=${row.id}`;
  }
  for (const row of capture.companyUsers) await insert("company_users", row);
  for (const row of capture.memberships)
    await insert("company_user_workspace", row);
  for (const row of capture.talents) {
    await insert("talent_users", row);
    await insert("talent_setting", {
      user_id: row.user_id,
      is_onboarding_done: true,
      status: "stopped",
      preferred_locale: "ko",
      get_external_recommendation: false,
    });
  }
  const candidateA = capture.talents.find(
    (t: any) => t.user_id === capture.candidateAliases?.candidate_a
  );
  const candidateB = capture.talents.find(
    (t: any) => t.user_id === capture.candidateAliases?.candidate_b
  );
  if (!candidateA || !candidateB)
    throw Error("Capture must explicitly map candidate_a and candidate_b");
  const fixture: any = {
    workspaceId: workspace.company_workspace_id,
    actorId: capture.memberships[0].company_user_id,
    candidateA,
    candidateB,
    roles: {},
    scenarios: {},
  };
  for (const [key, name] of Object.entries({
    product: "Product Operations",
    success: "Customer Success",
    engineer: "Backend Engineer",
    gtm: "GTM Operations",
    data: "Data Operations",
    business: "Business Operations",
  })) {
    const roleId = uuid(),
      stageId = uuid();
    await insert("company_roles", {
      role_id: roleId,
      company_workspace_id: fixture.workspaceId,
      name,
      status: "active",
      source_type: "internal",
      information: {
        testOnly: true,
        testFixture: "unified-company-talent-contact-qa",
        testTalentIds: [candidateA.user_id, candidateB.user_id],
      },
      description: `Harper 내부 ${name} 테스트 역할.`,
      location_text: "Seoul",
      work_mode: "hybrid",
    });
    await db`update company_internal_roles set is_company_first_search=false,request=null where role_id=${roleId}`;
    await insert("ops_matching_role_stages", {
      id: stageId,
      role_id: roleId,
      label: "대화",
      sort_order: 1,
    });
    fixture.roles[key] = { roleId, stageId, name };
  }
  for (const [id, roleKey, candidate, closed] of [
    ["UCT01", "product", candidateA, false],
    ["UCT02", "engineer", candidateB, true],
    ["UCT03", "gtm", candidateA, false],
    ["UCT04", "data", candidateB, true],
    ["UCT05", "business", candidateA, false],
  ] as const) {
    const role = fixture.roles[roleKey],
      recommendationId = uuid(),
      conversationId = uuid();
    await insert("talent_opportunity_recommendation", {
      id: recommendationId,
      talent_id: candidate.user_id,
      role_id: role.roleId,
      opportunity_type: "internal_recommendation",
      feedback: "like",
      saved_stage: closed ? "closed" : "accepted",
      processed_stage: closed ? "process_stopped" : `custom:${role.stageId}`,
    });
    await insert("talent_opportunity_tag", {
      talent_id: candidate.user_id,
      opportunity_id: role.roleId,
      tag: closed
        ? "내부:프로세스중단"
        : `내부단계:${role.stageId.replaceAll("-", "")}`,
    });
    // A real prior company-visible connection is necessary for closed/proactive contacts.
    await insert("talent_progress", {
      talent_id: candidate.user_id,
      role_id: role.roleId,
      recommendation_id: recommendationId,
      kind: "org_stage_change",
      text: "테스트 초기 연결 이력",
      metadata: { stage: "connected" },
    });
    await insert("talent_conversations", {
      id: conversationId,
      user_id: candidate.user_id,
      stage: "completed",
    });
    fixture.scenarios[id] = {
      roleKey,
      roleId: role.roleId,
      recommendationId,
      conversationId,
      talentId: candidate.user_id,
      candidateName: candidate.name,
    };
  }
  writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  await db.unsafe("notify pgrst,'reload schema'");
  save("manifest.json", {
    task: "company-talent-contacts",
    datasetVersion,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    diffHash: hash(
      execFileSync("git", ["diff"], { cwd: root, encoding: "utf8" })
    ),
    fixtureHash: hash(readFileSync(path.join(task, `cases-${datasetVersion}.json`), "utf8")),
    goldHash: hash(readFileSync(path.join(task, `gold-${datasetVersion}.json`), "utf8")),
    transport: "local capture; no real email/Slack receipt",
    auth: "local verified fixture identity adapter",
    model:
      "current runtime defaults; exact requests saved in per-turn llm traces",
    timeout: "runtime defaults",
    providerData:
      "minimum authorized identity and synthetic contacts; current configured LLM providers",
    productionWrites: 0,
  });
  console.log(
    JSON.stringify({
      fixtureReady: true,
      roles: Object.keys(fixture.roles),
      fitRows: (await db`select count(*) from talent_opportunity_fit`)[0].count,
    })
  );
}

async function state(fixture: any) {
  const result = {
    recommendations:
      await db`select r.id,role.name,r.saved_stage,r.processed_stage,r.talent_id from talent_opportunity_recommendation r join company_roles role on role.role_id=r.role_id order by role.name`,
    contacts:
      await db`select id,role_id,request_context,contact_kind,intent,workflow_status,delivery_body from company_talent_requests order by created_at`,
    relays: await db`select * from company_talent_relays order by created_at`,
    jobs: await db`select id,action_context,status,terminal_message_id,last_error from company_agent_web_action_jobs order by created_at`,
    queues:
      await db`select id,type,status,company_talent_request_id,company_talent_relay_id from contact_queue order by created_at`,
    fitRows: await db`select count(*) from talent_opportunity_fit`,
    meetings: await db`select count(*) from meeting_schedules`,
  };
  save(`${commandId}-state.json`, result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  if (datasetVersion === "v3") {
    const frozenManifest = JSON.parse(readFileSync(path.join(task, "manifest-v3.json"), "utf8"));
    for (const [file, expected] of Object.entries(frozenManifest.files)) {
      assert.equal(hash(readFileSync(path.resolve(task, file), "utf8")), expected, `Frozen input changed: ${file}`);
    }
    const contract = await (await fetch("http://127.0.0.1:55439/qa-contract")).json();
    assert.equal(contract.serviceAnswerExamples, "frozen-empty", "Restart sandbox with CONTACT_QA_SERVICE_EXAMPLES=empty");
  }
  // Each command is a fresh process: an audit-time snapshot cannot identify the
  // code that handled an earlier turn if the worktree changed between commands.
  const runtimePaths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard",
    "src/lib/org", "src/lib/companyTalentRequests", "src/lib/talentOnboarding", "src/lib/career",
    "src/lib/llm", "src/lib/serviceAnswerExamples.ts", "src/lib/serviceAnswerExampleCache.ts", "scripts/evalUnifiedCompanyContacts.ts",
    "scripts/companyContactQaSandbox.mjs", "scripts/lib/companyAgentEvaluationContract.ts", "src/lib/internalCandidateReengagement.ts",
    "supabase/migrations/20260923063625_unified_company_talent_contacts.sql", "supabase/migrations/20260924151548_company_contact_direct_delivery.sql"],
    { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
  const source = runtimePaths.map(file => ({ file, sha256: hash(readFileSync(path.join(root, file), "utf8")) }));
  const sourceFingerprint = hash(JSON.stringify(source));
  const lockFile = path.join(runDir, "cohort.json");
  if (datasetVersion === "v3" && !["cleanup", "audit", "state", "verify"].includes(command)) {
    if (existsSync(lockFile)) assert.equal(JSON.parse(readFileSync(lockFile, "utf8")).sourceFingerprint, sourceFingerprint, "Runtime changed within run; use a fresh run/fixture");
    else {
      save("cohort.json", { sourceFingerprint, datasetVersion, roleVersion, createdAt: new Date().toISOString() });
      save("initial-source-snapshot.json", runtimePaths.map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") })));
    }
  }
  save(`${commandId}-source.json`, { command, scenario, createdAt: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceFingerprint: hash(JSON.stringify(source)), files: source,
    inputHash: hash(readFileSync(path.join(task, `cases-${datasetVersion}.json`), "utf8")),
    goldHash: hash(readFileSync(path.join(task, `gold-${datasetVersion}.json`), "utf8")) });
  const localDataDirectory = (await db`show data_directory`)[0].data_directory;
  if (
    !/^\/(?:private\/)?tmp\/harper-contact-live\.[^/]+\/pgdata$/.test(
      localDataDirectory
    )
  )
    throw Error("Refusing non-sandbox PostgreSQL instance");
  if (command === "setup") {
    await setup();
    return;
  }
  if (command === "refresh-local-functions") {
    const sql = readFileSync(
      path.join(
        root,
        "supabase/migrations/20260923063625_unified_company_talent_contacts.sql"
      ),
      "utf8"
    );
    for (const name of [
      "read_company_talent_connections_v1",
      "confirm_internal_candidate_from_contact_v1",
    ]) {
      const start = sql.indexOf(`create or replace function public.${name}(`);
      const end = sql.indexOf("\n$$;", start) + 4;
      if (start < 0 || end < start) throw Error("Missing named function");
      await db.unsafe(sql.slice(start, end));
    }
    await db.unsafe(readFileSync(path.join(root,
      "supabase/migrations/20260924151548_company_contact_direct_delivery.sql"), "utf8"));
    await db.unsafe("notify pgrst,'reload schema'");
    console.log("Refreshed named functions in isolated local DB only");
    return;
  }
  const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
  if (datasetVersion === "v3" && ["company", "candidate", "candidate-first", "event", "role-creation"].includes(command)) {
    assert.ok(existsSync(path.join(runDir, "preflight.json")), "Run preflight before model calls");
  }
  const c = fixture.scenarios[scenario];
  if (!c) throw Error("Unknown frozen scenario");
  const frozen = JSON.parse(
    readFileSync(path.join(task, `cases-${datasetVersion}.json`), "utf8")
  ).cases.find((x: any) => x.id === scenario);
  const sequenceFile = path.join(runDir, "execution-sequence.json");
  const sequence: Record<string, string[]> = existsSync(sequenceFile) ? JSON.parse(readFileSync(sequenceFile, "utf8")) : {};
  const frozenStep = datasetVersion === "v3" && ["company", "candidate", "candidate-first", "deliver-candidate", "event"].includes(command);
  if (frozenStep) {
    assert.equal(process.argv[4], undefined, "Frozen runs forbid message overrides; create a new input version");
    assertContactEvaluationStep(frozen, sequence[scenario] ?? [], command);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const actor = capture.companyUsers.find(
    (u: any) => u.user_id === fixture.actorId
  );
  const user: any = {
    id: fixture.actorId,
    email: actor.email,
    user_metadata: { name: actor.name, full_name: actor.name },
    app_metadata: { provider: "email" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  if (command === "role-creation") {
    const inputPath = path.join(root, `docs/evaluation/company-side-conversational-qa/role-creation-${roleVersion}.json`);
    const spec = JSON.parse(readFileSync(inputPath, "utf8"));
    const roleId = uuid(), channelId = uuid(), integrationId = uuid();
    save(`${commandId}-role-input.json`, { spec, sha256: hash(readFileSync(inputPath, "utf8")), roleId, channelId });
    await insert("company_roles", { role_id: roleId, company_workspace_id: fixture.workspaceId,
      name: "새 역할", status: "draft", source_type: "internal", information: {
        testOnly: true, testFixture: "company-role-creation-qa-v1", testTalentIds: [] } });
    const fixtureRoleIds = Object.values(fixture.roles).map((r: any) => r.roleId);
    const previousRoles = await db`select role_id,status,information from company_roles where role_id in ${db(fixtureRoleIds)}`;
    assert.ok(previousRoles.every(r => r.information.testOnly === true));
    try {
      // Local authoring fixture must have registration capacity. Restore every exact status below.
      await db`update company_roles set status='paused' where role_id in ${db(fixtureRoleIds)}`;
      await insert("company_slack_integrations", { id: integrationId, company_workspace_id: fixture.workspaceId,
        slack_team_id: "T_QA_ROLE_CREATION", slack_team_name: "Local QA", status: "legacy" });
      await insert("company_slack_channels", { id: channelId, company_workspace_id: fixture.workspaceId,
        slack_channel_id: "C_QA_ROLE_CREATION", slack_channel_name: spec.fixture.channel,
        slack_team_id: "T_QA_ROLE_CREATION", is_enabled: true });
      const { runOrgRoleCreationChat } = await import("../src/lib/org/agent/roleCreationChat");
      const { fetchRoleCreationState } = await import("../src/lib/org/agent/roleCreationState");
      const turns = [];
      for (const [index, message] of spec.turns.entries()) {
        const result = await runOrgRoleCreationChat({ roleId, user, workspaceId: fixture.workspaceId, message,
          emit: (event, data) => { trace.push({ event, data }); save(`${commandId}-trace.json`, trace); } });
        const state = await fetchRoleCreationState({ roleId, user, workspaceId: fixture.workspaceId, allowCompletedRole: true });
        turns.push({ message, result, state }); save(`${commandId}-role-turns.json`, turns);
        console.log(JSON.stringify({ turn: index + 1, reply: result.assistantMessage.content, phase: state.metadata.phase, status: state.role.status }));
        if (index < spec.turns.length - 1) assert.equal(state.role.status, "draft", "Activation before final consent");
      }
      const last = turns.at(-1)!.state;
      assert.equal(last.role.status, "active"); assert.equal(last.metadata.phase, "completed");
      assert.equal(Number((await db`select count(*) from talent_opportunity_fit where opportunity_id=${roleId}`)[0].count), 0);
      save(`${commandId}-role-verification.json`, { structuralPass: true, semanticReview: "pending", inputHash: hash(readFileSync(inputPath, "utf8")) });
    } finally {
      await db.begin(async tx => {
        const rows = await tx`select information from company_roles where role_id=${roleId}`;
        assert.equal(rows[0]?.information.testFixture, "company-role-creation-qa-v1");
        await tx`delete from company_messages where role_id=${roleId}`;
        await tx`delete from company_conversations where role_id=${roleId}`;
        await tx`delete from company_roles where role_id=${roleId}`;
        await tx`delete from company_slack_channels where id=${channelId}`;
        await tx`delete from company_slack_integrations where id=${integrationId}`;
        for (const previous of previousRoles) await tx`update company_roles set status=${previous.status} where role_id=${previous.role_id}`;
      });
      save(`${commandId}-role-cleanup.json`, { removedRoleId: roleId, removedChannelId: channelId, productionWrites: 0 });
    }
  } else if (command === "reset-incomplete-fixture" || command === "cleanup") {
    const roleIds = Object.values(fixture.roles).map((r: any) => r.roleId);
    const roles =
      await db`select role_id,information from company_roles where role_id in ${db(roleIds)}`;
    if (
      roles.some(
        (r) =>
          r.information.testOnly !== true ||
          r.information.testFixture !== "unified-company-talent-contact-qa"
      )
    )
      throw Error("Refusing unmarked fixture cleanup");
    save("previous-state.json", await state(fixture));
    await db.begin(async (tx) => {
      const queueIds = (await tx`select id from contact_queue`).map(
        (q) => q.id
      );
      if (queueIds.length)
        await tx`delete from contact_queue where id in ${tx(queueIds)}`;
      await tx`delete from company_talent_relays where recommendation_id in (select id from talent_opportunity_recommendation where role_id in ${tx(roleIds)})`;
      await tx`delete from company_talent_requests where role_id in ${tx(roleIds)}`;
      await tx`delete from company_messages where conversation_id in (select id from company_conversations where role_id in ${tx(roleIds)})`;
      await tx`delete from company_conversations where role_id in ${tx(roleIds)}`;
      for (const sc of Object.values(fixture.scenarios) as any[]) {
        await tx`delete from talent_messages where conversation_id=${sc.conversationId}`;
        await tx`delete from talent_conversations where id=${sc.conversationId}`;
      }
      await tx`delete from company_roles where role_id in ${tx(roleIds)}`;
    });
    renameSync(
      fixtureFile,
      path.join(task, `private/fixture-${runId}-archived.json`)
    );
    if (command === "cleanup") {
      const remaining =
        await db`select (select count(*) from company_roles where role_id in ${db(roleIds)}) as roles,(select count(*) from talent_opportunity_fit) as fits,(select count(*) from contact_queue) as queues`;
      save("cleanup.json", {
        productionWrites: 0,
        removedRoleIds: roleIds,
        remaining: remaining[0],
      });
      console.log(JSON.stringify({ cleanup: remaining[0] }));
      return;
    }
    save("fixture-correction.json", {
      previousRuns: ["2026-09-23-initial", "2026-09-23-valid-fixture"],
      corrections: [
        "Canonical custom-stage tags omit UUID hyphens",
        "Prior mutual connection uses org_stage_change connected",
        "opportunity_type must be internal_recommendation, not internal_role",
      ],
      businessInputsAndGoldUnchanged: true,
      previousRunsNotPassEvidence: true,
    });
    console.log(
      "Removed exact isolated fixture data; previous traces and mapping archived."
    );
  } else if (command === "repair-fixture") {
    const roleIds = Object.values(fixture.roles).map((r: any) => r.roleId);
    save(`${commandId}-before.json`, await state(fixture));
    await db.begin(async (tx) => {
      await tx`delete from contact_queue where company_talent_request_id in (select id from company_talent_requests where role_id in ${tx(roleIds)})`;
      await tx`delete from company_talent_requests where role_id in ${tx(roleIds)}`;
      await tx`delete from company_messages where conversation_id in (select id from company_conversations where role_id in ${tx(roleIds)})`;
      await tx`delete from company_conversations where role_id in ${tx(roleIds)}`;
      await tx`update company_roles set status='active' where role_id in ${tx(roleIds)}`;
      await tx`update talent_progress set metadata='{"stage":"connected"}' where role_id in ${tx(roleIds)} and text='테스트 초기 연결 이력'`;
      for (const sc of Object.values(fixture.scenarios) as any[]) {
        if (sc.roleKey === "engineer") continue;
        await tx`update talent_opportunity_tag set tag=${"내부단계:" + fixture.roles[sc.roleKey].stageId.replaceAll("-", "")} where opportunity_id=${sc.roleId} and talent_id=${sc.talentId}`;
      }
    });
    save("fixture-repair.json", {
      reason:
        "Initial local fixture used hyphenated custom-stage tags, so active candidates were hidden from company board. Recreate canonical tags and connected provenance; mark isolated test roles open. Original model traces retained as invalid-fixture run, not passing evidence.",
      previousRun: "2026-09-23-initial",
      goldUnchanged: true,
    });
    console.log("Repaired local fixture only; original traces preserved.");
  } else if (command === "preflight") {
    assert.equal((await db`show server_encoding`)[0].server_encoding, "UTF8");
    assert.equal(Number((await db`select count(*) from talent_opportunity_fit`)[0].count), 0);
    if (datasetVersion === "v3") {
      const context = JSON.parse(readFileSync(path.join(task, "context-v1.json"), "utf8"));
      const [workspace] = await db`select pitch,request from company_workspace where company_workspace_id=${fixture.workspaceId}`;
      assert.equal(workspace.pitch, context.description); assert.equal(workspace.request, null);
      const exampleRead = await admin.rpc("match_service_answer_examples" as any, {});
      assert.equal(exampleRead.error, null); assert.deepEqual(exampleRead.data, []);
      const snapshotRead = await admin.from("service_answer_examples")
        .select("id,user_example_text,answer_example_text,tags,embedding,updated_at")
        .eq("audience", "company").eq("enabled", true)
        .eq("embedding_model", "text-embedding-3-small");
      assert.equal(snapshotRead.error, null); assert.deepEqual(snapshotRead.data, []);
    }
    const { fetchOrgBoard } = await import("../src/lib/org/server");
    const board = await fetchOrgBoard({
      user,
      workspaceId: fixture.workspaceId,
      includeInternalStages: true,
      includeProfileLabels: false,
    });
    save("preflight.json", board);
    console.log(
      JSON.stringify(
        board.items.map((x) => ({
          talent: x.talent.name,
          role: x.roleName,
          stage: x.stage,
          roleId: x.roleId,
        })),
        null,
        2
      )
    );
    for (const sc of Object.values(fixture.scenarios) as any[])
      if (!board.items.some((x) => x.recommendationId === sc.recommendationId))
        throw Error("Fixture is not company-visible");
    const { fetchRelayableCompanyTalentConnections } =
      await import("../src/lib/companyTalentRequests/server");
    for (const talent of [fixture.candidateA, fixture.candidateB]) {
      const connections = await fetchRelayableCompanyTalentConnections({
        admin: admin as any,
        talentId: talent.user_id,
        query: "Harper",
      });
      for (const sc of Object.values(fixture.scenarios) as any[])
        if (
          sc.talentId === talent.user_id &&
          !connections.some((x) => x.recommendationId === sc.recommendationId)
        )
          throw Error("Fixture has no relayable mutual connection");
    }
  } else if (command === "company") {
    const { runOrgAgentChat } = await import("../src/lib/org/agent/chat");
    const message =
      process.argv[4] ||
      (frozen.company ?? frozen.companyReply).replaceAll(
        "후보자",
        `${c.candidateName} 님`
      );
    const result = await runOrgAgentChat({
      user,
      workspaceId: fixture.workspaceId,
      roleId: c.roleId,
      message,
      debug: true,
      emit: (event, data) => {
        trace.push({ event, data });
        save(`${commandId}-trace.json`, trace);
      },
      mentions: [
        {
          talentId: c.talentId,
          displayName: c.candidateName,
          roleId: c.roleId,
          recommendationId: c.recommendationId,
        },
      ],
    });
    save(`${commandId}-result.json`, result);
    console.log(
      JSON.stringify(
        {
          content:
            "assistantMessage" in result
              ? result.assistantMessage?.content
              : null,
          tools:
            "assistantMessage" in result
              ? result.assistantMessage?.metadata?.toolResults
              : null,
          conversationId: result.conversationId,
        },
        null,
        2
      )
    );
  } else if (command === "candidate" || command === "candidate-first") {
    const { runCareerChatTurn } = await import("../src/lib/career/chatTurn");
    const message =
      process.argv[4] ||
      (command === "candidate-first"
        ? frozen.candidateFirst
        : frozen.candidateReply);
    const before =
      await db`select id,saved_stage,processed_stage from talent_opportunity_recommendation where id=${c.recommendationId}`;
    const result = await runCareerChatTurn({
      admin: admin as any,
      conversationId: c.conversationId,
      userId: c.talentId,
      userMessage: message,
      onThinkingLog: (status) => console.log("thinking:", status),
    });
    save(`${commandId}-result.json`, result);
    const deliveries =
      await db`select relay.id,relay.company_talent_request_id,q.status,
      (select count(*) from company_messages m where m.metadata->>'relayId'=relay.id::text) as mirrors,
      (select count(*) from company_agent_web_action_jobs j where j.idempotency_key='candidate-contact:'||relay.id::text) as jobs
      from company_talent_relays relay join contact_queue q on q.company_talent_relay_id=relay.id
      where relay.source_talent_message_id=${result.userMessage!.id} and q.type='company_contact_company_delivery'`;
    const after =
      await db`select id,saved_stage,processed_stage from talent_opportunity_recommendation where id=${c.recommendationId}`;
    const proof = {
      before,
      after,
      deliveries,
      candidateDidNotMovePipeline:
        JSON.stringify(before) === JSON.stringify(after),
    };
    save(`${commandId}-inline-delivery.json`, proof);
    assert.equal(
      deliveries.length,
      1,
      "Candidate must immediately send exactly one authorized contact"
    );
    assert.equal(deliveries[0].status, "sent");
    assert.equal(deliveries[0].company_talent_request_id, null);
    assert.ok(Number(deliveries[0].mirrors) >= 1);
    assert.equal(Number(deliveries[0].jobs), 1);
    assert.ok(proof.candidateDidNotMovePipeline);
    console.log(
      JSON.stringify(
        { assistant: result.assistantMessage, user: result.userMessage },
        null,
        2
      )
    );
  } else if (command === "deliver-candidate") {
    // Local transport capture only: preserve exact copy in the candidate thread
    // and simulate queue completion. This does not call a worker or deliver mail.
    const rows =
      await db`select r.*,q.id as queue_id,q.status as queue_status from company_talent_requests r join contact_queue q on q.company_talent_request_id=r.id and q.type='company_request_candidate_delivery' where r.talent_id=${c.talentId} and r.role_id=${c.roleId} and q.status in ('queued','processing') order by r.created_at`;
    for (const r of rows) {
      const message = (
        await insert("talent_messages", {
          user_id: c.talentId,
          conversation_id: c.conversationId,
          role: "assistant",
          content: r.delivery_body,
          message_type: "company_talent_request",
          payload: { companyTalentRequestId: r.id },
        })
      )[0];
      await db`update contact_queue set status='sent',sent_at=now() where id=${r.queue_id}`;
      await db`update company_talent_requests set workflow_status='closed' where id=${r.id}`;
      save(`${commandId}-${r.id}-transport.json`, {
        kind: "captured_candidate_delivery",
        requestId: r.id,
        body: r.delivery_body,
        messageId: message.id,
      });
    }
    console.log(JSON.stringify({ capturedCandidateDeliveries: rows.length }));
  } else if (command === "deliver-company" || command === "replay-delivery") {
    const before =
      command === "replay-delivery"
        ? (
            await db`select (select count(*) from company_agent_web_action_jobs) as jobs,(select count(*) from company_messages) as messages`
          )[0]
        : null;
    const rows =
      await db`select relay.* from company_talent_relays relay join contact_queue q on q.company_talent_relay_id=relay.id where q.type='company_contact_company_delivery' and q.status=${command === "replay-delivery" ? "sent" : "queued"} and relay.recommendation_id=${c.recommendationId}`;
    for (const r of rows) {
      const { deliverCompanyTalentRelay } =
        await import("../src/lib/companyTalentRequests/delivery");
      await deliverCompanyTalentRelay({ admin: admin as any, relayId: r.id });
      save(`${commandId}-${r.id}-transport.json`, {
        kind: "captured_company_delivery",
        relayId: r.id,
        body: r.relay_content,
      });
    }
    console.log(JSON.stringify({ capturedCompanyDeliveries: rows.length }));
    if (before) {
      const after = (
        await db`select (select count(*) from company_agent_web_action_jobs) as jobs,(select count(*) from company_messages) as messages`
      )[0];
      save(`${commandId}-idempotency.json`, {
        before,
        after,
        unchanged: JSON.stringify(before) === JSON.stringify(after),
      });
      console.log(JSON.stringify({ before, after }));
    }
  } else if (command === "event" || command === "replay-event") {
    const { runOrgAgentWebActionTurn } =
      await import("../src/lib/org/agent/chat");
    const jobs =
      await db`select * from company_agent_web_action_jobs where action_context->>'recommendationId'=${c.recommendationId} and (${command === "replay-event"} or status in ('queued','retry')) order by created_at`;
    const beforeReplay =
      command === "replay-event"
        ? await db`select (select count(*) from talent_progress) as progress,(select count(*) from company_talent_relays) as relays,(select count(*) from contact_queue) as queues,(select count(*) from company_messages) as company_messages`
        : null;
    for (const job of jobs) {
      const conversation = (
        await db`select * from company_conversations where id=${job.conversation_id}`
      )[0];
      const result = await runOrgAgentWebActionTurn({
        actionContext: job.action_context,
        actionName: job.action_name,
        actorLabel: actor.name,
        anchorMessageId: Number(job.anchor_message_id),
        conversation: conversation as any,
        jobId: job.id,
        roleId: job.role_id,
        user,
      });
      await db`update company_agent_web_action_jobs set status=${result.outcome},terminal_message_id=${result.terminalMessageId},progress_message_id=${result.progressMessageId},completed_at=now() where id=${job.id}`;
      save(`${commandId}-${job.id}-result.json`, result);
      console.log(JSON.stringify(result));
      const messages =
        await db`select content,metadata from company_messages where metadata->>'webActionJobId'=${job.id} and role='assistant' order by id`;
      console.log(JSON.stringify(messages, null, 2));
    }
    if (beforeReplay) {
      const afterReplay =
        await db`select (select count(*) from talent_progress) as progress,(select count(*) from company_talent_relays) as relays,(select count(*) from contact_queue) as queues,(select count(*) from company_messages) as company_messages`;
      const proof = {
        before: beforeReplay[0],
        after: afterReplay[0],
        unchanged: JSON.stringify(beforeReplay) === JSON.stringify(afterReplay),
        llmCalls: trace.filter((x) => x.endpoint).length,
      };
      save(`${commandId}-idempotency.json`, proof);
      console.log(JSON.stringify(proof));
    }
  } else if (command === "verify") {
    if (datasetVersion === "v3") {
      const cases = JSON.parse(readFileSync(path.join(task, "cases-v3.json"), "utf8")).cases;
      for (const input of cases) assert.deepEqual(sequence[input.id], contactEvaluationSteps(input), `Incomplete frozen conversation: ${input.id}`);
    }
    const positions =
      await db`select role_id,talent_id,saved_stage,processed_stage from talent_opportunity_recommendation`;
    const position = (key: string, talentId: string) =>
      positions.find(
        (r) =>
          r.role_id === fixture.roles[key].roleId && r.talent_id === talentId
      )!;
    assert.equal(
      position("product", fixture.candidateA.user_id).saved_stage,
      "closed"
    );
    assert.equal(
      position("success", fixture.candidateA.user_id).processed_stage,
      `custom:${fixture.roles.success.stageId}`
    );
    assert.equal(
      position("engineer", fixture.candidateB.user_id).saved_stage,
      "accepted"
    );
    assert.equal(
      position("engineer", fixture.candidateB.user_id).processed_stage,
      `custom:${fixture.roles.engineer.stageId}`
    );
    assert.equal(
      position("data", fixture.candidateB.user_id).saved_stage,
      "closed"
    );
    for (const key of ["gtm", "business"]) {
      assert.equal(
        position(key, fixture.candidateA.user_id).processed_stage,
        `custom:${fixture.roles[key].stageId}`
      );
    }
    assert.equal(
      Number((await db`select count(*) from meeting_schedules`)[0].count),
      0
    );
    assert.equal(
      Number((await db`select count(*) from talent_opportunity_fit`)[0].count),
      0
    );
    const relays =
      await db`select r.*,q.status from company_talent_relays r join contact_queue q on q.company_talent_relay_id=r.id where q.type='company_contact_company_delivery'`;
    assert.equal(relays.length, 6);
    assert.ok(
      relays.every(
        (r) =>
          r.status === "sent" && !r.company_talent_request_id && !r.document_id
      )
    );
    const jobs =
      await db`select status,action_context from company_agent_web_action_jobs`;
    assert.equal(jobs.length, 6);
    assert.ok(
      jobs.every((j) =>
        ["completed_message", "completed_silent"].includes(j.status)
      )
    );
    assert.ok(
      jobs
        .filter((j) =>
          [
            fixture.scenarios.UCT03.recommendationId,
          ].includes(j.action_context.recommendationId)
        )
        .every((j) => j.status === "completed_silent")
    );
    const {
      fetchRelayableCompanyTalentConnections,
      fetchActiveCompanyTalentRequest,
    } = await import("../src/lib/companyTalentRequests/server");
    const combined = await fetchRelayableCompanyTalentConnections({
      admin: admin as any,
      talentId: fixture.candidateA.user_id,
      query: "Harper GTM Operations",
    });
    assert.equal(combined.length, 1);
    assert.equal(
      combined[0].recommendationId,
      fixture.scenarios.UCT03.recommendationId
    );
    const sqlSearch = (
      await db`select read_company_talent_connections_v1(${fixture.candidateA.user_id}::uuid,'Harper GTM Operations',20) as result`
    )[0].result;
    assert.equal(sqlSearch.length, 1);
    for (const talent of [fixture.candidateA, fixture.candidateB]) {
      assert.equal(
        await fetchActiveCompanyTalentRequest({
          admin: admin as any,
          talentId: talent.user_id,
          awaitingTalentOnly: true,
        }),
        null
      );
    }
    save("verification.json", {
      passed: true,
      positions,
      deliveredContacts: relays.length,
      requestIdsRequired: false,
      fitRows: 0,
      meetings: 0,
      staleReminders: 0,
      combinedSearch: true,
      jobs,
    });
    console.log(
      "PASS: five scenario state assertions, six inline contacts, zero stale reminders, zero fits/meetings, combined search"
    );
  } else if (command === "audit") {
    const result = {
      ...(await state(fixture)),
      companyMessages:
        await db`select id,role,role_id,content,message_type,metadata from company_messages order by id`,
      candidateMessages:
        await db`select id,user_id,conversation_id,role,content from talent_messages order by id`,
      progress:
        await db`select id,kind,role_id,recommendation_id,metadata from talent_progress order by created_at`,
      tags: await db`select talent_id,opportunity_id,tag from talent_opportunity_tag`,
      roleIsolation:
        await db`select role_id,status,information from company_roles`,
      readConnections: await (
        await import("../src/lib/companyTalentRequests/server")
      ).fetchRelayableCompanyTalentConnections({
        admin: admin as any,
        talentId: fixture.candidateA.user_id,
        query: "Harper",
      }),
      staleQuestion: await (
        await import("../src/lib/companyTalentRequests/server")
      ).fetchActiveCompanyTalentRequest({
        admin: admin as any,
        talentId: fixture.candidateA.user_id,
        awaitingTalentOnly: true,
      }),
    };
    save("final-audit.json", result);
    const calls = readdirSync(runDir)
      .filter((f) => f.endsWith("-llm.json"))
      .flatMap((file) =>
        JSON.parse(readFileSync(path.join(runDir, file), "utf8"))
          .filter((r: any) => r.endpoint)
          .map((r: any, index: number) => ({
            file,
            index,
            endpoint: r.endpoint,
            model: r.request.model,
            reasoning: r.request.reasoning ?? r.request.thinking ?? null,
            outputConfig: r.request.output_config ?? null,
            temperature: r.request.temperature ?? null,
            store: r.request.store ?? null,
            promptHash: hash(JSON.stringify(r.request)),
            durationMs: r.durationMs,
            status: r.status,
            usage: r.result?.usage ?? null,
          }))
      );
    const paths = execFileSync(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "src/lib/org",
        "src/lib/companyTalentRequests",
        "src/lib/talentOnboarding",
        "src/lib/career",
        "src/lib/internalCandidateReengagement.ts",
        "supabase/migrations/20260923063625_unified_company_talent_contacts.sql",
      ],
      { cwd: root, encoding: "utf8" }
    )
      .trim()
      .split("\n")
      .filter((p) => p && !p.includes(".test."));
    save(
      "source-snapshot.json",
      paths.map((file) => ({
        file,
        sha256: hash(readFileSync(path.join(root, file), "utf8")),
        content: readFileSync(path.join(root, file), "utf8"),
      }))
    );
    save("llm-manifest.json", {
      runId,
      datasetVersion,
      calls,
      totalCalls: calls.length,
      models: [...new Set(calls.map((x: any) => x.model))],
      fixtureHash: hash(readFileSync(path.join(task, `cases-${datasetVersion}.json`), "utf8")),
      goldHash: hash(readFileSync(path.join(task, `gold-${datasetVersion}.json`), "utf8")),
      transport: "captured locally, not real inbox receipt",
      productionWrites: 0,
    });
    console.log(
      JSON.stringify({
        companyMessages: result.companyMessages.length,
        candidateMessages: result.candidateMessages.length,
        progress: result.progress.length,
        staleQuestion: result.staleQuestion?.id ?? null,
      })
    );
  } else if (command === "state") {
    await state(fixture);
  } else throw Error("Unknown command");
  if (frozenStep) {
    sequence[scenario] = [...(sequence[scenario] ?? []), command];
    save("execution-sequence.json", sequence);
  }
}
main()
  .catch((error) => {
    save(`${commandId}-error.json`, {
      message: error.message,
      stack: error.stack,
      ...error,
    });
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled(background);
    await db.end();
  });
