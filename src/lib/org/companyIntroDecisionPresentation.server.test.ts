import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { User } from "@supabase/supabase-js";

// Pass and intro request record what they were made on only when the caller
// knows it (a mail button): then the _with_presentation function is called
// with p_presentation_id, otherwise v2 exactly as before. Supabase requests
// are answered here; nothing leaves the process.
test("a known presentation goes to the _with_presentation functions; otherwise v2 is called unchanged", async (t) => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://decisions.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
    OPENAI_API_KEY: "unused-fixture-key",
  })) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const rpcCalls: Array<{ name: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://decisions.invalid", "No real requests");
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    const accept = new Headers(init?.headers).get("Accept") ?? "";
    const reply = (row: unknown) => json(accept.includes("vnd.pgrst.object") ? row : [row]);
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.slice("/rest/v1/rpc/".length);
      rpcCalls.push({ name, body: JSON.parse(String(init?.body ?? "{}")) });
      return json({ status: name.startsWith("pass") ? "passed" : "requested", introCandidateId: "card" });
    }
    switch (url.pathname) {
      case "/rest/v1/company_workspace": return reply({ company_workspace_id: "workspace", is_reviewing: false, company_name: "Company" });
      case "/rest/v1/company_user_workspace":
        return reply({ authority: "owner", access_scope: "organization", team_id: null, company_workspace_team_members: [] });
      case "/rest/v1/company_users":
        return reply({ user_id: "member", email: "member@example.com", name: "Member", profile_picture: null, is_authenticated: true });
      case "/rest/v1/company_intro_candidates": return reply({ role_id: "role" });
      case "/rest/v1/company_roles":
        return json([{ role_id: "role", company_workspace_id: "workspace", name: "Engineer", status: "active", source_type: "internal",
          company_internal_roles: { is_harper_tailored_role: true }, company_role_assignees: [] }]);
      case "/rest/v1/logs": return new Response(null, { status: 204 });
    }
    assert.fail(`Unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
  });
  const mod = Module as any, original = mod._load;
  t.mock.method(mod, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "server-only") return {};
    return original.call(this, name, ...args);
  });
  const { passOrgCompanyIntro, requestOrgCompanyIntro } = await import("./server");
  const user = { id: "member", email: "member@example.com", user_metadata: { name: "Member" } } as unknown as User;
  const base = { introCandidateId: "card", user, workspaceId: "workspace" };

  await passOrgCompanyIntro({ ...base, channel: "email", presentationId: "this-mail" });
  await passOrgCompanyIntro({ ...base, channel: "web", reason: "" });
  await requestOrgCompanyIntro({ ...base, channel: "email", companyAppeal: "결제 경험",
    introRecipientEmails: ["member@example.com"], presentationId: "this-mail" });
  await requestOrgCompanyIntro({ ...base, channel: "chat", companyAppeal: "결제 경험",
    introRecipientEmails: ["member@example.com"], sourceMessageId: 7 });

  assert.deepEqual(rpcCalls.map((call) => [call.name, call.body.p_channel, call.body.p_presentation_id]), [
    ["pass_company_intro_with_presentation_v1", "email", "this-mail"],
    ["pass_company_intro_v3", "web", undefined],
    ["request_company_intro_for_career_with_presentation_v1", "email", "this-mail"],
    ["request_company_intro_for_career_v1", "chat", undefined],
  ]);
  // The rest of each call is what v2/v3 always received; reason tags go only to v3.
  assert.deepEqual(Object.keys(rpcCalls[0].body).sort(), ["p_channel", "p_company_user_id", "p_company_workspace_id",
    "p_intro_candidate_id", "p_presentation_id", "p_reason_text", "p_source_message_id"]);
  assert.deepEqual(Object.keys(rpcCalls[1].body).sort(), ["p_channel", "p_company_user_id", "p_company_workspace_id",
    "p_intro_candidate_id", "p_reason_tags", "p_reason_text", "p_source_message_id"]);
  assert.deepEqual(rpcCalls[2].body, {
    p_channel: "email", p_company_appeal: "결제 경험", p_company_user_id: "member", p_company_workspace_id: "workspace",
    p_intro_candidate_id: "card", p_intro_recipient_emails: ["member@example.com"], p_next_stage_id: null,
    p_source_message_id: null, p_presentation_id: "this-mail",
  });
  assert.equal(rpcCalls[3].body.p_source_message_id, 7);
});
