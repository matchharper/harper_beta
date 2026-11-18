import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

// Staff (matchharper.com) workspace list: Harper-made workspaces plus any
// workspace someone has joined, e.g. a customer self-signup. Member-less rows
// Harper did not make (job ingestion) stay out. Runs the real Supabase client
// against a stubbed fetch so the PostgREST filter is checked as sent.

type Row = Record<string, unknown>;

async function runList(
  t: test.TestContext,
  tables: { company_workspace: Row[]; company_user_workspace: Row[] }
) {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://workspaces.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
    OPENAI_API_KEY: "fixture",
  })) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  const mod = Module as any;
  const load = mod._load;
  t.mock.method(mod, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "server-only") return {};
    return load.call(this, name, ...args);
  });
  const workspaceFilters: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://workspaces.invalid", "No production requests");
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/rest/v1/company_user_workspace") {
      return json(tables.company_user_workspace);
    }
    if (url.pathname === "/rest/v1/company_workspace") {
      const filter = url.searchParams.get("or") ?? "";
      workspaceFilters.push(filter);
      const inIds = filter.match(/company_workspace_id\.in\.\(([^)]*)\)/)?.[1].split(",") ?? [];
      return json(
        tables.company_workspace.filter(
          (row) =>
            (filter.includes("is_internal.eq.true") && row.is_internal === true) ||
            inIds.includes(String(row.company_workspace_id))
        )
      );
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  const { createClient } = await import("@supabase/supabase-js");
  const { fetchDefaultOrgWorkspaces } = await import("./server");
  const admin = createClient("https://workspaces.invalid", "fixture", {
    auth: { persistSession: false },
  });
  const rows = await fetchDefaultOrgWorkspaces(admin as any);
  return { ids: rows.map((row) => row.company_workspace_id), workspaceFilters };
}

test("staff list keeps Harper-made workspaces and adds self-signups, not member-less job rows", async (t) => {
  const { ids, workspaceFilters } = await runList(t, {
    company_workspace: [
      { company_workspace_id: "ws-internal-empty", company_name: "Endo Health", is_internal: true },
      { company_workspace_id: "ws-internal-member", company_name: "Aeolo", is_internal: true },
      { company_workspace_id: "ws-signup", company_name: "Endo Health", is_internal: false },
      { company_workspace_id: "ws-job-row", company_name: "Pendo.io", is_internal: false },
    ],
    company_user_workspace: [
      { company_workspace_id: "ws-internal-member" },
      { company_workspace_id: "ws-signup" },
      { company_workspace_id: "ws-signup" },
    ],
  });

  assert.deepEqual(
    new Set(ids),
    new Set(["ws-internal-empty", "ws-internal-member", "ws-signup"])
  );
  assert.deepEqual(workspaceFilters, [
    "(is_internal.eq.true,company_workspace_id.in.(ws-internal-member,ws-signup))",
  ]);
});

test("with no memberships the list is the Harper-made workspaces only", async (t) => {
  const { ids, workspaceFilters } = await runList(t, {
    company_workspace: [
      { company_workspace_id: "ws-internal", company_name: "Harper", is_internal: true },
      { company_workspace_id: "ws-job-row", company_name: "Pendo.io", is_internal: false },
    ],
    company_user_workspace: [],
  });

  assert.deepEqual(ids, ["ws-internal"]);
  assert.deepEqual(workspaceFilters, ["(is_internal.eq.true)"]);
});
