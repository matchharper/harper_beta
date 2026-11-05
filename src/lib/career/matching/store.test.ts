import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { formatCareerMatchingResult } from "./formatters";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create table talent_users(user_id uuid primary key,deleted_at timestamptz);
 create table talent_setting(user_id uuid primary key,blocked_companies text[]);
 create table talent_conversations(id uuid primary key,user_id uuid);
 create table company_workspace(company_workspace_id uuid primary key,company_name text,external_roles_enabled boolean);
 create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb,name text);
 create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,kind text,opportunity_type text,rank integer,fit_summary text,fit_reasons jsonb,tradeoffs jsonb,evidence jsonb,feedback text,saved_stage text,shared_material_id uuid,created_at timestamptz default now());
 create table external_recommendation_runs(id uuid primary key default gen_random_uuid(),talent_id uuid,variant text,status text,lease_token uuid,lease_expires_at timestamptz,attempts int default 0,created_at timestamptz default now());
 create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,status text,dedupe_key text unique,trigger_payload jsonb,lease_token uuid,lease_heartbeat_at timestamptz,error_message text,completed_at timestamptz);
 create table talent_profiles(id uuid primary key,talent_id uuid);
 create table talent_profile_revisions(profile_id uuid,revision bigint);
 create table talent_role_materials(id uuid primary key,profile_id uuid,profile_revision bigint);
 create table company_role_candidate_evaluations(id uuid primary key,talent_id uuid,role_id uuid);
 create table company_intro_candidates(talent_id uuid,role_id uuid,recommendation_id uuid);
 create function publish_evaluated_internal_role_v1(uuid,uuid,uuid[],uuid,text) returns jsonb language sql as 'select null::jsonb';
 create view talent_effective_opportunity_recommendations_v1 as select * from talent_opportunity_recommendation;`);
  const historyMigration = await readFile(
    new URL(
      "../../../../supabase/migrations/20260928045449_company_first_score_reuse_and_recommendation_history.sql",
      import.meta.url
    ),
    "utf8"
  );
  const currentFunctionStart = historyMigration.indexOf(
    "create or replace function public.current_talent_recommendation_id_v1"
  );
  await db.exec(
    historyMigration.slice(
      currentFunctionStart,
      historyMigration.indexOf(
        "revoke all on function public.current_talent_recommendation_id_v1",
        currentFunctionStart
      )
    )
  );
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261029183004_career_matching_workspaces.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  await db.exec("create function public.read_career_internal_role_v1(uuid,uuid) returns jsonb language sql as 'select jsonb_build_object(''roleId'',$2)';");
  await db.exec(await readFile("supabase/migrations/20261104062544_career_internal_opportunity_publication.sql", "utf8"));
  await db.query("insert into talent_users values($1,null)", [id(1)]);
  await db.query("insert into company_workspace values($1,$2,true)", [
    id(2),
    "Synthetic",
  ]);
  await db.query(
    "insert into company_roles values($1,$2,'external','active',false,null,'{}','Engineer')",
    [id(3), id(2)]
  );
  return db;
}

async function revision(
  db: PGlite,
  matchingId: string | null = null,
  allLists = false
) {
  return (
    await db.query<{ value: string }>(
      "select career_opportunity_list_revision($1,$2,$3) value",
      [id(1), matchingId, allLists]
    )
  ).rows[0].value;
}
async function writeList(
  db: PGlite,
  operation: string,
  command: any,
  userId = id(1)
) {
  return (
    await db.query<{ value: any }>(
      "select write_career_opportunities($1,$2,$3) value",
      [userId, operation, command]
    )
  ).rows[0].value;
}
test("empty reset invalidates a search snapshot and repeated operation returns the exact receipt", async () => {
  const db = await database();
  try {
    const before = await revision(db);
    const command = { action: "reset", expectedRevision: before };
    const reset = await writeList(db, "empty-reset", command);
    assert.notEqual(reset.listRevision, before);
    assert.equal(reset.listRevision, await revision(db));
    assert.deepEqual(await writeList(db, "empty-reset", command), reset);
    await assert.rejects(
      writeList(db, "late-search", {
        action: "add",
        expectedRevision: before,
        items: [],
      }),
      /List changed/
    );
    await assert.rejects(
      writeList(db, "empty-reset", { ...command, allLists: true }),
      /Operation identity/
    );
    const again = await writeList(db, "reset-again", {
      action: "reset",
      expectedRevision: reset.listRevision,
    });
    assert.notEqual(again.listRevision, reset.listRevision);
  } finally {
    await db.close();
  }
});
test("metadata update cannot create membership or restore an archived recommendation", async () => {
  const db = await database();
  try {
    await db.query(
      "insert into talent_opportunity_recommendation(id,talent_id,role_id,kind,feedback,saved_stage) values($1,$2,$3,'career_agent','dislike','closed')",
      [id(6), id(1), id(3)]
    );
    await assert.rejects(
      writeList(db, "absent-update", {
        action: "update",
        items: [{ recommendationId: id(6), explanation: "new wording" }],
      }),
      /Membership unavailable/
    );
    await writeList(db, "archive", {
      action: "archive",
      items: [{ recommendationId: id(6) }],
    });
    const archived = (
      await db.query<any>("select * from talent_opportunity_memberships")
    ).rows[0];
    await writeList(db, "archived-update", {
      action: "update",
      items: [
        { recommendationId: id(6), explanation: "useful reason", rank: 2 },
      ],
    });
    const updated = (
      await db.query<any>("select * from talent_opportunity_memberships")
    ).rows[0];
    assert.equal(updated.id, archived.id);
    assert.deepEqual(updated.archived_at, archived.archived_at);
    assert.equal(updated.explanation, "useful reason");
    assert.equal(updated.rank, 2);
    assert.deepEqual(
      (
        await db.query(
          "select feedback,saved_stage from talent_opportunity_recommendation"
        )
      ).rows,
      [{ feedback: "dislike", saved_stage: "closed" }]
    );
  } finally {
    await db.close();
  }
});
test("criteria stay frozen across rename/archive/restore; continuation and list resets remain scoped", async () => {
  const db = await database();
  try {
    const match = async (op: string, command: any, owner = id(1)) =>
      (
        await db.query<any>("select write_career_matching($1,$2,$3) value", [
          owner,
          op,
          command,
        ])
      ).rows[0].value;
    const first = await match("first", {
      action: "create",
      title: "Backend",
      criteria: { brief: [{ label: "Location", content: "Seoul" }] },
    });
    const renamed = await match("rename", {
      action: "update",
      matchingId: first.id,
      expectedRevision: 1,
      title: "Seoul backend",
    });
    assert.deepEqual(renamed.criteria, first.criteria);
    const archived = await match("archive-match", {
      action: "archive",
      matchingId: first.id,
      expectedRevision: renamed.revision,
    });
    assert.ok(archived.archived_at);
    const restored = await match("restore-match", {
      action: "restore",
      matchingId: first.id,
      expectedRevision: archived.revision,
    });
    assert.equal(restored.archived_at, null);
    assert.deepEqual(restored.criteria, first.criteria);
    const second = await match("new-criteria", {
      action: "create",
      title: "Remote backend",
      previousMatchingId: first.id,
      criteria: { brief: [{ label: "Location", content: "Remote" }] },
    });
    assert.notEqual(second.id, first.id);
    assert.equal(second.previous_matching_id, first.id);
    assert.notDeepEqual(second.criteria, first.criteria);
    await db.query(
      "insert into talent_opportunity_recommendation(id,talent_id,role_id,kind,feedback,saved_stage) values($1,$2,$3,'career_agent','like','connected')",
      [id(6), id(1), id(3)]
    );
    for (const [index, matching] of [first, second].entries()) {
      await writeList(db, `add-${index}`, {
        action: "add",
        matchingId: matching.id,
        expectedRevision: await revision(db, matching.id),
        items: [{ recommendationId: id(6) }],
      });
    }
    const secondBefore = await revision(db, second.id);
    await writeList(db, "reset-first", {
      action: "reset",
      matchingId: first.id,
      expectedRevision: await revision(db, first.id),
    });
    assert.equal(await revision(db, second.id), secondBefore);
    assert.equal(
      (
        await db.query<any>(
          "select list_position from talent_effective_opportunity_recommendations_v1"
        )
      ).rows[0].list_position,
      "current"
    );
    await writeList(db, "reset-all", {
      action: "reset",
      allLists: true,
      expectedRevision: await revision(db, null, true),
    });
    assert.notEqual(await revision(db, second.id), secondBefore);
    assert.equal(
      (
        await db.query<any>(
          "select list_position from talent_effective_opportunity_recommendations_v1"
        )
      ).rows[0].list_position,
      "previous"
    );
    await writeList(db, "restore-second", {
      action: "restore",
      matchingId: second.id,
      expectedRevision: await revision(db, second.id),
      items: [{ recommendationId: id(6) }],
    });
    const emptyReplacement = await writeList(db, "empty-replacement", {
      action: "replace",
      matchingId: second.id,
      expectedRevision: await revision(db, second.id),
      items: [],
    });
    const afterEmpty = await writeList(db, "empty-replacement-again", {
      action: "replace",
      matchingId: second.id,
      expectedRevision: emptyReplacement.listRevision,
      items: [],
    });
    assert.notEqual(emptyReplacement.listRevision, afterEmpty.listRevision);
    assert.deepEqual(
      (
        await db.query(
          "select feedback,saved_stage from talent_opportunity_recommendation"
        )
      ).rows,
      [{ feedback: "like", saved_stage: "connected" }]
    );
    await db.query("insert into talent_users values($1,null)", [id(20)]);
    await assert.rejects(
      match(
        "foreign-previous",
        {
          action: "create",
          title: "Private",
          criteria: {},
          previousMatchingId: first.id,
        },
        id(20)
      ),
      /Previous matching unavailable/
    );
    await assert.rejects(
      writeList(
        db,
        "foreign-list",
        {
          action: "reset",
          matchingId: first.id,
          expectedRevision: await revision(db, first.id),
        },
        id(20)
      ),
      /Matching unavailable/
    );
  } finally {
    await db.close();
  }
});
test("publication rejects foreign evaluation and changed availability; failed replace rolls back", async () => {
  const db = await database();
  try {
    await db.query("insert into talent_users values($1,null)", [id(20)]);
    await db.query(
      "insert into talent_external_evaluations(id,talent_id,role_id,input_fingerprint,assessment,input_snapshot) values($1,$2,$3,'foreign','{}','{}'),($4,$5,$3,'own','{}','{}')",
      [id(21), id(20), id(3), id(4), id(1)]
    );
    const command = {
      action: "add",
      expectedRevision: await revision(db),
      items: [{ roleId: id(3), evaluationId: id(21) }],
    };
    await assert.rejects(
      writeList(db, "foreign-evaluation", command),
      /Evaluation reference unavailable/
    );
    await db.query(
      "update company_roles set is_expired=true where role_id=$1",
      [id(3)]
    );
    await assert.rejects(
      writeList(db, "expired", {
        ...command,
        items: [{ roleId: id(3), evaluationId: id(4) }],
      }),
      /Role is unavailable/
    );
    await db.query(
      "update company_roles set is_expired=false where role_id=$1",
      [id(3)]
    );
    await db.query("insert into talent_setting values($1,$2)", [
      id(1),
      [id(2)],
    ]);
    await assert.rejects(
      writeList(db, "blocked", {
        ...command,
        items: [{ roleId: id(3), evaluationId: id(4) }],
      }),
      /Company is blocked/
    );
    await db.query("delete from talent_setting");
    const added = await writeList(db, "valid", {
      ...command,
      items: [{ roleId: id(3), evaluationId: id(4) }],
    });
    await assert.rejects(
      writeList(db, "failed-replace", {
        action: "replace",
        expectedRevision: added.listRevision,
        items: [
          {
            recommendationId: added.recommendationIds[0],
            explanation: "would change",
          },
          { roleId: id(999), evaluationId: id(4) },
        ],
      })
    );
    assert.equal(await revision(db), added.listRevision);
    assert.equal(
      (
        await db.query<any>(
          "select explanation from talent_opportunity_memberships"
        )
      ).rows[0].explanation,
      ""
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from talent_matching_operations where operation_id='failed-replace'"
        )
      ).rows[0].n,
      0
    );
  } finally {
    await db.close();
  }
});
test("internal evaluation cancellation and resume keep the same owner and durable evidence", async () => {
  const db = await database();
  try {
    await db.query(
      "alter table opportunity_discovery_run add column coverage jsonb default '{}'"
    );
    await db.query("insert into talent_users values($1,null)", [id(20)]);
    await db.query("insert into talent_conversations values($1,$2),($3,$4)", [
      id(8),
      id(1),
      id(28),
      id(20),
    ]);
    await db.query("insert into talent_profiles values($1,$2),($3,$4)", [
      id(9),
      id(1),
      id(29),
      id(20),
    ]);
    await db.query("insert into talent_profile_revisions values($1,2),($2,3)", [
      id(9),
      id(29),
    ]);
    const enqueue = async (
      op: string,
      conversation: string,
      profile: string,
      version: number
    ) =>
      (
        await db.query<any>(
          "select enqueue_career_internal_evaluation($1,$2,$3,$4) value",
          [
            id(1),
            conversation,
            op,
            { profileId: profile, profileRevision: version, roleIds: [id(3)] },
          ]
        )
      ).rows[0].value;
    await assert.rejects(
      enqueue("wrong-conversation", id(28), id(9), 2),
      /Conversation unavailable/
    );
    await assert.rejects(
      enqueue("wrong-profile", id(8), id(29), 3),
      /Profile revision unavailable/
    );
    await assert.rejects(
      enqueue("missing-revision", id(8), id(9), 1),
      /Profile revision unavailable/
    );
    const run = await enqueue("valid", id(8), id(9), 2);
    assert.equal((await enqueue("valid", id(8), id(9), 2)).id, run.id);
    const control = async (action: string, owner = id(1)) =>
      (
        await db.query<any>(
          "select control_career_internal_evaluation($1,$2,$3) value",
          [owner, run.id, action]
        )
      ).rows[0].value;
    await assert.rejects(control("cancel", id(20)));
    assert.equal((await control("cancel")).status, "cancelled");
    assert.equal((await control("resume")).id, run.id);
    await db.query(
      "update opportunity_discovery_run set status='running',lease_token=$1,coverage=$2 where id=$3",
      [id(30), { evaluationIds: [id(31)] }, run.id]
    );
    const cancelled = await control("cancel");
    assert.equal(cancelled.status, "running");
    assert.equal(cancelled.trigger_payload.cancelRequested, true);
    assert.equal((await control("resume")).lease_token, id(30));
    await db.query(
      "update opportunity_discovery_run set status='partial' where id=$1",
      [run.id]
    );
    const resumed = await control("resume");
    assert.equal(resumed.status, "queued");
    assert.equal(resumed.lease_token, null);
    assert.equal(resumed.trigger_payload.cancelRequested, undefined);
    assert.deepEqual(resumed.coverage.evaluationIds, [id(31)]);
  } finally {
    await db.close();
  }
});
test("external claim waits for prepared context, fences duplicate leases and respects cancellation", async () => {
  const db = await database();
  try {
    await db.query(
      "insert into external_recommendation_runs(id,talent_id,variant,status) values($1,$2,'career_agent','queued')",
      [id(10), id(1)]
    );
    const claim = async (token: string) =>
      (
        await db.query<any>(
          "select claim_career_external_search($1,$2) value",
          [id(10), token]
        )
      ).rows[0].value;
    assert.equal(await claim(id(11)), null);
    await db.query(
      "update external_recommendation_runs set context_ready_at=now() where id=$1",
      [id(10)]
    );
    assert.equal((await claim(id(11))).lease_token, id(11));
    assert.equal(await claim(id(12)), null);
    await db.query(
      "update external_recommendation_runs set lease_expires_at=now()-interval '1 second' where id=$1",
      [id(10)]
    );
    const reclaimed = await claim(id(12));
    assert.equal(reclaimed.lease_token, id(12));
    assert.equal(reclaimed.attempts, 2);
    await db.query(
      "update external_recommendation_runs set cancelled_at=now(),lease_expires_at=null where id=$1",
      [id(10)]
    );
    assert.equal(await claim(id(13)), null);
  } finally {
    await db.close();
  }
});
test("membership reset preserves decisions, stale replace fails, restore retains exact recommendation", async () => {
  const db = await database();
  try {
    const match = (
      await db.query<{ value: any }>(
        "select write_career_matching($1,$2,$3) as value",
        [
          id(1),
          "create",
          {
            action: "create",
            title: "Backend",
            criteria: { brief: [{ label: "role", content: "backend" }] },
          },
        ]
      )
    ).rows[0].value;
    await db.query(
      "insert into talent_external_evaluations(id,talent_id,role_id,input_fingerprint,assessment,input_snapshot) values($1,$2,$3,$4,$5,$6)",
      [id(4), id(1), id(3), "exact", { fit: { mutualFit: 70 } }, {}]
    );
    const add = {
      action: "add",
      matchingId: match.id,
      expectedRevision: "d41d8cd98f00b204e9800998ecf8427e",
      items: [{ roleId: id(3), evaluationId: id(4), explanation: "fit" }],
    };
    const receipt = (
      await db.query<{ value: any }>(
        "select write_career_opportunities($1,$2,$3) as value",
        [id(1), "add", add]
      )
    ).rows[0].value;
    assert.equal(
      (await db.query("select * from talent_opportunity_memberships")).rows
        .length,
      1
    );
    await db.query(
      "update talent_opportunity_recommendation set feedback=$1 where id=$2",
      ["dislike", receipt.recommendationIds[0]]
    );
    await assert.rejects(
      db.query("select write_career_opportunities($1,$2,$3)", [
        id(1),
        "stale",
        {
          action: "reset",
          matchingId: match.id,
          expectedRevision: receipt.listRevision,
        },
      ])
    );
    const beforeRestore = (
      await db.query<{ rev: string }>(
        "select career_opportunity_list_revision($1,$2) rev",
        [id(1), match.id]
      )
    ).rows[0].rev;
    await db.query("select write_career_opportunities($1,$2,$3)", [
      id(1),
      "restore",
      {
        action: "restore",
        matchingId: match.id,
        expectedRevision: beforeRestore,
        items: [{ recommendationId: receipt.recommendationIds[0] }],
      },
    ]);
    const row = (
      await db.query<{ feedback: string; list_position: string }>(
        "select feedback,list_position from talent_effective_opportunity_recommendations_v1"
      )
    ).rows[0];
    assert.equal(row.feedback, "dislike");
    assert.equal(row.list_position, "current");
    const revision = (
      await db.query<{ rev: string }>(
        "select career_opportunity_list_revision($1,$2) rev",
        [id(1), match.id]
      )
    ).rows[0].rev;
    await db.query("select write_career_opportunities($1,$2,$3)", [
      id(1),
      "reset",
      { action: "reset", matchingId: match.id, expectedRevision: revision },
    ]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from talent_opportunity_recommendation"
        )
      ).rows[0].n,
      1
    );
    assert.equal(
      (
        await db.query<{ p: string }>(
          "select list_position p from talent_effective_opportunity_recommendations_v1"
        )
      ).rows[0].p,
      "previous"
    );
  } finally {
    await db.close();
  }
});
test("superseded recommendation and role lookup both restore the canonical Intro without altering decisions", async () => {
  const db = await database();
  try {
    await db.query(
      "update company_roles set source_type='internal',information=$1 where role_id=$2",
      [
        {
          testOnly: true,
          testFixture: "career-canonical-membership",
          testTalentIds: [id(1)],
        },
        id(3),
      ]
    );
    await db.query(
      `insert into talent_opportunity_recommendation(id,talent_id,role_id,kind,opportunity_type,feedback,saved_stage,created_at)
      values($1,$3,$4,'match','internal_recommendation','dislike','closed','2026-10-28'),
            ($2,$3,$4,'match','intro_request','like','connected','2026-10-29')`,
      [id(6), id(7), id(1), id(3)]
    );
    await db.query("insert into company_intro_candidates values($1,$2,$3)", [
      id(1),
      id(3),
      id(7),
    ]);
    await db.query(
      "insert into talent_matchings(id,talent_id,title,criteria) values($1,$2,'Original search','{}')",
      [id(8), id(1)]
    );
    await db.query(
      "update talent_opportunity_memberships set matching_id=$1,archived_at=null where recommendation_id=$2",
      [id(8), id(6)]
    );
    const readBeforeWrite = (
      await db.query<any>(
        "select * from talent_opportunity_membership_index where matching_id=$1",
        [id(8)]
      )
    ).rows;
    assert.equal(readBeforeWrite.length, 1);
    assert.equal(readBeforeWrite[0].recommendation_id, id(7));
    assert.equal(readBeforeWrite[0].original_recommendation_id, id(6));
    assert.equal(readBeforeWrite[0].recommendation.feedback, "like");
    assert.equal(readBeforeWrite[0].recommendation.saved_stage, "connected");
    assert.match(
      formatCareerMatchingResult({ memberships: readBeforeWrite }),
      new RegExp(`Recommendation ${id(7)};`)
    );
    const write = async (
      operation: string,
      command: Record<string, unknown>
    ) => {
      const revision = (
        await db.query<{ rev: string }>(
          "select career_opportunity_list_revision($1,$2,$3) rev",
          [id(1), command.matchingId ?? null, command.allLists ?? false]
        )
      ).rows[0].rev;
      return (
        await db.query<{ value: any }>(
          "select write_career_opportunities($1,$2,$3) value",
          [id(1), operation, { ...command, expectedRevision: revision }]
        )
      ).rows[0].value;
    };
    await write("reset-default", { action: "reset" });
    assert.equal(
      (
        await db.query<any>(
          "select list_position from talent_effective_opportunity_recommendations_v1"
        )
      ).rows[0].list_position,
      "current"
    );
    await write("archive-all-aliases", {
      action: "archive",
      allLists: true,
      items: [{ recommendationId: id(6) }],
    });
    assert.equal(
      (
        await db.query<any>(
          "select list_position from talent_effective_opportunity_recommendations_v1"
        )
      ).rows[0].list_position,
      "previous"
    );
    for (const [operation, command] of [
      ["old-id", { action: "restore", items: [{ recommendationId: id(6) }] }],
      ["role-id", { action: "add", items: [{ roleId: id(3) }] }],
    ] as const) {
      await write(`reset:${operation}`, { action: "reset" });
      const receipt = await write(operation, command);
      assert.deepEqual(receipt.recommendationIds, [id(7)]);
      assert.deepEqual(
        (
          await db.query(
            "select recommendation_id from talent_opportunity_memberships where archived_at is null"
          )
        ).rows,
        [{ recommendation_id: id(7) }]
      );
      assert.deepEqual(
        (
          await db.query(
            "select id,list_position from talent_effective_opportunity_recommendations_v1"
          )
        ).rows,
        [{ id: id(7), list_position: "current" }]
      );
    }
    await write("restore-original-matching", {
      action: "restore",
      matchingId: id(8),
      items: [{ recommendationId: id(6) }],
    });
    const readAfterWrite = (
      await db.query<any>(
        "select * from talent_opportunity_membership_index where matching_id=$1",
        [id(8)]
      )
    ).rows;
    assert.equal(readAfterWrite.length, 1);
    assert.equal(readAfterWrite[0].recommendation_id, id(7));
    assert.equal(readAfterWrite[0].archived_at, null);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from talent_opportunity_memberships where matching_id=$1",
          [id(8)]
        )
      ).rows[0].n,
      2
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,feedback,saved_stage from talent_opportunity_recommendation order by id"
        )
      ).rows,
      [
        { id: id(6), feedback: "dislike", saved_stage: "closed" },
        { id: id(7), feedback: "like", saved_stage: "connected" },
      ]
    );
  } finally {
    await db.close();
  }
});
test("legacy internal matching receipts never become model-visible scoring context", () => {
  const output = formatCareerMatchingResult({
    runId: id(7),
    source: "internal",
    status: "partial",
    evaluations: [
      {
        id: id(9),
        role_id: id(3),
        evaluated_at: "2026-10-29T18:00:00Z",
        assessment: {
          mutualFit: 73,
          criteria: [{ name: "Backend", label: "strong" }],
        },
      },
    ],
    evaluationCursor: id(9),
  });
  assert.match(output, /read_recommended_opportunities/);
  assert.doesNotMatch(output, new RegExp(`${id(7)}|${id(9)}|assessment|mutualFit|evaluation|partial`, "i"));
});

test("registered tool returns the dedicated projection at the actual model boundary", async () => {
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  const { CAREER_AGENTIC_TOOLS } = await import("../generalTools");
  const { withCompactTalentToolModelResult } =
    await import("@/lib/talentOnboarding/toolModelResult");
  const calls: string[] = [];
  const admin = {
    rpc: async (name: string) => {
      calls.push(name);
      return name === "write_career_matching"
        ? {
            data: {
              id: id(12),
              title: "Backend roles",
              revision: 1,
              criteria: {
                brief: [{ ref: 1, label: "Location", content: "Seoul" }],
              },
            },
            error: null,
          }
        : { data: "revision-1", error: null };
    },
  };
  const raw = await CAREER_AGENTIC_TOOLS.upsert_matching.execute!(
    {
      action: "create",
      title: "Backend roles",
      criteria: { brief: [{ label: "Location", content: "Seoul" }] },
    },
    {
      admin,
      userId: id(1),
      conversationId: id(8),
      resumeRequestId: "synthetic-turn",
    }
  );
  const projected = withCompactTalentToolModelResult(
    "upsert_matching",
    raw
  ) as any;
  assert.match(projected.modelOutput, /Frozen matching criteria/);
  assert.match(projected.modelOutput, /Location: Seoul/);
  assert.match(projected.modelOutput, /listRevision: revision-1/);
  assert.equal(projected.matching.id, id(12));
  assert.deepEqual(calls, [
    "write_career_matching",
    "career_opportunity_list_revision",
  ]);
});


test("an internal suggestion publishes atomically without model-supplied assessment references", async () => {
  const db = await database();
  try {
    await db.query("update company_roles set source_type='internal' where role_id=$1",[id(3)]);
    const revision=(await db.query<any>("select career_opportunity_list_revision($1) value",[id(1)])).rows[0].value;
    const command={action:"add",expectedRevision:revision,items:[{roleId:id(3),explanation:"Public role context"}]};
    const first=(await db.query<any>("select write_career_opportunities($1,'internal-publish',$2) value",[id(1),JSON.stringify(command)])).rows[0].value;
    const repeated=(await db.query<any>("select write_career_opportunities($1,'internal-publish',$2) value",[id(1),JSON.stringify(command)])).rows[0].value;
    assert.deepEqual(repeated,first);
    const rec=(await db.query<any>("select * from talent_opportunity_recommendation")).rows[0];
    assert.equal(rec.opportunity_type,"internal_recommendation");
    assert.equal(rec.fit_summary,"Public role context");
    assert.equal(rec.feedback,null);
    assert.equal((await db.query<any>("select count(*) n from talent_opportunity_memberships")).rows[0].n,1);
    await assert.rejects(db.query("select write_career_opportunities($1,'stale',$2)",[id(1),JSON.stringify(command)]),/List changed/);
  } finally { await db.close(); }
});
