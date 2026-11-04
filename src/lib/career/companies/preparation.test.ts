import test from "node:test";
import assert from "node:assert/strict";
import { followDatabase, followAdmin, id } from "./preparation.testSupport";
import { readFollowInventory } from "./inventory";
import {
  prepareFollowedCompanies,
  rolesNeedingEvaluation,
  formatFollowOverview,
  formatFollowRoles,
  readPreparedFollowContext,
} from "./preparation";
import { CAREER_COMPANY_TOOLS } from "./tools";

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const db = await followDatabase();
  t.after(() => db.close());
  return { db, admin: followAdmin(db) };
}
test("exact company/workspace scope, consent, blocked/closed/test roles and ownership are enforced in SQL", async (t) => {
  const { db, admin } = await fixture(t);
  let inventory = await readFollowInventory(admin, id(1));
  assert.deepEqual(
    inventory.roles.map((r) => r.id),
    [id(30), id(31)]
  );
  await db.exec(
    `update talent_company_follow set scope='workspace',company_workspace_id='${id(10)}' where talent_id='${id(1)}'`
  );
  assert.deepEqual(
    (await readFollowInventory(admin, id(1))).roles.map((r) => r.id),
    [id(30)]
  );
  await db.exec(
    `update company_roles set information='{"testOnly":true}' where role_id='${id(30)}'`
  );
  assert.equal((await readFollowInventory(admin, id(1))).roles.length, 0);
  await db.exec(
    `update company_roles set information='{}',expires_at=now()-interval '1 day' where role_id='${id(30)}'`
  );
  assert.equal((await readFollowInventory(admin, id(1))).roles.length, 0);
  await db.exec(
    `update company_roles set expires_at=null;update talent_setting set get_external_recommendation=false where user_id='${id(1)}'`
  );
  assert.equal((await readFollowInventory(admin, id(1))).roles.length, 0);
  await db.exec(
    `update talent_setting set get_external_recommendation=true,blocked_companies=ARRAY['Atlas Seoul'] where user_id='${id(1)}'`
  );
  assert.equal((await readFollowInventory(admin, id(1))).companies.length, 0);
  assert.equal((await readFollowInventory(admin, id(2))).roles.length, 2);
  await db.exec(
    `update talent_company_follow set unfollowed_at=now() where talent_id='${id(2)}'`
  );
  assert.equal((await readFollowInventory(admin, id(2))).roles.length, 0);
});
test("saved positive and negative assessments are reused regardless of age; only unseen roles cost evaluations", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `insert into talent_external_evaluations values('${id(50)}','${id(1)}','${id(30)}',null,'{"fit":{"mutualFit":4}}','2025-01-01')`
  );
  const inventory = await readFollowInventory(admin, id(1));
  assert.deepEqual(rolesNeedingEvaluation(inventory, "external"), [id(31)]);
  assert.equal(inventory.roles[0].evaluation?.assessment.fit.mutualFit, 4);
  assert.deepEqual(
    rolesNeedingEvaluation(await readFollowInventory(admin, id(2)), "external"),
    [id(30), id(31)]
  );
  await db.exec(
    `insert into talent_opportunity_recommendation values(1,'${id(1)}','${id(31)}')`
  );
  assert.deepEqual(
    rolesNeedingEvaluation(await readFollowInventory(admin, id(1)), "external"),
    []
  );
});
test("preparation waits on existing jobs, survives retries, and never creates another contact occurrence", async (t) => {
  const { db, admin } = await fixture(t);
  const readRun = async (n = 40) =>
    (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [id(n)]
      )
    ).rows[0];
  let calls = 0;
  const deps = {
    inventory: readFollowInventory,
    external: async (args: any) => {
      calls++;
      assert.deepEqual(args.roleIds, [id(30), id(31)]);
      assert.equal(args.preparationRunId, id(40));
      await db.exec(
        `insert into external_recommendation_runs values('${id(60)}','${id(1)}','queued',null)`
      );
      return { runId: id(60) };
    },
    internal: async () => {
      throw new Error("Unexpected internal queue");
    },
  } as any;
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await readRun() }, deps))
      .ready,
    false
  );
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await readRun() }, deps))
      .ready,
    false
  );
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await readRun(41) }, deps))
      .ready,
    false
  );
  assert.equal(calls, 1);
  await db.exec(
    `update external_recommendation_runs set status='completed';insert into talent_external_evaluations values('${id(50)}','${id(1)}','${id(30)}','${id(60)}','{"fit":{"mutualFit":80}}',now()),('${id(51)}','${id(1)}','${id(31)}','${id(60)}','{"fit":{"mutualFit":3}}',now())`
  );
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await readRun() }, deps))
      .ready,
    true
  );
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await readRun(41) }, deps))
      .ready,
    true
  );
  assert.equal(calls, 1);
  assert.equal(
    (await db.query<any>("select count(*) n from opportunity_discovery_run"))
      .rows[0].n,
    2
  );
  assert.match(await readPreparedFollowContext(admin, id(1)), /mutualFit: 80/);
});
test("all followed roles beyond SQL/LLM index page limits are evaluated; read tool pages without new work", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `insert into company_roles(role_id,company_workspace_id,name) select md5(n::text)::uuid,'${id(10)}','Role '||n from generate_series(1000,1600) n`
  );
  const inventory = await readFollowInventory(admin, id(1));
  assert.equal(inventory.roles.length, 603);
  assert.equal(rolesNeedingEvaluation(inventory, "external").length, 603);
  const text = formatFollowOverview(inventory);
  assert.match(text, /603 currently available/);
  assert.ok(text.length < 7000);
  const result = (await CAREER_COMPANY_TOOLS.follow_company.execute!(
    { action: "read", follow_id: id(20), offset: 30 },
    { admin, userId: id(1) } as any
  )) as any;
  assert.equal(result.roles.length, 30);
  assert.equal(result.nextOffset, 60);
  assert.match(result.modelOutput, /More roles:/);
  await assert.rejects(
    () =>
      CAREER_COMPANY_TOOLS.follow_company.execute!(
        { action: "read", follow_id: id(20) },
        { admin, userId: id(2) } as any
      ),
    /unavailable/
  );
});
test("internal roles reuse their completed stages and respect contact visibility", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `update company_roles set source_type='internal' where role_id='${id(30)}';insert into company_role_candidate_evaluations values('${id(50)}','${id(1)}','${id(30)}','${id(60)}','{"proceedToStage2":false}',1,now())`
  );
  let inventory = await readFollowInventory(admin, id(1));
  assert.deepEqual(rolesNeedingEvaluation(inventory, "internal"), []);
  assert.equal(inventory.roles[0].evaluation?.stage, 1);
  await db.exec(
    `update talent_setting set profile_visibility='dont_share' where user_id='${id(1)}'`
  );
  inventory = await readFollowInventory(admin, id(1));
  assert.equal(
    inventory.roles.some((r) => r.source === "internal"),
    false
  );
});
test("migration RPCs deny client roles and reject stale preparation owners", async (t) => {
  const { db, admin } = await fixture(t);
  const denied = (
    await db.query<any>(
      `select has_table_privilege('authenticated','company_hiring_search_cache','select') t,has_function_privilege('anon','claim_company_hiring_search(text,uuid)','execute') f`
    )
  ).rows[0];
  assert.deepEqual(denied, { t: false, f: false });
  assert.equal(
    (
      await admin.rpc("claim_career_follow_preparation", {
        p_run: id(40),
        p_token: id(70),
      })
    ).data,
    true
  );
  assert.equal(
    (
      await admin.rpc("save_career_follow_preparation", {
        p_run: id(40),
        p_token: id(71),
        p_patch: { status: "ready" },
      })
    ).data,
    false
  );
  assert.equal(
    (
      await admin.rpc("save_career_follow_preparation", {
        p_run: id(40),
        p_token: id(70),
        p_patch: { status: "ready" },
      })
    ).data,
    true
  );
});

test("unrelated reminders do not prepare followed companies; explicit developer runs do", async (t) => {
  const { db, admin } = await fixture(t);
  await db.query(
    "update opportunity_discovery_run set trigger_payload=$1 where id=$2",
    [
      JSON.stringify({
        runContract: "career_agent_v1",
        sourceEvents: [{ sourceKind: "schedule", scheduleKey: null }],
      }),
      id(40),
    ]
  );
  const read = async () =>
    (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [id(40)]
      )
    ).rows[0];
  let calls = 0;
  const deps = {
    inventory: async () => {
      calls++;
      return { companies: [], roles: [] };
    },
    external: async () => {
      throw Error("unexpected");
    },
    internal: async () => {
      throw Error("unexpected");
    },
  } as any;
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await read() }, deps)).ready,
    true
  );
  assert.equal(calls, 0);
  await db.query(
    "update opportunity_discovery_run set trigger_payload=$1 where id=$2",
    [
      JSON.stringify({
        runContract: "career_agent_v1",
        createdBy: "career_dev_controls",
      }),
      id(40),
    ]
  );
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await read() }, deps)).ready,
    true
  );
  assert.equal(calls, 1);
});

test("stopped external subscription and workspace ID blocks exclude automatic paid work", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `update talent_setting set status='stopped' where user_id='${id(1)}'`
  );
  assert.equal((await readFollowInventory(admin, id(1))).roles.length, 0);
  await db.exec(
    `update talent_setting set status='active',blocked_companies=ARRAY['${id(10)}'] where user_id='${id(1)}'`
  );
  assert.deepEqual(
    (await readFollowInventory(admin, id(1))).roles.map((role) => role.id),
    [id(31)]
  );
});

test("a later enqueue failure cannot release a still-running paid evaluation", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `update company_roles set source_type='internal' where role_id='${id(31)}'`
  );
  const run = (
    await db.query<any>("select * from opportunity_discovery_run where id=$1", [
      id(40),
    ])
  ).rows[0];
  const result = await prepareFollowedCompanies({ admin, run }, {
    inventory: readFollowInventory,
    external: async () => {
      await db.exec(
        `insert into external_recommendation_runs values('${id(60)}','${id(1)}','queued',null)`
      );
      return { runId: id(60) };
    },
    internal: async () => {
      throw Error("Internal queue unavailable");
    },
  } as any);
  assert.equal(result.ready, false);
  assert.equal(result.state.externalRunId, id(60));
  assert.match(result.state.error!, /Internal queue/);
  assert.equal(
    (
      await admin.rpc("claim_career_follow_preparation", {
        p_run: id(41),
        p_token: id(70),
      })
    ).data,
    false
  );
});

test("a lost enqueue response recovers the durable child before releasing the parent", async (t) => {
  const { db, admin } = await fixture(t);
  const read = async () =>
    (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [id(40)]
      )
    ).rows[0];
  let enqueues = 0;
  const deps = {
    inventory: readFollowInventory,
    external: async (args: any) => {
      enqueues++;
      await db.query(
        "insert into external_recommendation_runs(id,talent_id,status,operation_id) values($1,$2,$3,$4)",
        [id(60), id(1), "running", args.operationId]
      );
      throw Error("Queue accepted the request but transport response was lost");
    },
    internal: async () => {
      throw Error("Unexpected internal queue");
    },
  } as any;
  const result = await prepareFollowedCompanies(
    { admin, run: await read() },
    deps
  );
  assert.equal(
    result.ready,
    false,
    "The parent must wait for an already-running paid evaluation"
  );
  assert.equal(result.state.externalRunId, id(60));
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await read() }, deps)).ready,
    false
  );
  assert.equal(enqueues, 1);
  await db.exec(`update external_recommendation_runs set status='completed'`);
  const complete = await prepareFollowedCompanies(
    { admin, run: await read() },
    deps
  );
  assert.equal(complete.ready, true);
  assert.equal(
    complete.state.error,
    null,
    "Recovered transport uncertainty must not be presented as a current failure"
  );
});

test("recovery after the first child was committed still enqueues the missing source exactly once", async (t) => {
  const { db, admin } = await fixture(t);
  await db.exec(
    `update company_roles set source_type='internal' where role_id='${id(31)}'`
  );
  await db.query(
    "insert into external_recommendation_runs(id,talent_id,status,operation_id) values($1,$2,$3,$4)",
    [id(60), id(1), "running", `follow-preparation:${id(40)}:external`]
  );
  const read = async () =>
    (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [id(40)]
      )
    ).rows[0];
  let internalCalls = 0;
  const deps = {
    inventory: readFollowInventory,
    external: async () => {
      throw Error("Existing external evaluation must not be started again");
    },
    internal: async (args: any) => {
      internalCalls++;
      assert.deepEqual(args.roleIds, [id(31)]);
      await db.query(
        "insert into opportunity_discovery_run(id,talent_id,status,dedupe_key) values($1,$2,$3,$4)",
        [
          id(61),
          id(1),
          "running",
          `career-internal:${id(1)}:${args.operationId}`,
        ]
      );
      return { runId: id(61) };
    },
  } as any;
  const result = await prepareFollowedCompanies(
    { admin, run: await read() },
    deps
  );
  assert.equal(result.ready, false);
  assert.equal(result.state.externalRunId, id(60));
  assert.equal(result.state.internalRunId, id(61));
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await read() }, deps)).ready,
    false
  );
  assert.equal(internalCalls, 1);
  await db.query(
    "update external_recommendation_runs set status=$1 where id=$2",
    ["completed", id(60)]
  );
  await db.query("update opportunity_discovery_run set status=$1 where id=$2", [
    "completed",
    id(61),
  ]);
  assert.equal(
    (await prepareFollowedCompanies({ admin, run: await read() }, deps)).ready,
    true
  );
  assert.equal(internalCalls, 1);
});


test("internal follow context omits every scoring identifier and outcome", async t => {
  const {db,admin}=await fixture(t);
  await db.exec(`update company_roles set source_type='internal' where role_id='${id(30)}';
    insert into company_role_candidate_evaluations values('${id(70)}','${id(1)}','${id(30)}','${id(71)}','{"fit":{"mutualFit":3},"proceedToStage2":false,"reason":"PRIVATE_SCORING"}',1,now());`);
  const result=await CAREER_COMPANY_TOOLS.follow_company.execute!({action:"read",follow_id:id(20)}, {admin,userId:id(1)} as any) as any;
  assert.match(result.modelOutput,/Platform engineer/);
  const internalOnly = formatFollowRoles((await readFollowInventory(admin,id(1))).roles.filter(r=>r.source === "internal"));
  assert.match(internalOnly,/Platform engineer/);
  assert.doesNotMatch(internalOnly,/evaluat|assess|PRIVATE_SCORING|mutualFit/i);
  assert.doesNotMatch(result.modelOutput,new RegExp(`PRIVATE_SCORING|${id(70)}|${id(71)}|proceedToStage2|mutualFit: 3`));
});


test("a transient inventory failure remains retryable and its error is available in context", async (t) => {
  const { db, admin } = await fixture(t);
  const readRun = async () => (await db.query<any>("select * from opportunity_discovery_run where id=$1", [id(40)])).rows[0];
  let fail = true;
  const deps = {
    inventory: async () => {
      if (fail) throw new Error("Follow inventory unavailable");
      return { companies: [], roles: [] };
    },
    external: async () => { throw new Error("Unexpected evaluation"); },
    internal: async () => { throw new Error("Unexpected evaluation"); },
  };
  const failed = await prepareFollowedCompanies({ admin, run: await readRun() }, deps);
  assert.equal(failed.ready, false);
  assert.equal(failed.state.status, "waiting");
  assert.match(await readPreparedFollowContext(admin, id(1), failed.state), /preparation incomplete: Follow inventory unavailable/);
  fail = false;
  const recovered = await prepareFollowedCompanies({ admin, run: await readRun() }, deps);
  assert.equal(recovered.ready, true);
  assert.equal(recovered.state.error, null);
});
