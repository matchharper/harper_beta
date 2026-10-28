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
  return (
    rest.slice(
      0,
      rest.indexOf(delimiter, opening + delimiter.length) + delimiter.length
    ) + ";"
  );
}

test("one Free Role is automatic, multiple Roles await choice, and activation/expiry keep their assignment behavior", async () => {
  const db = new PGlite();
  const workspace = "10000000-0000-4000-8000-000000000001";
  const role = (i: number) => `20000000-0000-4000-8000-00000000000${i}`;
  const slot = (i: number) => `30000000-0000-4000-8000-00000000000${i}`;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_workspace(company_workspace_id uuid primary key,billing_started_at timestamptz,billing_reconciled_at timestamptz,billing_model text);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean default false,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,information jsonb);
      create table company_internal_roles(role_id uuid,is_harper_tailored_role boolean default false);
      create table company_workspace_slots(id uuid primary key,company_workspace_id uuid,assigned_role_id uuid unique references company_roles,revision bigint default 0,started_at timestamptz default now(),cancel_at timestamptz,ended_at timestamptz);
      create table company_workspace_credit_periods(slot_id uuid,company_workspace_id uuid,starts_at timestamptz,ends_at timestamptz,confirmed_at timestamptz);
      insert into company_workspace values ('${workspace}',now(),now(),'standard');
    `);
    const terminology = migration(
      "20261007125852_workspace_billing_slot_terminology.sql"
    );
    const free = migration(
      "20261022071755_restore_free_intros_and_single_active_role.sql"
    );
    for (const name of [
      "workspace_billing_slot_active_v1",
      "workspace_billing_reconcile_v1",
      "workspace_billing_role_assignment_v1",
    ])
      await db.exec(functionSql(terminology, name));
    for (const name of [
      "workspace_billing_role_guard_v1",
      "workspace_billing_assign_slot_v1",
    ])
      await db.exec(functionSql(free, name));
    await db.exec(
      migration("20261027072209_choose_role_after_slot_purchase.sql")
    );
    await db.exec(
      migration("20261027075814_preserve_slot_assignment_choice_capacity.sql")
    );
    await db.exec(
      migration("20261027085423_preserve_active_roles_on_billing_reconcile.sql")
    );
    await db.exec(`
      create trigger workspace_billing_role_guard before insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_guard_v1();
      create trigger workspace_billing_role_assignment after insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_assignment_v1();
    `);
    for (let i = 1; i <= 3; i++)
      await db.query(
        "insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','draft',$3)",
        [
          role(i),
          workspace,
          { testOnly: true, testFixture: "slot-purchase-choice-local" },
        ]
      );
    const activate = (i: number) =>
      db.query("update company_roles set status='active' where role_id=$1", [
        role(i),
      ]);
    const purchase = async (i: number) => {
      await db.query(
        "insert into company_workspace_slots(id,company_workspace_id) values ($1,$2)",
        [slot(i), workspace]
      );
      await db.query(
        "insert into company_workspace_credit_periods values ($1,$2,now()-interval '1 day',now()+interval '1 month',now())",
        [slot(i), workspace]
      );
    };
    const reconcile = () =>
      db.query("select workspace_billing_reconcile_v1($1)", [workspace]);
    const assignments = async () =>
      (
        await db.query<{ assigned_role_id: string | null }>(
          "select assigned_role_id from company_workspace_slots order by id"
        )
      ).rows.map((r) => r.assigned_role_id);

    await activate(1); // The existing Free Role, before the purchase.
    await purchase(1);
    await purchase(2);
    await reconcile();
    await reconcile();
    await activate(1); // An unchanged active status is a save, not a new start.
    assert.deepEqual(
      await assignments(),
      [role(1), null],
      "the only Free Role is assigned automatically, even when multiple slots were purchased"
    );
    await db.query("select workspace_billing_assign_slot_v1($1,$2,$3,0)", [
      workspace,
      slot(2),
      role(1),
    ]);
    assert.deepEqual(
      await assignments(),
      [null, role(1)],
      "the selected Role receives the chosen purchased slot"
    );
    await assert.rejects(
      db.query("select workspace_billing_assign_slot_v1($1,$2,$3,0)", [
        workspace,
        slot(2),
        role(1),
      ]),
      /billing_assignment_conflict/
    );
    await activate(2);
    await activate(3);
    await reconcile();
    assert.deepEqual(
      await assignments(),
      [role(2), role(1)],
      "new hiring still consumes an available slot atomically"
    );
    await purchase(3);
    await purchase(4);
    await reconcile();
    assert.deepEqual(await assignments(), [role(2), role(1), role(3), null]);

    await db.query(
      "update company_workspace_slots set ended_at=clock_timestamp()-interval '1 second' where id=$1",
      [slot(2)]
    );
    await reconcile();
    assert.deepEqual(
      await assignments(),
      [role(2), null, role(3), role(1)],
      "an expired paid slot recovers onto an available slot"
    );
    await db.query(
      "update company_workspace_slots set ended_at=clock_timestamp()-interval '1 second' where id in ($1,$2)",
      [slot(3), slot(4)]
    );
    await reconcile();
    const statuses = (
      await db.query<{ status: string }>(
        "select status from company_roles order by role_id"
      )
    ).rows.map((r) => r.status);
    assert.deepEqual(
      statuses,
      ["active", "active", "active"],
      "slot expiry never pauses Roles that are already active"
    );
    const privilege = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','workspace_billing_reconcile_at_v1(uuid,timestamptz)','execute') as allowed"
    );
    assert.equal(privilege.rows[0].allowed, false);

    // Existing legacy workspaces can have multiple active unassigned Roles.
    // Test-only fixtures are marked before insertion, then enroll with capacity.
    const otherWorkspace = "10000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into company_workspace values ($1,null,null,'legacy')",
      [otherWorkspace]
    );
    for (let i = 4; i <= 6; i++) {
      await db.query(
        "insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','active',$3)",
        [
          role(i),
          otherWorkspace,
          { testOnly: true, testFixture: "multiple-slot-role-choices-local" },
        ]
      );
      await db.query(
        "insert into company_workspace_slots(id,company_workspace_id) values ($1,$2)",
        [slot(i + 1), otherWorkspace]
      );
      await db.query(
        "insert into company_workspace_credit_periods values ($1,$2,now()-interval '1 day',now()+interval '1 month',now())",
        [slot(i + 1), otherWorkspace]
      );
    }
    await db.query(
      "update company_workspace set billing_started_at=now(),billing_reconciled_at=now(),billing_model='standard' where company_workspace_id=$1",
      [otherWorkspace]
    );
    await db.query("select workspace_billing_reconcile_v1($1)", [
      otherWorkspace,
    ]);
    await db.query("select workspace_billing_reconcile_v1($1)", [
      otherWorkspace,
    ]);
    await activate(4);
    assert.deepEqual(
      (await assignments()).slice(-3),
      [null, null, null],
      "multiple eligible Roles remain unassigned across refreshes and unchanged saves"
    );
    await db.query("select workspace_billing_assign_slot_v1($1,$2,$3,0)", [
      otherWorkspace,
      slot(5),
      role(6),
    ]);
    assert.deepEqual(
      (await assignments()).slice(-3),
      [role(6), null, null],
      "the user's choice is respected"
    );
    await db.query("select workspace_billing_reconcile_v1($1)", [
      otherWorkspace,
    ]);
    assert.deepEqual(
      (await assignments()).slice(-3),
      [role(6), null, null],
      "two remaining choices stay open after the first assignment"
    );
    await db.query("select workspace_billing_assign_slot_v1($1,$2,$3,0)", [
      otherWorkspace,
      slot(6),
      role(4),
    ]);
    await db.query("select workspace_billing_reconcile_v1($1)", [
      otherWorkspace,
    ]);
    assert.deepEqual(
      (await assignments()).slice(-3),
      [role(6), role(4), role(5)],
      "a single remaining choice is assigned automatically"
    );
    for (let i = 7; i <= 8; i++) {
      await db.query(
        "insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','draft',$3)",
        [
          role(i),
          otherWorkspace,
          { testOnly: true, testFixture: "slot-choice-capacity-local" },
        ]
      );
    }
    await db.query("insert into company_internal_roles values ($1,true)", [
      role(8),
    ]);
    await activate(7);
    await activate(8);
    await db.query("select workspace_billing_assign_slot_v1($1,$2,$3,1)", [
      otherWorkspace,
      slot(5),
      role(8),
    ]);
    await db.query("select workspace_billing_reconcile_v1($1)", [otherWorkspace]);
    assert.equal(
      (await db.query<{ count: number }>("select count(*)::int as count from company_roles where company_workspace_id=$1 and status='active'", [otherWorkspace])).rows[0].count,
      5,
      "slot reassignment preserves all existing active Roles, including a contract Role"
    );
  } finally {
    await db.close();
  }
});

test("existing excess Free Roles survive rollout and reconciliation; only entering the active set checks capacity", async () => {
  const db = new PGlite();
  const workspace = "10000000-0000-4000-8000-000000000001";
  const role = (i: number) => `20000000-0000-4000-8000-00000000000${i}`;
  const fixture = { testOnly: true, testFixture: "preserve-existing-free-roles-local" };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_workspace(company_workspace_id uuid primary key,billing_started_at timestamptz,billing_reconciled_at timestamptz,billing_model text);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean default false,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,information jsonb);
      create table company_internal_roles(role_id uuid,is_harper_tailored_role boolean default false);
      create table company_workspace_slots(id uuid primary key,company_workspace_id uuid,assigned_role_id uuid unique references company_roles,revision bigint default 0,started_at timestamptz default now(),cancel_at timestamptz,ended_at timestamptz);
      create table company_workspace_credit_periods(slot_id uuid,company_workspace_id uuid,starts_at timestamptz,ends_at timestamptz,confirmed_at timestamptz);
      insert into company_workspace values ('${workspace}',now(),now(),'standard');
    `);
    // Simulate existing data before installing the policy change.
    for (let i = 1; i <= 2; i++) {
      await db.query("insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','active',$3)", [role(i), workspace, fixture]);
    }
    const before = (await db.query("select * from company_roles order by role_id")).rows;
    const terminology = migration("20261007125852_workspace_billing_slot_terminology.sql");
    for (const name of ["workspace_billing_slot_active_v1", "workspace_billing_reconcile_v1"])
      await db.exec(functionSql(terminology, name));
    await db.exec(functionSql(migration("20261027072209_choose_role_after_slot_purchase.sql"), "workspace_billing_role_assignment_v1"));
    await db.exec(migration("20261027085423_preserve_active_roles_on_billing_reconcile.sql"));
    await db.exec(`
      create trigger workspace_billing_role_guard before insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_guard_v1();
      create trigger workspace_billing_role_assignment after insert or update of status,is_expired,expires_at on company_roles for each row execute function workspace_billing_role_assignment_v1();
    `);
    assert.deepEqual((await db.query("select * from company_roles order by role_id")).rows, before, "migration does not rewrite existing Roles");
    for (let i = 0; i < 3; i++) await db.query("select workspace_billing_reconcile_v1($1)", [workspace]);
    assert.deepEqual((await db.query("select * from company_roles order by role_id")).rows, before, "repeated billing reads and scheduled reconciliation preserve existing excess Roles");
    await db.query("update company_roles set status='top_priority',is_expired=false,expires_at=now()+interval '1 month' where role_id=$1", [role(1)]);
    await db.query("update company_roles set status='open' where role_id=$1", [role(2)]);
    await db.query("insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','draft',$3)", [role(3), workspace, fixture]);
    const activate = (i: number) => db.query("update company_roles set status='active' where role_id=$1", [role(i)]);
    await assert.rejects(activate(3), /workspace_role_capacity_exceeded/, "new activation is blocked while existing Free Roles use the capacity");
    await assert.rejects(db.query("insert into company_roles(role_id,company_workspace_id,source_type,status,information) values ($1,$2,'internal','active',$3)", [role(4), workspace, fixture]), /workspace_role_capacity_exceeded/, "inserting directly as active uses the same limit");
    await db.query("update company_roles set status='paused' where role_id=$1", [role(1)]);
    await assert.rejects(activate(1), /workspace_role_capacity_exceeded/, "a paused Role does not retain a grandfathered reactivation entitlement");
    await db.query("update company_roles set expires_at=now()-interval '1 day' where role_id=$1", [role(2)]);
    await activate(1);
    await assert.rejects(db.query("update company_roles set expires_at=null where role_id=$1", [role(2)]), /workspace_role_capacity_exceeded/, "restoring an expired Role is a new activation");
    await db.query("update company_roles set expires_at=null,is_expired=true where role_id=$1", [role(2)]);
    await assert.rejects(db.query("update company_roles set is_expired=false where role_id=$1", [role(2)]), /workspace_role_capacity_exceeded/);
    await db.query("update company_roles set status='paused' where role_id=$1", [role(1)]);
    await activate(3);
    assert.equal((await db.query<{ status: string }>("select status from company_roles where role_id=$1", [role(3)])).rows[0].status, "active", "activation succeeds after capacity is released");
    for (const fn of ["workspace_billing_role_guard_v1()", "workspace_billing_reconcile_at_v1(uuid,timestamptz)", "workspace_billing_assign_slot_v1(uuid,uuid,uuid,bigint)"]) {
      const access = await db.query<{ anon: boolean; authenticated: boolean }>("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated", [fn]);
      assert.deepEqual(access.rows[0], { anon: false, authenticated: false });
    }
  } finally { await db.close(); }
});
