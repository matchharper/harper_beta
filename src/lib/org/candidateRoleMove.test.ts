import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { candidateRoleMoveMode } from "./candidateRoleMove";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("web Role move preserves consent boundaries and retries atomically", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,name text,status text,information jsonb,is_expired boolean,expires_at timestamptz);
    create table company_conversations(id uuid,company_workspace_id uuid,role_id uuid);
    create table talent_users(user_id uuid,deleted_at timestamptz);
    create table company_intro_candidates(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,role_id uuid,talent_id uuid,status text,selection_run_id uuid,selection_reason text,role_fingerprint text,talent_fingerprint text,presentation jsonb,close_reason text,revision integer default 1,updated_at timestamptz);
    create unique index active_pair on company_intro_candidates(role_id,talent_id) where status in ('ready','awaiting_talent','connecting');
    create table company_messages(id bigserial primary key,company_workspace_id uuid,company_user_id uuid,conversation_id uuid,role_id uuid,role text,content text,message_type text,status text,metadata jsonb);
    create table talent_opportunity_recommendation(id uuid,role_id uuid,talent_id uuid,created_at timestamptz,updated_at timestamptz);
    create table talent_opportunity_tag(id bigserial,talent_id uuid,opportunity_id uuid,tag text,created_at timestamptz,updated_at timestamptz);
    create table ops_matching_role_stages(id uuid,role_id uuid);
    create table delegated_moves(target_stage text);
    create table company_talent_requests(id uuid primary key,company_workspace_id uuid,talent_id uuid,role_id uuid,recommendation_id uuid,source_company_message_id bigint,workflow_status text,created_at timestamptz default now(),expires_at timestamptz default 'infinity');
    create table company_talent_relays(id uuid,company_talent_request_id uuid,recommendation_id uuid,source_talent_message_id bigint);
    create table talent_messages(id bigint,user_id uuid,role text,created_at timestamptz default now());
    create table contact_queue(company_talent_relay_id uuid,type text,status text,company_talent_request_id uuid,sent_at timestamptz);
    create function send_company_talent_contact_v2(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text) returns jsonb language plpgsql as $$ begin
      insert into public.company_talent_requests(id,company_workspace_id,role_id,talent_id,recommendation_id,source_company_message_id,workflow_status) values($1,$2,$3,$4,$5,$6,'queued');
      insert into public.contact_queue(type,status,company_talent_request_id) values('company_request_candidate_delivery','queued',$1);
      return jsonb_build_object('status','queued','requestId',$1); end $$;
    create function company_intro_role_allows_talent_v1(jsonb,uuid) returns boolean language sql as $$ select not coalesce(($1->>'testOnly')::boolean,false) $$;
    create function move_company_candidate_to_role_v1(uuid,uuid,uuid,uuid,text,bigint,uuid) returns jsonb language plpgsql as $$ begin
      insert into public.delegated_moves values($5);
      return jsonb_build_object('status','moved','targetRoleId',$4,'targetRecommendationId','${id(20)}'); end $$;
    insert into company_roles values('${id(1)}','${id(3)}','internal','Source','active','{}',false,null),('${id(2)}','${id(3)}','internal','Target','active','{}',false,null);
    insert into company_conversations values('${id(4)}','${id(3)}','${id(1)}');
    insert into talent_users values('${id(5)}',null);
    insert into company_intro_candidates(id,company_workspace_id,role_id,talent_id,status,selection_run_id,presentation) values('${id(6)}','${id(3)}','${id(1)}','${id(5)}','ready','${id(7)}','{"tldr":"source-only evaluation"}');
  `);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261020114613_org_candidate_role_move_web.sql",
      "utf8"
    )
  );
  const move = async (
    stage = "company_intro",
    recommendation = `company-intro:${id(6)}`,
    request = id(8),
    targetStage = stage,
    method = "direct",
    confirmed = true
  ) => {
    const result = await db.query<{
      result: { status: string; targetRecommendationId?: string };
    }>(
      "select move_org_candidate_role_web_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Subject','Body','Context') result",
      [
        id(3),
        id(5),
        id(1),
        id(2),
        recommendation,
        stage,
        targetStage,
        request,
        id(9),
        id(4),
        method,
        confirmed,
      ]
    );
    return result.rows[0].result;
  };
  await t.test(
    "a ready proposal moves without a candidate recommendation or pipeline action",
    async () => {
      assert.equal((await move()).status, "moved");
      assert.equal(
        (await db.query("select * from delegated_moves")).rows.length,
        0
      );
      assert.equal(
        (await db.query("select * from talent_opportunity_recommendation")).rows
          .length,
        0
      );
      const rows = (
        await db.query<{
          status: string;
          presentation: Record<string, unknown>;
        }>(
          "select status,presentation from company_intro_candidates order by status"
        )
      ).rows;
      assert.deepEqual(
        rows.map((row) => row.status),
        ["closed", "ready"]
      );
      assert.equal(rows[1].presentation.tldr, undefined);
    }
  );
  await t.test(
    "a lost-response retry returns the original move without another proposal",
    async () => {
      assert.equal((await move()).status, "moved");
      assert.equal(
        (await db.query("select * from company_intro_candidates")).rows.length,
        2
      );
      assert.equal(
        (await db.query("select * from company_messages")).rows.length,
        1
      );
    }
  );
  await db.exec(
    `delete from company_intro_candidates where role_id='${id(2)}'; update company_intro_candidates set status='awaiting_talent' where id='${id(6)}';`
  );
  await t.test(
    "an Intro requested after the screen opened cannot be moved",
    async () => {
      assert.equal(
        (await move("company_intro", `company-intro:${id(6)}`, id(10))).status,
        "intro_pending"
      );
    }
  );
  await db.exec(
    `delete from company_intro_candidates; insert into talent_opportunity_recommendation values('${id(11)}','${id(1)}','${id(5)}',now(),now()); insert into talent_opportunity_tag(talent_id,opportunity_id,tag,created_at,updated_at) values('${id(5)}','${id(1)}','내부:연결대기',now(),now());`
  );
  await t.test(
    "pending candidates cannot silently become connected",
    async () => {
      assert.equal(
        (await move("pending_connection", id(11), id(12), "connected")).status,
        "state_changed"
      );
      assert.equal(
        (await move("pending_connection", id(11), id(13))).status,
        "moved"
      );
      assert.deepEqual(
        (await db.query("select target_stage from delegated_moves")).rows,
        [{ target_stage: "pending_connection" }]
      );
    }
  );
  await t.test(
    "direct moves require the company's affirmative confirmation",
    async () => {
      assert.equal(
        (
          await move(
            "pending_connection",
            id(11),
            id(30),
            "pending_connection",
            "direct",
            false
          )
        ).status,
        "direct_confirmation_required"
      );
    }
  );
  const complete = async (relay = id(32), target = id(2)) =>
    (
      await db.query<{ result: { status: string } }>(
        "select complete_org_candidate_role_move_v1($1,$2,$3,$4,$5,$6,$7) result",
        [relay, id(9), id(3), id(5), id(1), target, "pending_connection"]
      )
    ).rows[0].result;
  await t.test(
    "asking leaves the original pipeline untouched and schedules one durable contact",
    async () => {
      const before = (await db.query("select * from delegated_moves")).rows
        .length;
      assert.equal(
        (
          await move(
            "pending_connection",
            id(11),
            id(31),
            "pending_connection",
            "ask_candidate",
            false
          )
        ).status,
        "requested"
      );
      assert.equal(
        (
          await move(
            "pending_connection",
            id(11),
            id(31),
            "pending_connection",
            "ask_candidate",
            false
          )
        ).status,
        "requested"
      );
      assert.equal(
        (await db.query("select * from delegated_moves")).rows.length,
        before
      );
      assert.equal(
        (await db.query("select * from company_talent_requests")).rows.length,
        1
      );
      assert.equal(
        (
          await move(
            "pending_connection",
            id(11),
            id(39),
            "pending_connection",
            "ask_candidate",
            false
          )
        ).status,
        "request_pending"
      );
    }
  );
  await t.test(
    "only a reply to the authorized contact can execute the saved destination",
    async () => {
      assert.equal((await complete()).status, "consent_not_found");
      await db.exec(`insert into talent_messages values(100,'${id(5)}','user',now());
      insert into company_talent_relays values('${id(32)}','${id(31)}','${id(11)}',100);
      insert into contact_queue(company_talent_relay_id,type,status) values('${id(32)}','company_contact_company_delivery','queued');
      update contact_queue set status='sent',sent_at=now()-interval '1 second' where company_talent_request_id='${id(31)}';`);
      assert.equal(
        (await complete(id(32), id(99))).status,
        "consent_not_found"
      );
      await db.exec(
        `update company_talent_requests set workflow_status='cancelled' where id='${id(31)}'`
      );
      assert.equal((await complete()).status, "state_changed");
      await db.exec(
        `update company_talent_requests set workflow_status='awaiting_talent' where id='${id(31)}'`
      );
      assert.equal((await complete()).status, "moved");
      const count = (await db.query("select * from delegated_moves")).rows
        .length;
      assert.equal((await complete()).status, "moved");
      assert.equal(
        (await db.query("select * from delegated_moves")).rows.length,
        count
      );
    }
  );
  await t.test(
    "an undelivered, cancelled or later-delivered question cannot authorize a move",
    async () => {
      await db.exec(`update company_messages set metadata=metadata-'roleMoveOutcome' where metadata ? 'approvedRoleMove';
        update company_talent_relays set company_talent_request_id=null where id='${id(32)}';
        update company_talent_requests set workflow_status='closed' where id='${id(31)}';
        update contact_queue set status='cancelled' where company_talent_request_id='${id(31)}';`);
      assert.equal((await complete()).status, "consent_not_found");
      await db.exec(`update company_talent_requests set workflow_status='queued' where id='${id(31)}';
        update contact_queue set status='queued',sent_at=null where company_talent_request_id='${id(31)}';`);
      assert.equal((await complete()).status, "consent_not_found");
      await db.exec(
        `update contact_queue set status='sent',sent_at=now()+interval '1 second' where company_talent_request_id='${id(31)}';`
      );
      assert.equal((await complete()).status, "consent_not_found");
      await db.exec(`update company_talent_requests set workflow_status='awaiting_talent' where id='${id(31)}';
        update contact_queue set status='sent',sent_at=now()-interval '1 second' where company_talent_request_id='${id(31)}';`);
    }
  );
  await t.test(
    "ordinary connection replies without a request ID complete the delegated move",
    async () => {
      await db.exec(`update company_messages set metadata=metadata-'roleMoveOutcome' where metadata ? 'approvedRoleMove';
        update company_talent_relays set company_talent_request_id=null where id='${id(32)}';`);
      assert.equal((await complete()).status, "moved");
      const count = (await db.query("select * from delegated_moves")).rows
        .length;
      assert.equal((await complete()).status, "moved");
      assert.equal(
        (await db.query("select * from delegated_moves")).rows.length,
        count
      );
    }
  );
  await t.test(
    "later candidate replies and changed source state stop delayed execution",
    async () => {
      await db.exec(`update company_messages set metadata=metadata-'roleMoveOutcome' where metadata ? 'approvedRoleMove';
      insert into talent_messages values(101,'${id(5)}','user',now());
      insert into company_talent_relays values('${id(33)}','${id(31)}','${id(11)}',101);
      insert into contact_queue(company_talent_relay_id,type,status) values('${id(33)}','company_contact_company_delivery','queued');`);
      assert.equal((await complete()).status, "state_changed");
      await db.exec(
        `update talent_opportunity_tag set updated_at=now()+interval '1 second'`
      );
      assert.equal((await complete(id(33))).status, "state_changed");
    }
  );
  await t.test(
    "a new company request after a reply supersedes the earlier authorization",
    async () => {
      assert.equal(
        (
          await move(
            "pending_connection",
            id(11),
            id(41),
            "pending_connection",
            "ask_candidate",
            false
          )
        ).status,
        "requested"
      );
      assert.equal((await complete(id(33))).status, "state_changed");
      await db.exec(`update contact_queue set status='sent',sent_at=now() where company_talent_request_id='${id(41)}';
        insert into talent_messages values(102,'${id(5)}','user',now());
        insert into company_talent_relays values('${id(34)}',null,'${id(11)}',102);
        insert into contact_queue(company_talent_relay_id,type,status) values('${id(34)}','company_contact_company_delivery','queued');`);
      assert.equal((await complete(id(34))).status, "moved");
    }
  );
  await t.test(
    "stale source state and test-only destinations are rejected",
    async () => {
      assert.equal(
        (await move("connected", id(11), id(14))).status,
        "state_changed"
      );
      await db.exec(
        `update company_roles set information='{"testOnly":true}' where role_id='${id(2)}'`
      );
      assert.equal(
        (await move("pending_connection", id(11), id(15))).status,
        "target_role_unavailable"
      );
    }
  );
});

test("Role move presentation follows actual stage", () => {
  assert.equal(candidateRoleMoveMode("company_intro"), "proposal");
  assert.equal(candidateRoleMoveMode("intro_requested"), "waiting");
  assert.equal(candidateRoleMoveMode("pending_connection"), "pending");
  assert.equal(candidateRoleMoveMode(`custom:${id(1)}`), "pipeline");
});
