import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("notification receipt and Ops payment log are atomic, unique and server-only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.company_workspace(company_workspace_id uuid primary key);
      create table public.logs(id bigint generated always as identity primary key, type text, meta_data jsonb);
      grant insert on public.logs to service_role;
      grant usage on sequence public.logs_id_seq to service_role;
      insert into public.company_workspace values ('00000000-0000-4000-8000-000000000001');
    `);
    await db.exec(
      readFileSync(
        new URL(
          "../../../../supabase/migrations/20261027065145_company_billing_notifications.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    await db.exec(`set role service_role`);
    const insert = `insert into public.company_billing_notifications(id, company_workspace_id, event_type, facts)
      values ('invoice:fixture:paid', '00000000-0000-4000-8000-000000000001', 'paid', '{"workspaceId":"00000000-0000-4000-8000-000000000001","amount":24900}') on conflict(id) do nothing`;
    await db.exec(insert);
    await db.exec(insert);
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select type, meta_data->>'source' as source from logs"))
        .rows,
      [{ type: "org_billing_payment_paid", source: "stripe_webhook" }]
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from company_billing_notifications"
        )
      ).rows[0].count,
      1
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from company_billing_notifications"),
        /permission denied/
      );
      await assert.rejects(db.exec(insert), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
