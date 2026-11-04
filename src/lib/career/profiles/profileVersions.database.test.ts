import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  CAREER_PROFILE_TOOLS,
  executeUpdateProfile,
  formatProfileToolResult,
} from "./tools";
import { resolveRoleSharedMaterials } from "../roleMaterials/store";

const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  role = "00000000-0000-4000-8000-000000000003",
  rec = "00000000-0000-4000-8000-000000000004",
  doc = "00000000-0000-4000-8000-000000000005";
async function database() {
  const db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table talent_users(user_id uuid primary key,deleted_at timestamptz,name text,headline text,bio text,location text,current_location text,email text,phone_number text,profile_picture text,resume_links text[] default '{}',resume_file_name text,resume_storage_path text,resume_text text,updated_at timestamptz default now());
 create table talent_experiences(id bigserial primary key,talent_id uuid references talent_users(user_id),company_id text,company_link text,company_location text,company_logo text,company_name text,description text,employment_type text,start_date date,end_date date,memo text,months integer,role text,created_at timestamptz default now());
 create table talent_educations(id bigserial primary key,talent_id uuid references talent_users(user_id),degree text,description text,end_date date,field text,memo text,school text,start_date date,url text,created_at timestamptz default now());
 create table talent_extras(talent_id uuid primary key references talent_users(user_id),content jsonb);
 create table company_workspace(company_workspace_id uuid primary key,company_name text,published_name text);
 create table company_roles(role_id uuid primary key,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb,company_workspace_id uuid);
 create table talent_setting(user_id uuid primary key,is_onboarding_done boolean,profile_visibility text,blocked_companies text[]);
 create table talent_documents(id uuid primary key,talent_id uuid,revision bigint default 1,file_name text,kind text,is_deleted boolean default false,is_public boolean default false,is_primary boolean default false,storage_path text,extracted_text text,structured_content jsonb);
 create table opportunity_discovery_run(id uuid primary key,talent_id uuid,coverage jsonb default '{}');
 create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,feedback text,saved_stage text,created_at timestamptz default now(),recommended_at timestamptz default now(),opportunity_type text,kind text,evidence jsonb,fit_reasons jsonb,preference_fit jsonb,tradeoffs jsonb,discovery_run_id uuid);
 create table company_intro_candidates(id uuid primary key,talent_id uuid,role_id uuid,recommendation_id uuid);
 create table company_role_candidate_evaluations(id uuid primary key,talent_id uuid,role_id uuid,stage integer);
 create table talent_opportunity_tag(talent_id uuid,opportunity_id uuid,tag text);
 create table talent_progress(talent_id uuid,role_id uuid,recommendation_id uuid,user_id uuid,kind text,text text,metadata jsonb,open_to_company boolean);
 create function accept_talent_internal_role_recommendation_v1(uuid,uuid,uuid,text,jsonb,jsonb) returns jsonb language sql as $$select '{"status":"accepted"}'::jsonb$$;
 create function decide_company_intro_request_v1(uuid,uuid,text,text,jsonb) returns jsonb language sql as $$select '{"status":"accepted"}'::jsonb$$;
 `);
  await db.exec(
    await readFile(
      "supabase/migrations/20261029182857_career_profile_versions_and_role_materials.sql",
      "utf8"
    )
  );
  await db.query(
    "insert into talent_users(user_id,name) values ($1,$2),($3,$4)",
    [owner, "Owner", other, "Other"]
  );
  await db.query(
    "insert into company_roles(role_id,source_type,status) values($1,'internal','active')",
    [role]
  );
  await db.query(
    "insert into talent_opportunity_recommendation(id,talent_id,role_id) values($1,$2,$3)",
    [rec, owner, role]
  );
  return db;
}
async function profile(db: PGlite, id?: string, revision?: number) {
  const result = await db.query<{ result: any }>(
    "select read_talent_profile_v1($1,$2,$3) result",
    [owner, id ?? null, revision ?? null]
  );
  return result.rows[0].result;
}
async function write(
  db: PGlite,
  action: string,
  p: any,
  snapshot: any,
  operation: string
) {
  return (
    await db.query<{ result: any }>(
      "select write_talent_profile_v1($1,$2,$3,$4,$5,$6,null,$7) result",
      [
        owner,
        action,
        p.profileId,
        p.revision,
        snapshot,
        "Role version",
        operation,
      ]
    )
  ).rows[0].result;
}

function toolContext(db: PGlite, request = "tool-request") {
  return {
    userId: owner,
    resumeRequestId: request,
    admin: {
      async rpc(name: string, parameters: Record<string, unknown>) {
        try {
          const result = await db.query<{ result: unknown }>(
            `select ${name}(${Object.keys(parameters)
              .map((key, index) => `${key} => $${index + 1}`)
              .join(",")}) result`,
            Object.values(parameters)
          );
          return { data: result.rows[0].result, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      from(table: string) {
        let fields = "*",
          max: number | undefined;
        const values: unknown[] = [],
          filters: string[] = [],
          orders: string[] = [];
        const predicate = (key: string, op: string, value: unknown) => {
          values.push(value);
          filters.push(`${key} ${op} $${values.length}`);
          return query;
        };
        const execute = async (single = false) => {
          try {
            const result = await db.query(
              `select ${fields} from ${table}${filters.length ? ` where ${filters.join(" and ")}` : ""}${orders.length ? ` order by ${orders.join(",")}` : ""}${max === undefined ? "" : ` limit ${max}`}`,
              values
            );
            return {
              data: single ? (result.rows[0] ?? null) : result.rows,
              error: null,
            };
          } catch (error) {
            return { data: null, error };
          }
        };
        const query: any = {
          select: (selected: string) => {
            fields = selected;
            return query;
          },
          eq: (key: string, value: unknown) => predicate(key, "=", value),
          lt: (key: string, value: unknown) => predicate(key, "<", value),
          gt: (key: string, value: unknown) => predicate(key, ">", value),
          ilike: (key: string, value: unknown) =>
            predicate(key, "ilike", value),
          is: (key: string) => {
            filters.push(`${key} is null`);
            return query;
          },
          not: (key: string) => {
            filters.push(`${key} is not null`);
            return query;
          },
          order: (key: string, options?: { ascending: boolean }) => {
            orders.push(
              `${key} ${options?.ascending === false ? "desc" : "asc"}`
            );
            return query;
          },
          limit: (value: number) => {
            max = value;
            return query;
          },
          single: () => execute(true),
          maybeSingle: () => execute(true),
          then: (resolve: any, reject: any) => execute().then(resolve, reject),
        };
        return query;
      },
    },
  };
}

test("profile revisions, assignment snapshots and acceptance pins preserve exact approved material", async () => {
  const db = await database();
  try {
    const initial = await profile(db);
    const variant = await write(db, "copy", initial, null, "copy-1");
    const edited = structuredClone(variant.snapshot);
    edited.talentUser.headline = "Role-specific headline";
    const variant2 = await write(db, "update", variant, edited, "edit-1");
    assert.equal((await profile(db)).snapshot.talentUser.headline, null);
    assert.equal(
      (await profile(db, variant.profileId, 1)).snapshot.talentUser.headline,
      null
    );
    assert.equal(
      (await write(db, "update", variant, edited, "edit-1")).revision,
      variant2.revision,
      "retry returns original receipt before revision check"
    );
    await assert.rejects(
      () => write(db, "update", variant, edited, "another-write"),
      /profile_revision_conflict/
    );
    await assert.rejects(
      () =>
        db.query("select read_talent_profile_v1($1,$2)", [
          other,
          variant.profileId,
        ]),
      /profile_not_found/
    );
    await db.query(
      "insert into talent_documents(id,talent_id,file_name,extracted_text,kind) values($1,$2,$3,$4,$5)",
      [doc, owner, "Notes", "Original notes", "document"]
    );
    const material = (
      await db.query<{ result: any }>(
        "select assign_talent_role_materials_v1($1,$2,$3,0,$4,$5,$6,$7) result",
        [
          owner,
          role,
          "set",
          variant2.profileId,
          variant2.revision,
          [{ documentId: doc, revision: 1 }],
          "assignment-1",
        ]
      )
    ).rows[0].result;
    await db.query(
      "update talent_documents set extracted_text=$1,revision=2,is_deleted=true where id=$2",
      ["Changed notes", doc]
    );
    const accepted = (
      await db.query<{ result: any }>(
        "select accept_talent_internal_role_recommendation_v2($1,$2,p_context=>$3) result",
        [owner, rec, { materialId: material.id, assignmentRevision: 1 }]
      )
    ).rows[0].result;
    assert.equal(accepted.materialId, material.id);
    await db.query(
      "select assign_talent_role_materials_v1($1,$2,'clear',1,null,null,'[]','clear-1')",
      [owner, role]
    );
    const pinned = (
      await db.query<{ profile_snapshot: any; documents: any }>(
        `select m.profile_snapshot,m.documents from talent_opportunity_recommendation r join talent_role_materials m on m.id=r.shared_material_id where r.id=$1`,
        [rec]
      )
    ).rows[0];
    assert.equal(
      pinned.profile_snapshot.talentUser.headline,
      "Role-specific headline"
    );
    assert.equal(pinned.documents[0].extracted_text, "Original notes");
    assert.equal(pinned.documents[0].is_deleted, false);
    await assert.rejects(
      () => write(db, "archive", initial, initial.snapshot, "archive-default"),
      /choose_default_profile_before_archiving/
    );
  } finally {
    await db.close();
  }
});

test("documents-only selection freezes default revision and changed selection rejects acceptance", async () => {
  const db = await database();
  try {
    const initial = await profile(db);
    const material = (
      await db.query<{ result: any }>(
        "select assign_talent_role_materials_v1($1,$2,'set',0,null,null,'[]','default-assignment') result",
        [owner, role]
      )
    ).rows[0].result;
    const next = structuredClone(initial.snapshot);
    next.talentUser.headline = "Changed default";
    await write(db, "update", initial, next, "default-edit");
    assert.equal(material.profile_revision, initial.revision);
    assert.equal(material.profile_snapshot.talentUser.headline, null);
    await db.query(
      "select assign_talent_role_materials_v1($1,$2,'clear',1,null,null,'[]','clear')",
      [owner, role]
    );
    await assert.rejects(
      () =>
        db.query(
          "select accept_talent_internal_role_recommendation_v2($1,$2,p_context=>$3)",
          [owner, rec, { materialId: material.id, assignmentRevision: 1 }]
        ),
      /role_assignment_revision_conflict/
    );
    assert.equal(
      (
        await db.query<{ shared_material_id: string | null }>(
          "select shared_material_id from talent_opportunity_recommendation where id=$1",
          [rec]
        )
      ).rows[0].shared_material_id,
      null
    );
  } finally {
    await db.close();
  }
});

test("default acceptance preserves a legacy resume file and owner deletion revokes version access", async () => {
  const db = await database();
  try {
    await db.query(
      "update talent_users set resume_storage_path=$1,resume_file_name=$2 where user_id=$3",
      ["owner/immutable-upload.pdf", "Original.pdf", owner]
    );
    const accepted = (
      await db.query<{ result: any }>(
        "select accept_talent_internal_role_recommendation_v2($1,$2) result",
        [owner, rec]
      )
    ).rows[0].result;
    const material = (
      await db.query<{ documents: any }>(
        "select documents from talent_role_materials where id=$1",
        [accepted.materialId]
      )
    ).rows[0];
    assert.equal(
      material.documents[0].storage_path,
      "owner/immutable-upload.pdf"
    );
    await db.query(
      "update talent_users set deleted_at=now() where user_id=$1",
      [owner]
    );
    await assert.rejects(() => profile(db), /profile_owner_not_found/);
  } finally {
    await db.close();
  }
});

test("internal publication binds evaluation evidence to its source run and preserves existing candidate decisions", async () => {
  const db = await database();
  try {
    const runId = "00000000-0000-4000-8000-000000000021",
      evaluationId = "00000000-0000-4000-8000-000000000022",
      unrelatedEvaluationId = "00000000-0000-4000-8000-000000000023";
    await db.query(
      "insert into talent_setting(user_id,is_onboarding_done,profile_visibility) values($1,true,'share')",
      [owner]
    );
    await db.query(
      "insert into company_role_candidate_evaluations values($1,$2,$3,2),($4,$2,$3,2)",
      [evaluationId, owner, role, unrelatedEvaluationId]
    );
    await db.query("insert into opportunity_discovery_run values($1,$2,$3)", [
      runId,
      owner,
      { evaluationIds: [evaluationId] },
    ]);
    const publish = (id: string) =>
      db.query<{ result: any }>(
        "select publish_evaluated_internal_role_v1($1,$2,$3,$4,'publish') result",
        [owner, role, [id], runId]
      );
    await assert.rejects(
      () => publish(unrelatedEvaluationId),
      /internal_evaluation_run_mismatch/
    );
    for (const [feedback, savedStage] of [
      ["dislike", "rejected"],
      ["like", "connected"],
      [null, null],
    ]) {
      await db.query(
        "update talent_opportunity_recommendation set feedback=$1,saved_stage=$2 where id=$3",
        [feedback, savedStage, rec]
      );
      const result = (await publish(evaluationId)).rows[0].result;
      assert.equal(result.recommendationId, rec);
      assert.equal(result.created, false);
      assert.equal(result.feedback, feedback);
      assert.equal(result.savedStage, savedStage);
    }
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*) count from talent_progress"
        )
      ).rows[0].count,
      0
    );
  } finally {
    await db.close();
  }
});

test("copy tool can edit a chosen historical revision without losing those edits or replaying newer content", async () => {
  const db = await database();
  try {
    const initial = await profile(db);
    await executeUpdateProfile(
      {
        talentUser: { bio: "Current biography", headline: "Current headline" },
      },
      toolContext(db, "edit-default")
    );
    const input = {
      action: "copy",
      profileId: initial.profileId,
      expectedRevision: initial.revision,
      title: "지원용 프로필",
      talentUser: { headline: "엔지니어 · Engineer" },
      rows: [
        {
          type: "extra",
          operation: "add",
          fields: {
            title: "研究",
            description: "Confirmed multilingual result",
            memo: "Only for my preparation",
          },
        },
      ],
    };
    const copy = await executeUpdateProfile(input, toolContext(db, "copy"));
    assert.equal(copy.snapshot.talentUser?.headline, "엔지니어 · Engineer");
    assert.equal(
      copy.snapshot.talentUser?.bio,
      null,
      "copy the requested historical source, not its latest biography"
    );
    assert.equal(copy.snapshot.talentExtras.length, 1);
    await executeUpdateProfile(
      {
        profileId: copy.profileId,
        expectedRevision: copy.revision,
        talentUser: { headline: "Later edit" },
      },
      toolContext(db, "edit-copy")
    );
    const retried = await executeUpdateProfile(input, toolContext(db, "copy"));
    assert.equal(retried.profileId, copy.profileId);
    assert.equal(retried.revision, copy.revision);
    assert.deepEqual(retried.snapshot, copy.snapshot);
    assert.equal(
      (await profile(db)).snapshot.talentUser.headline,
      "Current headline"
    );
  } finally {
    await db.close();
  }
});

test("sparse profiles support versions, default changes, archives and stale-write rollback", async () => {
  const db = await database();
  try {
    const initial = await profile(db);
    const created = await executeUpdateProfile(
      {
        action: "create",
        title: "경력 준비 중",
        talentUser: { name: "", bio: null, resume_links: [] },
        rows: [],
      },
      toolContext(db, "create-sparse")
    );
    assert.deepEqual(created.snapshot.talentExperiences, []);
    assert.deepEqual(created.snapshot.talentEducations, []);
    const edited = await executeUpdateProfile(
      {
        profileId: created.profileId,
        expectedRevision: 1,
        profileLinks: [{ action: "add", url: "https://example.invalid/作品" }],
        rows: [
          {
            type: "education",
            operation: "add",
            fields: { school: "학교", start_date: "2024", end_date: null },
          },
        ],
      },
      toolContext(db, "sparse-edit")
    );
    assert.equal(edited.snapshot.talentEducations[0].start_date, "2024-01-01");
    await assert.rejects(
      () =>
        executeUpdateProfile(
          {
            profileId: created.profileId,
            expectedRevision: 1,
            talentUser: { bio: "Stale edit" },
          },
          toolContext(db, "stale")
        ),
      /profile_revision_conflict/
    );
    const active = await executeUpdateProfile(
      {
        action: "set_default",
        profileId: created.profileId,
        expectedRevision: edited.revision,
      },
      toolContext(db, "switch")
    );
    assert.equal((await profile(db)).profileId, created.profileId);
    assert.deepEqual(
      (await profile(db, initial.profileId, initial.revision)).snapshot,
      initial.snapshot
    );
    await assert.rejects(
      () =>
        executeUpdateProfile(
          {
            action: "archive",
            profileId: active.profileId,
            expectedRevision: active.revision,
          },
          toolContext(db, "archive-default")
        ),
      /choose_default_profile_before_archiving/
    );
    const archived = await executeUpdateProfile(
      {
        action: "archive",
        profileId: initial.profileId,
        expectedRevision: initial.revision,
      },
      toolContext(db, "archive-old")
    );
    assert.equal(archived.isArchived, true);
    const restored = await executeUpdateProfile(
      {
        action: "restore",
        profileId: initial.profileId,
        expectedRevision: archived.revision,
      },
      toolContext(db, "restore-old")
    );
    assert.equal(restored.isArchived, false);
    assert.equal((await profile(db)).profileId, created.profileId);
  } finally {
    await db.close();
  }
});

test("multiple private and public documents stay pinned across edits, deletion, clearing and default switching", async () => {
  const db = await database();
  try {
    const secondDoc = "00000000-0000-4000-8000-000000000031",
      foreignDoc = "00000000-0000-4000-8000-000000000032";
    const secondRole = "00000000-0000-4000-8000-000000000033",
      workspace = "00000000-0000-4000-8000-000000000034";
    await db.query(
      "insert into company_workspace values($1,'Company','Company')",
      [workspace]
    );
    await db.query(
      "update company_roles set company_workspace_id=$1 where role_id=$2",
      [workspace, role]
    );
    await db.query(
      "insert into company_roles(role_id,source_type,status,company_workspace_id) values($1,'internal','active',$2)",
      [secondRole, workspace]
    );
    await db.query(
      "insert into talent_documents(id,talent_id,revision,file_name,is_public,extracted_text) values($1,$2,1,'Resume',true,'Original resume'),($3,$2,3,'Role answers',false,'Approved private answers'),($4,$5,1,'Someone else',true,'Never share')",
      [doc, owner, secondDoc, foreignDoc, other]
    );
    const initial = await profile(db),
      variant = await write(db, "copy", initial, null, "variant");
    const assign = (documents: unknown[], operation: string) =>
      db.query<{ material: any }>(
        "select assign_talent_role_materials_v1($1,$2,'set',0,$3,$4,$5,$6) material",
        [owner, role, variant.profileId, variant.revision, documents, operation]
      );
    await assert.rejects(
      () => assign([{ documentId: doc, revision: 2 }], "stale-document"),
      /assignment_document_revision_conflict/
    );
    await assert.rejects(
      () =>
        assign([{ documentId: foreignDoc, revision: 1 }], "foreign-document"),
      /assignment_document_not_found/
    );
    const material = (
      await assign(
        [
          { documentId: secondDoc, revision: 3 },
          { documentId: doc, revision: 1 },
        ],
        "assign"
      )
    ).rows[0].material;
    assert.deepEqual(
      material.documents.map((entry: any) => entry.id),
      [secondDoc, doc]
    );
    await db.query(
      "update talent_documents set revision=revision+1,extracted_text='Changed source' where id=$1",
      [doc]
    );
    await db.query("update talent_documents set is_deleted=true where id=$1", [
      secondDoc,
    ]);
    await db.query(
      "select accept_talent_internal_role_recommendation_v2($1,$2,null,null,null,$3)",
      [
        owner,
        rec,
        { materialId: material.id, assignmentRevision: material.revision },
      ]
    );
    const changed = await executeUpdateProfile(
      {
        profileId: variant.profileId,
        expectedRevision: variant.revision,
        talentUser: { headline: "New default" },
      },
      toolContext(db, "edit-variant")
    );
    await executeUpdateProfile(
      {
        action: "set_default",
        profileId: changed.profileId,
        expectedRevision: changed.revision,
      },
      toolContext(db, "default-variant")
    );
    await db.query(
      "select assign_talent_role_materials_v1($1,$2,'clear',1,null,null,'[]','clear')",
      [owner, role]
    );
    await db.query(
      "select assign_talent_role_materials_v1($1,$2,'set',0,null,null,'[]','second-role')",
      [owner, secondRole]
    );
    const args = {
      admin: toolContext(db).admin as any,
      userId: owner,
      roleId: role,
      workspaceId: workspace,
    };
    const shared = await resolveRoleSharedMaterials(args);
    assert.equal(shared?.id, material.id);
    assert.equal(shared?.profile_revision, variant.revision);
    assert.equal(shared?.profile_snapshot?.talentUser?.headline, null);
    assert.deepEqual(
      shared?.documents.map((entry) => entry.extracted_text),
      ["Approved private answers", "Original resume"]
    );
    assert.equal(
      await resolveRoleSharedMaterials({ ...args, roleId: secondRole }),
      null,
      "private preparation is not accepted sharing"
    );
    await assert.rejects(
      () => resolveRoleSharedMaterials({ ...args, workspaceId: other }),
      /workspace mismatch/
    );
    assert.equal(
      await resolveRoleSharedMaterials({ ...args, userId: other }),
      null
    );
    const repeated = (
      await db.query<{ result: any }>(
        "select accept_talent_internal_role_recommendation_v2($1,$2) result",
        [owner, rec]
      )
    ).rows[0].result;
    assert.equal(repeated.materialId, material.id);
  } finally {
    await db.close();
  }
});

test("actual profile read tools paginate historical revisions and retain exact comparison and owner scope", async () => {
  const db = await database();
  try {
    let current = await profile(db);
    for (let index = 0; index < 22; index++) {
      const snapshot = structuredClone(current.snapshot);
      snapshot.talentUser.bio = `Revision body ${index}`;
      current = await write(
        db,
        "update",
        current,
        snapshot,
        `history-${index}`
      );
    }
    const context = toolContext(db),
      readContext = { admin: context.admin, userId: owner };
    const first: any = await CAREER_PROFILE_TOOLS.read_profile.execute!(
      {
        profileId: current.profileId,
        revision: 1,
        compareRevision: current.revision,
        sections: [],
        userId: other,
      },
      readContext
    );
    assert.equal(first.revision, 1);
    assert.equal(first.snapshot.talentUser.bio, null);
    assert.equal(first.comparison.snapshot.talentUser.bio, "Revision body 21");
    assert.equal(first.history.length, 20);
    assert.equal(first.nextHistoryCursor, 4);
    const second: any = await CAREER_PROFILE_TOOLS.read_profile.execute!(
      { profileId: current.profileId, historyCursor: first.nextHistoryCursor },
      readContext
    );
    assert.deepEqual(
      second.history.map((item: any) => item.revision),
      [3, 2, 1]
    );
    assert.equal(second.nextHistoryCursor, null);
    const text = formatProfileToolResult("read_profile", first);
    assert.match(text, /Revision 23;/);
    assert.match(text, /Next history cursor: 4/);
    assert.doesNotMatch(text, /Revision body|"snapshot"/);
    const listed: any = await CAREER_PROFILE_TOOLS.list_profiles.execute!(
      { limit: 1, userId: other },
      readContext
    );
    assert.equal(listed.profiles[0].id, current.profileId);
    await assert.rejects(
      () =>
        CAREER_PROFILE_TOOLS.read_profile.execute!(
          { profileId: current.profileId },
          { ...readContext, userId: other }
        ),
      /profile_not_found/
    );
  } finally {
    await db.close();
  }
});

test("company evaluation readers expose a private profile evaluation only for the exact accepted role and revision", async () => {
  const db = await database();
  try {
    await db.exec(
      "alter table company_role_candidate_evaluations add column source_profile_id uuid, add column source_profile_revision bigint, add column source_material_id uuid, add column evidence_scope text;"
    );
    const sql = await readFile(
      "supabase/migrations/20261029183004_career_matching_workspaces.sql",
      "utf8"
    );
    const view = sql.match(
      /create view public\.company_readable_role_evaluations_v1[\s\S]*?;/
    )?.[0];
    assert.ok(view);
    await db.exec(view);
    const initial = await profile(db),
      variant = await write(db, "copy", initial, null, "private-variant");
    const material = (
      await db.query<{ material: any }>(
        "select assign_talent_role_materials_v1($1,$2,'set',0,$3,1,'[]','private-assignment') material",
        [owner, role, variant.profileId]
      )
    ).rows[0].material;
    const secondRole = "00000000-0000-4000-8000-000000000041",
      wrongMaterial = "00000000-0000-4000-8000-000000000042";
    const expected: string[] = [];
    for (const [index, scope, roleId, revision, materialId] of [
      [1, "default", role, null, null],
      [2, "candidate_private", role, 1, null],
      [3, "candidate_private", secondRole, 1, null],
      [4, "candidate_private", role, 2, null],
      [5, "role_shared", role, 1, material.id],
      [6, "role_shared", role, 1, wrongMaterial],
    ] as const) {
      const id = `00000000-0000-4000-8000-00000000005${index}`;
      await db.query(
        "insert into company_role_candidate_evaluations(id,talent_id,role_id,stage,source_profile_id,source_profile_revision,source_material_id,evidence_scope) values($1,$2,$3,2,$4,$5,$6,$7)",
        [id, owner, roleId, variant.profileId, revision, materialId, scope]
      );
      if ([1, 2, 5].includes(index)) expected.push(id);
    }
    const readable = async () =>
      (
        await db.query<{ id: string }>(
          "select id from company_readable_role_evaluations_v1 order by id"
        )
      ).rows.map((row) => row.id);
    assert.deepEqual(await readable(), [expected[0]]);
    await db.query(
      "select accept_talent_internal_role_recommendation_v2($1,$2,null,null,null,$3)",
      [owner, rec, { materialId: material.id, assignmentRevision: 1 }]
    );
    assert.deepEqual(await readable(), expected);
    await db.query(
      "select assign_talent_role_materials_v1($1,$2,'clear',1,null,null,'[]','clear-after-sharing')",
      [owner, role]
    );
    assert.deepEqual(
      await readable(),
      expected,
      "clearing preparation cannot revoke historical accepted evidence"
    );
  } finally {
    await db.close();
  }
});
