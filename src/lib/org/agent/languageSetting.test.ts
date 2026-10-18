import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { updateCompanyLanguageSetting } from "./languageSetting";
import { COMPANY_LANGUAGE_SETTING_TOOL } from "./languageSettingContract";
import { OrgAgentToolInputError } from "./toolAvailability";

type Membership = { authority: string; access_scope: string; team_id: string | null };

function fakeAdmin(args: { membership: Membership | null; missingCompanyUser?: boolean; missingWorkspaceLocale?: boolean }) {
  const writes: { table: string; body: unknown; query: string }[] = [];
  const admin = createClient("https://language-setting.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1) ?? "";
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (table === "company_user_workspace") return json(args.membership ? [args.membership] : []);
    if (table === "company_workspace_teams") return json([{ id: "team-a", name: "Engineering" }]);
    if (init?.method !== "PATCH") throw new Error(`Unexpected request ${init?.method} ${url}`);
    const body = JSON.parse(String(init.body));
    writes.push({ table, body, query: url.searchParams.toString() });
    if (table === "company_workspace" && args.missingWorkspaceLocale)
      return json({ code: "PGRST204", details: null, hint: null, message: "Could not find the 'locale' column of 'company_workspace' in the schema cache" }, 400);
    if (table === "company_users" && args.missingCompanyUser)
      return json({ code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" }, 406);
    return json(body);
  } } });
  return { admin: admin as any, writes };
}

const user = { id: "user-a", email: "person@example.test" } as User;
const orgAdmin = { authority: "admin", access_scope: "organization", team_id: null };

test("language tool takes only ko or en for the member or the company", () => {
  const parameters = COMPANY_LANGUAGE_SETTING_TOOL.function.parameters;
  assert.deepEqual(parameters.required, ["language", "target"]);
  assert.deepEqual(parameters.properties.language.enum, ["ko", "en"]);
  assert.deepEqual(parameters.properties.target.enum, ["me", "company"]);
  assert.match(COMPANY_LANGUAGE_SETTING_TOOL.function.description, /Do not call for a request about this reply only/);
});

test("a team member saves their own reply language", async () => {
  const { admin, writes } = fakeAdmin({ membership: { authority: "viewer", access_scope: "organization", team_id: null } });
  const result = await updateCompanyLanguageSetting({ admin, user, workspaceId: "workspace-a", input: { language: "en", target: "me" } });
  assert.equal(result.status, "saved");
  assert.equal(result.replyLanguage, "English");
  assert.deepEqual(writes, [{ table: "company_users", body: { locale: "en" }, query: "user_id=eq.user-a&select=locale" }]);
});

test("an Owner or organization Admin saves the company language", async () => {
  for (const membership of [{ authority: "owner", access_scope: "team", team_id: "team-a" }, orgAdmin]) {
    const { admin, writes } = fakeAdmin({ membership });
    const result = await updateCompanyLanguageSetting({ admin, user, workspaceId: "workspace-a", input: { language: "ko", target: "company" } });
    assert.equal(result.status, "saved");
    assert.equal("replyLanguage" in result, false);
    assert.deepEqual(writes, [{ table: "company_workspace", body: { locale: "ko" }, query: "company_workspace_id=eq.workspace-a&select=locale" }]);
  }
});

test("a team-scoped Admin or a Viewer cannot change the company language", async () => {
  for (const membership of [{ authority: "admin", access_scope: "team", team_id: "team-a" }, { authority: "viewer", access_scope: "organization", team_id: null }]) {
    const { admin, writes } = fakeAdmin({ membership });
    await assert.rejects(
      updateCompanyLanguageSetting({ admin, user, workspaceId: "workspace-a", input: { language: "en", target: "company" } }),
      (error: unknown) => error instanceof OrgAgentToolInputError && /Only an Owner or an organization-wide Admin/.test(error.message)
    );
    assert.deepEqual(writes, []);
  }
});

test("unsupported values and a missing locale column save nothing", async () => {
  for (const input of [{ language: "ja", target: "me" }, { language: "en", target: "team" }, { language: "en" }]) {
    const { admin, writes } = fakeAdmin({ membership: orgAdmin });
    await assert.rejects(updateCompanyLanguageSetting({ admin, user, workspaceId: "workspace-a", input }), OrgAgentToolInputError);
    assert.deepEqual(writes, []);
  }
  const missingColumn = fakeAdmin({ membership: orgAdmin, missingWorkspaceLocale: true });
  await assert.rejects(
    updateCompanyLanguageSetting({ admin: missingColumn.admin, user, workspaceId: "workspace-a", input: { language: "ko", target: "company" } }),
    (error: unknown) => error instanceof OrgAgentToolInputError && /cannot be saved yet/.test(error.message)
  );
  const missingMember = fakeAdmin({ membership: orgAdmin, missingCompanyUser: true });
  await assert.rejects(
    updateCompanyLanguageSetting({ admin: missingMember.admin, user, workspaceId: "workspace-a", input: { language: "ko", target: "me" } }),
    (error: unknown) => error instanceof OrgAgentToolInputError && /no team member profile/.test(error.message)
  );
});

test("a non-member cannot save even their own language here", async () => {
  const { admin, writes } = fakeAdmin({ membership: null });
  await assert.rejects(updateCompanyLanguageSetting({ admin, user, workspaceId: "workspace-a", input: { language: "en", target: "me" } }));
  assert.deepEqual(writes, []);
});
