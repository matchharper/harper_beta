import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

test("the matching tab and Brief editor share one fetch and refresh together after edits", async (t) => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://matching-query.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
  })) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture-token" } }, error: null }) as any);
  const requests: string[] = [];
  let revision = 1;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    assert.ok(path.startsWith("/api/org/role/matching-brief?"), "No separate flag or onboarding request");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-token");
    requests.push(path);
    return new Response(JSON.stringify({ structured: true, rubric: { summary: `Brief ${revision}` }, briefHash: String(revision), session: null }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const { roleMatchingBriefQueryOptions } = await import("./roleMatchingBriefQuery");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const options = roleMatchingBriefQueryOptions("workspace", "role");
  const tab = new QueryObserver(client, options);
  const unsubTab = tab.subscribe(() => {});
  t.after(() => { unsubTab(); client.clear(); });
  await client.fetchQuery(options);
  assert.equal(requests.length, 1);
  const editor = new QueryObserver(client, options);
  const unsubEditor = editor.subscribe(() => {});
  t.after(unsubEditor);
  await client.fetchQuery(options);
  assert.equal(requests.length, 1, "Mounting the editor after format detection must not fetch again");
  assert.equal(editor.getCurrentResult().data?.rubric?.summary, "Brief 1");

  revision = 2;
  await client.invalidateQueries({ queryKey: ["org", "role-rubric", "workspace", "role"] });
  assert.equal(requests.length, 2, "Board and Brief saves refresh both subscribers in one request");
  assert.equal(tab.getCurrentResult().data?.briefHash, "2");
  assert.equal(editor.getCurrentResult().data?.briefHash, "2");
  revision = 3;
  await client.invalidateQueries({ queryKey: ["org"] });
  assert.equal(requests.length, 3, "Chat completion refreshes the criteria too");
  assert.equal(editor.getCurrentResult().data?.briefHash, "3");
  await client.fetchQuery(options);
  assert.equal(requests.length, 3, "A recent tab revisit reuses the fresh Brief");
  await client.fetchQuery(roleMatchingBriefQueryOptions("workspace", "another-role"));
  await client.fetchQuery(roleMatchingBriefQueryOptions("another-workspace", "role"));
  assert.equal(requests.length, 5, "Roles and workspaces never share a Brief cache entry");
});
