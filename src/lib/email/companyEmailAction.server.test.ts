import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";

// A Pass or intro request from a mail button carries that mail's presentation
// (company_email_action_links.presentation_id) into the decision. Isolated
// dependencies; no database, mail or Harper run.
let link: Record<string, unknown> = {};
const decided: Array<{ kind: string; args: Record<string, unknown> }> = [];
const wakes: Array<Record<string, any>> = [];
const rows: Record<string, unknown> = {
  company_intro_candidates: { id: "card", role_id: "role", talent_id: "talent", status: "ready", recommendation_id: null,
    candidate_sent_at: null, presentation: { name: "김민준" } },
  company_users: { name: "김지수", email: "jisoo@example.com" },
  company_email_outbox: { delivery: { to: "jisoo@example.com" } },
};
const admin = {
  from(table: string) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      maybeSingle: async () => ({ data: table === "company_email_action_links" ? link : rows[table], error: null }),
    };
    return builder;
  },
  rpc: async (name: string, params: { p_result: unknown }) => {
    assert.equal(name, "finish_company_email_action_v1");
    return { data: { result: params.p_result }, error: null };
  },
};

let submitCompanyEmailAction: typeof import("./companyEmailAction.server").submitCompanyEmailAction;
before(async () => {
  const mod = Module as any, original = mod._load;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
    "@/lib/org/introBooking.server": { setOrgCandidateStageWithIntroBooking: async () => assert.fail("not a stage move") },
    "@/lib/org/server": {
      passOrgCompanyIntro: async (args: Record<string, unknown>) => {
        decided.push({ kind: "pass", args });
        return { ok: true, status: "passed", introCandidateId: "card" };
      },
      requestOrgCompanyIntro: async (args: Record<string, unknown>) => {
        decided.push({ kind: "request", args });
        return { ok: true, status: "requested", introCandidateId: "card" };
      },
    },
    "@/lib/siteUrl": { getConfiguredPublicSiteUrl: () => "https://example.invalid" },
    "@/lib/org/agent/webActionTurn": { enqueueOrgAgentWebActionTurn: async (args: Record<string, any>) => (wakes.push(args), { jobId: "job" }) },
    "@/lib/org/slackCandidateWorkObject.server": { loadSlackCandidateCards: async () => [] },
    "@/lib/org/workspaceLocale.server": { getOrgWorkspaceLocale: async () => "ko" },
  };
  mod._load = function (name: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
    if (name in mocks) return mocks[name];
    if (name === "./company" && parent?.filename?.endsWith("companyEmailAction.server.ts"))
      return { authorizeCompanyEmail: async () => ({ user: { id: "member" }, email: "jisoo@example.com" }) };
    return original.call(this, name, parent, ...rest);
  };
  ({ submitCompanyEmailAction } = await import("./companyEmailAction.server"));
});

const linkFor = (action: string, presentationId: string | null) => ({
  id: `link-${action}`, email_outbox_id: "mail", company_workspace_id: "workspace", company_user_id: "member",
  intro_candidate_id: "card", presentation_id: presentationId, action,
  expires_at: new Date(Date.now() + 60_000).toISOString(), used_at: null, result: null,
});

test("mail buttons decide on the mail's own presentation", async () => {
  decided.length = 0;
  link = linkFor("pass", "presentation-of-this-mail");
  const passed = await submitCompanyEmailAction("token", {}, "ko");
  assert.equal(passed.view.state, "used");
  link = linkFor("request_intro", "presentation-of-this-mail");
  await submitCompanyEmailAction("token", { appeal: "결제 경험" }, "ko");
  assert.deepEqual(decided.map(({ kind, args }) => [kind, args.channel, args.introCandidateId, args.presentationId]), [
    ["pass", "email", "card", "presentation-of-this-mail"],
    ["request", "email", "card", "presentation-of-this-mail"],
  ]);
  assert.equal(decided[1].args.companyAppeal, "결제 경험");
  assert.deepEqual(decided[1].args.introRecipientEmails, ["jisoo@example.com"]);
  // Harper's wake says the decision came from email (the mail page has no reason field).
  assert.deepEqual(wakes.map((wake) => [wake.actionContext.decision, wake.actionContext.channel, "reasonText" in wake.actionContext]), [
    ["pass", "email", false],
    ["request_intro", "email", false],
  ]);

  // A link saved before presentations existed has none; the decision then falls back as before.
  decided.length = 0;
  link = linkFor("pass", null);
  await submitCompanyEmailAction("token", {}, "ko");
  assert.equal(decided[0].args.presentationId, null);
});
