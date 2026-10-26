import assert from "node:assert/strict";
import test from "node:test";
import { startSlackRoleCreation, slackRoleDraftId } from "./slackRoleCreation";

function fixture() {
  const copied: any[] = [], drafts: any[] = [], background: Array<() => Promise<unknown>> = [];
  let sessionExists = false, failPreparation = false;
  const source = [
    { id: 12, role: "user", content: "서울 하이브리드, 정규직. 연봉은 8천–1억이에요.", company_user_id: "author", metadata: {} },
    { id: 11, role: "user", content: "Backend Engineer를 채용하려고 해요. 첨부 JD를 바탕으로 준비해주세요.", company_user_id: "author",
      metadata: { slackFileAttachments: [{ kind: "file", name: "jd.txt", size: 120, text: "Python API 운영 경험은 필수, 결제 도메인은 우대.", truncated: false }] } },
  ];
  const state: any = { role: { name: "새 역할", status: "draft" }, metadata: {},
    conversation: { id: "draft-conversation", company_workspace_id: "workspace", metadata: {} } };
  const admin: any = { from: (table: string) => {
    assert.equal(table, "company_messages");
    const filters: Record<string, any> = {};
    const q: any = {
      select: () => q, eq: (key: string, value: any) => (filters[key] = value, q),
      lte: () => q, in: () => q, order: () => q,
      limit: async () => ({ data: source, error: null }),
      maybeSingle: async () => ({ data: copied.find(row => row.slackMessageTs === filters.slack_message_ts) ?? null, error: null }),
    };
    return q;
  } };
  const dependencies: any = {
    getSupabaseAdmin: () => admin,
    createOrResumeDraftRole: async ({ draftRoleId }: any) => draftRoleId,
    fetchRoleCreationState: async () => state,
    updateRoleCreationDraft: async (args: any) => { drafts.push(args); state.role.name = args.name; return state; },
    updateRoleCreationConversationMetadata: async ({ patch }: any) => { Object.assign(state.metadata, patch); state.conversation.metadata = state.metadata; },
    insertOrgAgentMessage: async (args: any) => { copied.push(args); return args; },
    beginRoleStartDraft: async () => {
      if (failPreparation) throw new Error("session write unavailable");
      sessionExists = true;
      return { session: { phase: "drafting" }, completion: Promise.resolve(null) };
    },
    after: (callback: () => Promise<unknown>) => background.push(callback),
  };
  const args: any = { actorLabel: "팀원", contextMessageCount: 2,
    execution: { sourceKey: "event:12", publicSiteUrl: "https://harper.example", slackUserId: "U1" },
    roleTitle: "Backend Engineer", draft: { description: "Python API를 운영해요.",
      request: "## Hard constraints\nPython API 운영 경험\n## Preferred criteria\n결제 도메인 경험",
      locationText: "서울", workMode: "hybrid", employmentTypes: ["full_time"], salaryRange: "8천–1억" },
    sourceConversation: { id: "source", company_workspace_id: "workspace" },
    sourceCurrentMessageId: 12, sourceSlackThreadId: "source-thread", user: { id: "author" }, workspaceId: "workspace" };
  return { args, dependencies, copied, drafts, state, background,
    hasSession: () => sessionExists, failPreparation: (value: boolean) => { failPreparation = value; } };
}

test("Slack saves grounded fields and original files before returning a web onboarding link", async () => {
  const f = fixture();
  const result = await startSlackRoleCreation(f.args, f.dependencies);
  assert.equal(new URL(result.webUrl).pathname, "/org/role");
  assert.equal(new URL(result.webUrl).searchParams.get("roleId"), result.roleId);
  assert.equal(f.hasSession(), true, "the destination owns a saved onboarding session before the link is returned");
  assert.equal(f.drafts[0].workMode, "hybrid");
  assert.equal(f.drafts[0].salaryRange, "8천–1억");
  assert.equal(f.drafts[0].source, "slack");
  assert.equal(f.copied[0].metadata.roleCreationAttachments[0].text, "Python API 운영 경험은 필수, 결제 도메인은 우대.");
  assert.equal(f.copied[1].content, f.args.sourceCurrentMessageId === 12 ? "서울 하이브리드, 정규직. 연봉은 8천–1억이에요." : "");
  assert.equal(f.state.role.status, "draft");
  assert.equal(f.background.length, 1);
  await f.background[0]();
});

test("retry preserves later edits and repairs onboarding without duplicating the Role or context", async () => {
  const f = fixture();
  f.failPreparation(true);
  await assert.rejects(startSlackRoleCreation(f.args, f.dependencies), /session write unavailable/);
  f.state.role.name = "Backend Lead";
  f.failPreparation(false);
  const result = await startSlackRoleCreation(f.args, f.dependencies);
  const retry = await startSlackRoleCreation(f.args, f.dependencies);
  assert.equal(result.roleId, retry.roleId);
  assert.equal(result.roleTitle, "Backend Lead");
  assert.equal(f.drafts.length, 1);
  assert.equal(f.copied.length, 2);
  assert.notEqual(result.roleId, slackRoleDraftId("workspace", "event:12", "Designer"));
});

test("source from a different workspace cannot create a draft", async () => {
  const f = fixture();
  f.args.sourceConversation.company_workspace_id = "other";
  await assert.rejects(startSlackRoleCreation(f.args, f.dependencies), /source thread is unavailable/);
  assert.equal(f.drafts.length, 0);
});
