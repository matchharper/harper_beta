import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("workspace deletion enforces ownership and billing, and deletes atomically within one workspace", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Minimal schema with the production CASCADE, RESTRICT, and SET NULL edges
  // that matter to deletion ordering. No production data or network access.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_db(id int primary key);
    create table company_users(user_id uuid primary key);
    create table talent_users(user_id uuid primary key);
    create table talent_messages(id int primary key, user_id uuid references talent_users);
    create table company_workspace(company_workspace_id uuid primary key,company_name text,stripe_customer_id text,billing_checkout jsonb,company_db_id int references company_db);
    create table company_user_workspace(company_workspace_id uuid references company_workspace on delete cascade,company_user_id uuid references company_users,authority text,primary key(company_workspace_id,company_user_id));
    create table company_workspace_teams(id int primary key,company_workspace_id uuid references company_workspace on delete cascade);
    create table company_roles(role_id int primary key,company_workspace_id uuid references company_workspace on delete cascade,information jsonb);
    create table company_internal_roles(role_id int references company_roles on delete cascade,team_id int references company_workspace_teams on delete restrict);
    create table company_roles_archive(role_id int,company_workspace_id uuid);
    create table company_snapshot(workspace_id uuid references company_workspace);
    create table company_conversations(id int primary key,company_workspace_id uuid references company_workspace on delete cascade,team_id int references company_workspace_teams on delete restrict);
    create table company_messages(id int primary key,company_workspace_id uuid references company_workspace on delete cascade,conversation_id int references company_conversations on delete cascade);
    create table company_slack_integrations(company_workspace_id uuid primary key references company_workspace on delete cascade);
    create table company_slack_channels(id int primary key,company_workspace_id uuid references company_slack_integrations on delete cascade);
    create table company_first_slack_outbox(company_workspace_id uuid references company_workspace on delete cascade,channel_id int references company_slack_channels on delete restrict);
    create table company_first_search_runs(id int primary key,company_workspace_id uuid references company_workspace on delete cascade,role_id int references company_roles on delete cascade);
    create table talent_opportunity_recommendation(id int primary key,role_id int references company_roles on delete cascade,talent_id uuid references talent_users);
    create table company_intro_candidates(company_workspace_id uuid references company_workspace on delete cascade,recommendation_id int references talent_opportunity_recommendation on delete restrict,selection_run_id int references company_first_search_runs on delete restrict);
    create table company_agent_web_action_jobs(id int primary key,company_workspace_id uuid references company_workspace on delete cascade);
    create table company_role_hiring_brief_history(company_workspace_id uuid references company_workspace on delete cascade,review_job_id int references company_agent_web_action_jobs);
    create table company_talent_requests(id int primary key,company_workspace_id uuid references company_workspace on delete cascade,source_company_message_id int references company_messages on delete restrict);
    create table company_talent_relays(id int primary key,company_talent_request_id int references company_talent_requests on delete set null,recommendation_id int references talent_opportunity_recommendation on delete restrict);
    create table contact_queue(id int primary key,role_id int references company_roles on delete set null,recommendation_id int references talent_opportunity_recommendation on delete set null,company_talent_request_id int references company_talent_requests on delete set null,company_talent_relay_id int references company_talent_relays on delete set null);
    create table meeting_schedules(id int primary key,company_workspace_id uuid references company_workspace on delete cascade,role_id int references company_roles on delete restrict,recommendation_id int references talent_opportunity_recommendation on delete restrict);
    create table meeting_schedule_rounds(schedule_id int references meeting_schedules on delete cascade,source_company_message_id int references company_messages on delete restrict,delivery_queue_id int references contact_queue on delete set null);
    create table company_workspace_slots(id int primary key,company_workspace_id uuid references company_workspace,stripe_subscription_id text,status text,billing_change jsonb,assigned_role_id int references company_roles);
    create table company_workspace_credit_periods(id int primary key,company_workspace_id uuid references company_workspace,slot_id int references company_workspace_slots);
    create table company_workspace_credit_events(company_workspace_id uuid references company_workspace,period_id int references company_workspace_credit_periods,role_id int references company_roles);
    create table company_workspace_invitations(company_workspace_id uuid references company_workspace on delete cascade);
    insert into company_db values (1);
    insert into company_users values ('${id(10)}'),('${id(11)}'),('${id(12)}'),('${id(13)}');
    insert into talent_users values ('${id(20)}');
    insert into talent_messages values (1,'${id(20)}');
  `);
  for (const n of [1, 2])
    await db.exec(`
    insert into company_workspace values ('${id(n)}','Workspace ${n}',null,null,1);
    insert into company_user_workspace values ('${id(n)}','${id(n === 1 ? 10 : 13)}','owner');
    insert into company_workspace_teams values (${n},'${id(n)}');
    insert into company_roles values (${n},'${id(n)}','{"testOnly":true,"testFixture":"workspace-deletion"}');
    insert into company_internal_roles values (${n},${n});
    insert into company_roles_archive values (${n},'${id(n)}');
    insert into company_snapshot values ('${id(n)}');
    insert into company_conversations values (${n},'${id(n)}',${n});
    insert into company_messages values (${n},'${id(n)}',${n});
    insert into company_slack_integrations values ('${id(n)}');
    insert into company_slack_channels values (${n},'${id(n)}');
    insert into company_first_slack_outbox values ('${id(n)}',${n});
    insert into company_first_search_runs values (${n},'${id(n)}',${n});
    insert into talent_opportunity_recommendation values (${n},${n},'${id(20)}');
    insert into company_intro_candidates values ('${id(n)}',${n},${n});
    insert into company_agent_web_action_jobs values (${n},'${id(n)}');
    insert into company_role_hiring_brief_history values ('${id(n)}',${n});
    insert into company_talent_requests values (${n},'${id(n)}',${n});
    insert into company_talent_relays values (${n},${n},${n});
    insert into contact_queue values (${n},${n},${n},${n},${n});
    insert into meeting_schedules values (${n},'${id(n)}',${n},${n});
    insert into meeting_schedule_rounds values (${n},${n},${n});
    insert into company_workspace_slots values (${n},'${id(n)}',null,'active',null,${n});
    insert into company_workspace_credit_periods values (${n},'${id(n)}',${n});
    insert into company_workspace_credit_events values ('${id(n)}',${n},${n});
    insert into company_workspace_invitations values ('${id(n)}');
  `);
  await db.exec(
    `insert into company_user_workspace values ('${id(1)}','${id(11)}','admin'),('${id(1)}','${id(12)}','viewer');`
  );
  await db.exec("grant delete on company_workspace to anon,authenticated");
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026065303_owner_workspace_deletion.sql",
      "utf8"
    )
  );
  const remove = (
    actor = id(10),
    name = "Workspace 1",
    customer: string | null = null,
    checkout: string | null = null
  ) =>
    db.query("select delete_company_workspace_v1($1,$2,$3,$4,$5)", [
      id(1),
      actor,
      name,
      customer,
      checkout,
    ]);

  await t.test("only service_role can execute the function", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(remove(), /permission denied/);
      await assert.rejects(
        db.exec("delete from company_workspace"),
        /permission denied/
      );
      await db.exec("reset role");
    }
  });
  await t.test(
    "rejects admins, viewers, strangers and another workspace's owner",
    async () => {
      for (const n of [11, 12, 13, 99])
        await assert.rejects(remove(id(n)), /workspace_delete_owner_required/);
      await assert.rejects(
        remove(id(10), "Wrong workspace"),
        /workspace_delete_name_mismatch/
      );
    }
  );
  await t.test(
    "active or pending billing blocks deletion, even with cancellation scheduled elsewhere",
    async () => {
      await db.exec(
        "update company_workspace_slots set stripe_subscription_id='sub_fixture' where id=1"
      );
      for (const status of [
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "incomplete",
        "paused",
      ]) {
        await db.query(
          "update company_workspace_slots set status=$1 where id=1",
          [status]
        );
        await assert.rejects(remove(), /workspace_delete_subscription_active/);
      }
      await db.exec(
        "update company_workspace_slots set status='canceled',billing_change='{}' where id=1"
      );
      await assert.rejects(remove(), /workspace_delete_billing_pending/);
      await db.exec(
        "update company_workspace_slots set billing_change=null where id=1"
      );
      await assert.rejects(
        remove(id(10), "Workspace 1", "new_customer"),
        /workspace_delete_billing_changed/
      );
      await assert.rejects(
        remove(id(10), "Workspace 1", null, '{"sessionId":"new_checkout"}'),
        /workspace_delete_billing_changed/
      );
    }
  );
  await t.test(
    "a later failure rolls back every earlier deletion",
    async () => {
      await db.exec(`create function block_fixture_delete() returns trigger language plpgsql as $$ begin raise exception 'fixture_failure'; end $$;
      create trigger fixture_failure before delete on company_workspace for each row execute function block_fixture_delete();`);
      await assert.rejects(remove(), /fixture_failure/);
      for (const table of [
        "company_roles",
        "company_workspace_slots",
        "company_messages",
        "contact_queue",
        "company_talent_relays",
      ]) {
        assert.equal(
          (await db.query(`select * from ${table}`)).rows.length,
          2,
          table
        );
      }
      await db.exec("drop trigger fixture_failure on company_workspace");
    }
  );
  await t.test(
    "owner deletes all owned data while preserving other workspaces and shared identities",
    async () => {
      await db.exec("set role service_role");
      await remove();
      await db.exec("reset role");
      const owned = await db.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname='public'"
      );
      const preserved = new Map([
        ["company_users", 4],
        ["company_db", 1],
        ["talent_users", 1],
        ["talent_messages", 1],
      ]);
      for (const { tablename } of owned.rows) {
        assert.equal(
          (await db.query(`select * from ${tablename}`)).rows.length,
          preserved.get(tablename) ?? 1,
          tablename
        );
      }
      assert.equal(
        (
          await db.query<{ company_workspace_id: string }>(
            "select company_workspace_id from company_workspace"
          )
        ).rows[0].company_workspace_id,
        id(2)
      );
      await assert.rejects(remove(), /workspace_delete_not_found/);
    }
  );
});
