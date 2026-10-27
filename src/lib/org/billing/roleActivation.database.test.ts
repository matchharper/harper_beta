import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = (name: string) =>
  readFileSync(
    new URL(`../../../../supabase/migrations/${name}`, import.meta.url),
    "utf8"
  );
function functionSql(source: string, name: string) {
  const start = source
    .toLowerCase()
    .indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  const rest = source.slice(start);
  const delimiter = rest.match(/as\s+(\$function\$|\$\$)/i)![1];
  const opening = rest.indexOf(delimiter);
  const end =
    rest.indexOf(delimiter, opening + delimiter.length) + delimiter.length;
  return rest.slice(0, end) + ";";
}

test("actual billing triggers assign available slots atomically on activation, never during draft setup", async () => {
  const db = new PGlite();
  const workspace = "10000000-0000-4000-8000-000000000001";
  const role = (i: number) => `20000000-0000-4000-8000-00000000000${i}`;
  const slot = (i: number) => `30000000-0000-4000-8000-00000000000${i}`;
  try {
    await db.exec(`
      create table company_workspace(company_workspace_id uuid primary key,billing_started_at timestamptz,billing_model text);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean default false,expires_at timestamptz,information jsonb);
      create table company_internal_roles(role_id uuid,is_harper_tailored_role boolean default false);
      create table company_workspace_slots(id uuid primary key,company_workspace_id uuid,assigned_role_id uuid references company_roles,revision bigint default 0,started_at timestamptz default now(),cancel_at timestamptz,ended_at timestamptz);
      create table company_workspace_credit_periods(slot_id uuid,starts_at timestamptz,ends_at timestamptz,confirmed_at timestamptz);
      insert into company_workspace values ('${workspace}',now(),'standard');
    `);
    const terminology = migration(
      "20261007125852_workspace_billing_slot_terminology.sql"
    );
    await db.exec(functionSql(terminology, "workspace_billing_slot_active_v1"));
    await db.exec(
      functionSql(terminology, "workspace_billing_role_assignment_v1")
    );
    await db.exec(
      functionSql(
        migration(
          "20261027085423_preserve_active_roles_on_billing_reconcile.sql"
        ),
        "workspace_billing_role_guard_v1"
      )
    );
    await db.exec(`
      create trigger workspace_billing_role_guard before insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_guard_v1();
      create trigger workspace_billing_role_assignment after insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_assignment_v1();
    `);
    for (let i = 1; i <= 4; i++)
      await db.query(
        `insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','draft',$3)`,
        [
          role(i),
          workspace,
          { testOnly: true, testFixture: "slot-activation-local" },
        ]
      );
    for (let i = 1; i <= 2; i++) {
      await db.query(
        "insert into company_workspace_slots(id,company_workspace_id) values ($1,$2)",
        [slot(i), workspace]
      );
      await db.query(
        "insert into company_workspace_credit_periods values ($1,now()-interval '1 day',now()+interval '1 month',now())",
        [slot(i)]
      );
    }
    const assignments = () =>
      db.query<{ assigned_role_id: string | null; revision: number }>(
        "select assigned_role_id,revision::int from company_workspace_slots order by id"
      );
    assert.deepEqual(
      (await assignments()).rows.map((r) => r.assigned_role_id),
      [null, null]
    );
    await db.query(
      "update company_roles set status='active' where role_id=$1",
      [role(1)]
    );
    assert.deepEqual(
      (await assignments()).rows.map((r) => r.assigned_role_id),
      [role(1), null]
    );
    await db.query(
      "update company_roles set status='active' where role_id=$1",
      [role(1)]
    );
    assert.equal(
      (await assignments()).rows[0].revision,
      1,
      "repeated active save does not consume another slot"
    );
    await db.query(
      "update company_roles set status='active' where role_id=$1",
      [role(2)]
    );
    await db.query(
      "update company_roles set status='active' where role_id=$1",
      [role(3)]
    );
    assert.deepEqual(
      (await assignments()).rows.map((r) => r.assigned_role_id),
      [role(1), role(2)],
      "third Role uses Free without stealing a slot"
    );
    await assert.rejects(
      db.query("update company_roles set status='active' where role_id=$1", [
        role(4),
      ]),
      /workspace_role_capacity_exceeded/
    );
    await db.query(
      "update company_roles set status='paused' where role_id=$1",
      [role(1)]
    );
    await db.query(
      "update company_roles set status='active' where role_id=$1",
      [role(4)]
    );
    assert.deepEqual(
      (await assignments()).rows.map((r) => r.assigned_role_id),
      [role(4), role(2)],
      "newly activated Role immediately receives released slot"
    );
  } finally {
    await db.close();
  }
});
