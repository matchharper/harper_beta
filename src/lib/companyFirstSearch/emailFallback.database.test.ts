import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../../../supabase/migrations/20261026054133_company_candidate_email_without_slack.sql", import.meta.url), "utf8");
const original = readFileSync(new URL("../../../supabase/migrations/20261023133155_company_candidate_email.sql", import.meta.url), "utf8");

test("Slack fallback preserves the opt-in and rechecks destinations and recipient access before sending", async () => {
  const db = new PGlite();
  const role = uuid(), sibling = uuid(), workspace = uuid(), user = uuid(), owner = uuid(), channel = uuid();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table company_roles(role_id uuid primary key, company_workspace_id uuid, source_type text,
        information jsonb default '{"testOnly":true,"testFixture":"candidate-email-fallback"}');
      create table company_internal_roles(role_id uuid primary key, team_id uuid, email_notifications_enabled boolean default false);
      create table company_slack_channels(id uuid, company_workspace_id uuid, slack_team_id text, is_enabled boolean);
      create table company_slack_integrations(company_workspace_id uuid, slack_team_id text, status text, bot_token_ciphertext text);
      create table company_role_notification_channels(role_id uuid, channel_id uuid);
      create table company_users(user_id uuid, email text, name text, locale text, email_preferences jsonb default '{}');
      create table auth.users(id uuid, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
      create table company_role_assignees(role_id uuid, company_user_id uuid);
      create table company_user_workspace(id uuid, company_workspace_id uuid, company_user_id uuid, authority text, access_scope text);
      create table company_workspace_teams(id uuid, company_workspace_id uuid, deleted_at timestamptz);
      create table company_workspace_team_members(membership_id uuid, team_id uuid);
      create table company_email_outbox(id uuid primary key, recipient_id uuid, topic text, lease_owner uuid, lease_until timestamptz,
        status text, snapshot jsonb, attempted_at timestamptz, delivery jsonb, last_error text);
      create table company_email_action_links(token_hash text, email_outbox_id uuid, company_workspace_id uuid,
        company_user_id uuid, intro_candidate_id uuid, action text, expires_at timestamptz);
      create table company_intro_candidates(id uuid, company_workspace_id uuid, role_id uuid);
      -- Unrelated scheduling/connection readers have their own fixtures. Execute the
      -- full migration, then exercise the routing and final-send functions below.
      set check_function_bodies = off;
    `);
    await db.exec(migration);
    await db.exec("set check_function_bodies = on");
    const start = original.indexOf("create or replace function public.company_role_email_recipients_v1(");
    await db.exec(original.slice(start, original.indexOf("$$;", start) + 3));
    await db.query("insert into company_roles(role_id, company_workspace_id, source_type) values ($1,$3,'internal'),($2,$3,'internal')", [role, sibling, workspace]);
    await db.query("insert into company_internal_roles(role_id) values ($1),($2)", [role, sibling]);
    await db.query("insert into company_users(user_id,email) values ($1,'assignee@example.invalid')", [user]);
    await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,'assignee@example.invalid',now())", [user]);
    await db.query("insert into company_user_workspace values ($1,$2,$3,'admin','organization')", [uuid(), workspace, user]);
    await db.query("insert into company_role_assignees values ($1,$2)", [role, user]);

    const enabled = async (id = role) => (await db.query<{ enabled: boolean }>(
      "select company_role_candidate_email_enabled_v1($1) as enabled", [id])).rows[0].enabled;
    const prepare = async (roleIds = [role]) => {
      const id = uuid();
      await db.query(`insert into company_email_outbox(id,recipient_id,topic,lease_owner,lease_until,status,snapshot)
        values ($1,$2,'candidate_digest',$3,now()+interval '10 minutes','processing',$4)`,
        [id, user, owner, JSON.stringify({ workspaceId: workspace, roleIds })]);
      const delivery = { to: "assignee@example.invalid", subject: "Candidates", text: "Candidate", html: "<p>Candidate</p>", idempotencyKey: `company-notice/${id}` };
      const result = await db.query<{ result: { status: string } }>(
        "select prepare_company_candidate_digest_send_v1($1,$2,$3,'[]') as result", [id, owner, JSON.stringify(delivery)]);
      return result.rows[0].result.status;
    };

    assert.equal(await enabled(), true, "no Slack uses email even with the stored switch off");
    assert.equal(await prepare(), "sending");
    assert.equal(await enabled(uuid()), false, "missing Role is not eligible");
    assert.equal(await prepare([role, sibling]), "cancelled", "fallback does not grant access to sibling Roles");
    await db.query("update company_users set email_preferences = '{\"candidate_digest\":false}' where user_id=$1", [user]);
    assert.equal(await prepare(), "cancelled", "personal email opt-out still applies");
    await db.query("update company_users set email_preferences='{}' where user_id=$1", [user]);

    await db.query("insert into company_slack_channels values ($1,$2,'T1',true)", [channel, workspace]);
    assert.equal(await enabled(), true, "channel without an active integration is not usable");
    await db.query("insert into company_slack_integrations values ($1,'T1','active','test-token')", [workspace]);
    assert.equal(await enabled(), false);
    assert.equal(await prepare(), "cancelled", "a newly connected channel is rechecked before sending");
    await db.query("update company_internal_roles set email_notifications_enabled=true where role_id=$1", [role]);
    assert.equal(await prepare(), "sending", "explicit opt-in still sends alongside Slack");
    await db.query("update company_internal_roles set email_notifications_enabled=false where role_id=$1", [role]);
    await db.query("insert into company_role_notification_channels values ($1,$2)", [role, channel]);
    assert.equal(await enabled(), true, "a Role opted out of its only Slack channel falls back to email");
    assert.equal(await enabled(sibling), false, "another Role still receives Slack");
    await db.exec("delete from company_role_notification_channels");
    for (const change of [
      "update company_slack_channels set is_enabled=false",
      "update company_slack_channels set is_enabled=true; update company_slack_integrations set status='revoked'",
      "update company_slack_integrations set status='active',bot_token_ciphertext=null",
      "update company_slack_integrations set bot_token_ciphertext='test-token',slack_team_id='T2'",
    ]) {
      await db.exec(change);
      assert.equal(await enabled(), true, change);
    }
    await db.exec("update company_slack_integrations set slack_team_id='T1'");
    assert.equal(await enabled(), false, "reconnection restores the stored email preference");
    const stored = await db.query<{ email_notifications_enabled: boolean }>("select email_notifications_enabled from company_internal_roles where role_id=$1", [role]);
    assert.equal(stored.rows[0].email_notifications_enabled, false);
    const permissions = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`select
      has_function_privilege('anon','company_role_candidate_email_enabled_v1(uuid)','execute') as anon,
      has_function_privilege('authenticated','company_role_candidate_email_enabled_v1(uuid)','execute') as authenticated,
      has_function_privilege('service_role','company_role_candidate_email_enabled_v1(uuid)','execute') as service`);
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service: true });
  } finally {
    await db.close();
  }
});
