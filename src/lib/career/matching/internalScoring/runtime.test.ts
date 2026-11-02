import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { enqueue, control, claim, evaluateDurableStage } from "./repository";
import { executeInternalEvaluation } from "./runtime";
import { loadInputs } from "./inputs";
import { type Database, type Query, pythonTimestamp } from "./database";
import { buildRequest, parseAssessment, type Stage } from "./decisions";
import type { Row } from "./evidence";

const userId = "10000000-0000-4000-8000-000000000001",
  conversationId = "10000000-0000-4000-8000-000000000002";
const profileId = "10000000-0000-4000-8000-000000000003",
  workspaceId = "20000000-0000-4000-8000-000000000001";
const roleId = "30000000-0000-4000-8000-000000000001",
  otherRole = "30000000-0000-4000-8000-000000000002";
async function fixture(t: any) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec("SET TIME ZONE 'UTC'");
  const adapter =
    (conn: any): Query =>
    async (sql, params = []) =>
      (
        await conn.query(
          sql,
          params.map((p) =>
            Array.isArray(p)
              ? `{${p.map((v) => JSON.stringify(v)).join(",")}}`
              : p
          ),
          { parsers: { 1184: pythonTimestamp, 1700: Number, 20: Number } }
        )
      ).rows;
  const db: Database = {
    query: adapter(pg),
    transaction: (work) => pg.transaction((tx) => work(adapter(tx))),
  };
  await pg.exec(
    readFileSync("src/lib/career/matching/internalScoring/fixture.sql", "utf8")
  );
  const migration = readFileSync(
    "supabase/migrations/20261029182857_career_profile_versions_and_role_materials.sql",
    "utf8"
  );
  await pg.exec(
    migration.slice(
      migration.indexOf(
        "create function public.publish_evaluated_internal_role_v1"
      ),
      migration.indexOf("-- Internal schema uses")
    )
  );
  await db.query("INSERT INTO talent_users VALUES($1,NULL)", [userId]);
  await db.query("INSERT INTO talent_conversations VALUES($1,$2)", [
    conversationId,
    userId,
  ]);
  await db.query(
    "INSERT INTO talent_setting VALUES($1,true,'share',true,'{}')",
    [userId]
  );
  await db.query("INSERT INTO talent_profiles VALUES($1,$2)", [
    profileId,
    userId,
  ]);
  await db.query(
    "INSERT INTO talent_profile_revisions VALUES($1,2,$2::jsonb)",
    [
      profileId,
      JSON.stringify({
        talentUser: { name: "평가 후보", bio: "원본 이력", location: "서울" },
        talentExperiences: [{ description: "전체 원문" }],
      }),
    ]
  );
  await db.query(
    "INSERT INTO talent_behavior_contexts VALUES($1,'저장된 최신 요약',9)",
    [userId]
  );
  await db.query(
    "INSERT INTO talent_contexts VALUES($1,'brief','선호','전체 Search Brief',2,'B1','2026-11-01T00:01:02.123456Z','2026-11-02T00:01:02Z',NULL)",
    [userId]
  );
  await db.query(
    "INSERT INTO company_workspace(company_workspace_id,company_name) VALUES($1,'회사')",
    [workspaceId]
  );
  for (const id of [roleId, otherRole]) {
    await db.query(
      "INSERT INTO company_roles(role_id,company_workspace_id,name,source_type,status,information,salary_min) VALUES($1,$2,'FDE','internal','active','{}',70000000)",
      [id, workspaceId]
    );
    await db.query(
      "INSERT INTO company_internal_roles(role_id,request,criteria,memory) VALUES($1,'Hiring Brief 원문','[]','회사 메모 원문')",
      [id]
    );
  }
  const payload = {
    roleIds: [roleId],
    profileId,
    profileRevision: 2,
    publishRecommendation: true,
    parentReplyId: "reply",
    sourceEvents: [],
  };
  const start = (operationId = "op", extra: Row = {}) =>
    enqueue(db, {
      userId,
      conversationId,
      operationId,
      payload: { ...payload, ...extra },
    });
  const row = async (id: string) =>
    (
      await db.query("SELECT * FROM opportunity_discovery_run WHERE id=$1", [
        id,
      ])
    )[0];
  return { db, start, row, payload };
}
function score(source: Row, stage: Stage, exclude = false) {
  const req = buildRequest(stage, "source", source.role.criteria);
  return Promise.resolve({
    assessment: parseAssessment(
      stage,
      {
        answers: req.questions.map((q) =>
          q.type === "choice"
            ? {
                name: q.name,
                type: "choice",
                choice: exclude ? "exclude" : "continue",
              }
            : {
                name: q.name,
                type: "score",
                score: 2,
                probabilities: [0, 1, 2, 3, 4].map((value) => ({
                  value,
                  probability: 0.2,
                })),
              }
        ),
      },
      source.role.criteria
    ),
  });
}
test("beta owns request atomically; real publication produces only requested internal role and private evidence", async (t) => {
  const { db, start, row, payload } = await fixture(t);
  const run = await start();
  assert.equal((await start()).id, run.id);
  assert.equal(run.status, "handed_off");
  assert.equal(
    (
      await db.query(
        "SELECT id FROM opportunity_discovery_run WHERE status IN ('queued','running')"
      )
    ).length,
    0
  );
  const loaded = await loadInputs(db.query, userId, payload);
  assert.equal(loaded.sources[0].source.behaviorContext, "저장된 최신 요약");
  assert.equal(loaded.sources[0].source.behaviorContextVersion, 9);
  assert.equal(
    loaded.sources[0].source.profile.experiences[0].description,
    "전체 원문"
  );
  assert.equal(
    loaded.sources[0].source.searchBrief[0].created_at,
    "2026-11-01T00:01:02.123456+00:00"
  );
  const stages: number[] = [];
  let notified = 0;
  await executeInternalEvaluation(run.id, {
    db,
    score: async (source, stage) => {
      stages.push(stage);
      return score(source, stage, true);
    },
    notify: async (_db, done) => {
      assert.equal(done.status, "completed", done.error_message);
      notified++;
    },
  });
  assert.deepEqual(stages, [1, 2]); // Explicit apply still evaluates stage 2 after exclusion.
  const done = await row(run.id);
  assert.equal(done.coverage.evaluationIds.length, 2);
  assert.equal(notified, 1);
  const recommendations = await db.query(
    "SELECT * FROM talent_opportunity_recommendation"
  );
  assert.deepEqual(
    recommendations.map((r) => r.role_id),
    [roleId]
  );
  assert.equal(
    (await db.query("SELECT * FROM talent_progress"))[0].open_to_company,
    false
  );
  await executeInternalEvaluation((await start("again")).id, {
    db,
    score: () => {
      throw new Error("must reuse");
    },
    notify: async () => {},
  });
  assert.equal(
    (await db.query("SELECT * FROM company_role_candidate_evaluations")).length,
    2
  );
  assert.equal(
    (await db.query("SELECT * FROM talent_opportunity_recommendation")).length,
    1
  );
});
test("failed second stage resumes with frozen Behavior and reuses durable first-stage evidence", async (t) => {
  const { db, start, row } = await fixture(t);
  const run = await start();
  await executeInternalEvaluation(run.id, {
    db,
    score: (s, stage) =>
      stage === 2
        ? Promise.reject(new Error("provider down"))
        : score(s, stage),
    notify: async () => {},
  });
  assert.equal((await row(run.id)).status, "partial");
  assert.equal((await row(run.id)).coverage.evaluationIds.length, 1);
  await db.query(
    "UPDATE talent_behavior_contexts SET context_text='더 새로운 요약',context_version=10"
  );
  await control(db, userId, run.id, "resume");
  const stages: number[] = [];
  await executeInternalEvaluation(run.id, {
    db,
    score: (s, stage) => {
      assert.equal(s.behaviorContextVersion, 9);
      stages.push(stage);
      return score(s, stage);
    },
    notify: async () => {},
  });
  assert.deepEqual(stages, [2]);
  assert.equal((await row(run.id)).status, "completed");
});
test("ordinary screen exclusion stops stage two; test-only/blocked roles never reach scoring", async (t) => {
  const { db, start, row } = await fixture(t);
  const stages: number[] = [];
  const run = await start("screen", { publishRecommendation: false });
  await executeInternalEvaluation(run.id, {
    db,
    score: (s, stage) => {
      stages.push(stage);
      return score(s, stage, true);
    },
    notify: async () => {},
  });
  assert.deepEqual(stages, [1]);
  assert.equal((await row(run.id)).status, "completed");
  await db.query(
    "UPDATE company_roles SET information='{\"testOnly\":true}' WHERE role_id=$1",
    [otherRole]
  );
  const isolated = await start("isolation", { roleIds: [otherRole] });
  await executeInternalEvaluation(isolated.id, {
    db,
    score: () => {
      throw new Error("must not score");
    },
    notify: async () => {},
  });
  assert.deepEqual((await row(isolated.id)).coverage.unavailableRoleIds, [
    otherRole,
  ]);
  await db.query("UPDATE company_roles SET status='paused' WHERE role_id=$1", [
    roleId,
  ]);
  const paused = await start("paused");
  await executeInternalEvaluation(paused.id, {
    db,
    score: () => {
      throw new Error("must not score");
    },
    notify: async () => {},
  });
  assert.deepEqual((await row(paused.id)).coverage.unavailableRoleIds, [
    roleId,
  ]);
  await db.query("UPDATE company_roles SET status='active' WHERE role_id=$1", [
    roleId,
  ]);
  await db.query("UPDATE talent_setting SET blocked_companies=ARRAY['회사']");
  const blocked = await start("blocked");
  await executeInternalEvaluation(blocked.id, {
    db,
    score: () => {
      throw new Error("must not score");
    },
    notify: async () => {},
  });
  assert.deepEqual((await row(blocked.id)).coverage.unavailableRoleIds, [
    roleId,
  ]);
  assert.equal(
    (await db.query("SELECT * FROM talent_opportunity_recommendation")).length,
    0
  );
});
test("cancel/lease takeover rejects obsolete scoring owners and foreign profiles", async (t) => {
  const { db, start, payload } = await fixture(t);
  const run = await start();
  const claimed = await claim(db, run.id);
  assert.ok(claimed);
  assert.equal(await claim(db, run.id), undefined);
  const input = (await loadInputs(db.query, userId, payload)).sources[0];
  await control(db, userId, run.id, "cancel");
  await assert.rejects(
    () =>
      evaluateDurableStage(db, claimed!, input, 1, () => {
        throw new Error("must not score");
      }),
    /lease changed/
  );
  await assert.rejects(
    () => start("foreign", { profileId: otherRole }),
    /Profile revision unavailable/
  );
  await assert.rejects(
    () => control(db, otherRole, run.id, "resume"),
    /not owned/
  );
});
