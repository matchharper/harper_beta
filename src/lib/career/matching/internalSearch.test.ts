import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("internal search executes with RPC pagination and forwards only eligible roles to evaluation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // The RPC owns LIMIT/OFFSET, matching public.execute_raw_sql. Execute the
  // actual tool SQL in PostgreSQL so a second LIMIT fails at the parser.
  await db.exec(`
    CREATE TABLE company_workspace(company_workspace_id uuid PRIMARY KEY,company_name text,published_name text);
    CREATE TABLE company_roles(role_id uuid PRIMARY KEY,company_workspace_id uuid,source_type text DEFAULT 'internal',status text DEFAULT 'active',is_expired boolean DEFAULT false,expires_at timestamptz,information jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
    CREATE TABLE talent_setting(user_id uuid,blocked_companies text[]);
    CREATE FUNCTION role_matching_slot_type_v1(uuid,timestamptz) RETURNS text LANGUAGE sql AS $$ SELECT 'free'::text $$;
  `);
  for (const [workspace, name] of [[1, "Allowed"], [2, "Blocked"]] as const)
    await db.query("INSERT INTO company_workspace VALUES($1,$2,$2)", [id(workspace), name]);
  await db.query("INSERT INTO talent_setting VALUES($1,ARRAY[' blocked '])", [id(99)]);
  for (let n = 10; n < 16; n++)
    await db.query("INSERT INTO company_roles(role_id,company_workspace_id,updated_at) VALUES($1,$2,'2026-11-01')", [id(n), id(n === 15 ? 2 : 1)]);
  await db.query("UPDATE company_roles SET information=$2::jsonb WHERE role_id=$1", [id(12), JSON.stringify({ testOnly: true })]);
  await db.query("UPDATE company_roles SET status='paused' WHERE role_id=$1", [id(13)]);
  await db.query("UPDATE company_roles SET is_expired=true WHERE role_id=$1", [id(14)]);
  const modules = Module as any;
  const original = modules._load;
  t.mock.method(modules, "_load", function (this: unknown, name: string, ...args: any[]) {
    if (name === "./internalEvaluation") return {
      requestInternalRoleEvaluation: async (input: any) => ({ roleIds: input.roleIds }),
    };
    return original.call(this, name, ...args);
  });
  t.mock.method(globalThis, "fetch", async () => { throw Error("Network forbidden"); });
  const { CAREER_MATCHING_TOOLS } = await import("./tools");
  const admin = {
    rpc: async (name: string, args: any) => {
      assert.equal(name, "set_timeout_and_execute_raw_sql");
      const result = await db.query(`${args.sql_query} LIMIT $1 OFFSET $2`, [args.limit_num, args.offset_num]);
      return { data: [result.rows], error: null };
    },
  };
  const search = (input: Record<string, unknown>) => CAREER_MATCHING_TOOLS.search_opportunities.execute!(
    { source: "internal", ...input }, { admin, userId: id(99), userMessageId: 1 } as any,
  );
  assert.deepEqual(await search({ evaluationLimit: 1 }), { roleIds: [id(10)] });
  assert.deepEqual(await search({ evaluationLimit: 20 }), { roleIds: [id(10), id(11)] });
  assert.deepEqual(await search({ companyWorkspaceId: id(2) }), { roleIds: [] });
});
