import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("onboarding completion waits for Slack delivery and only welcomes the request that completes it", async context => {
  const workspaceId = "workspace";
  const user = { id: "teammate", email: "teammate@example.invalid" };
  let completedAt: string | null = null;
  let isReviewing = false;
  let winsUpdate = true;
  let accessibleWorkspace = workspaceId;
  let slackUrl: string | null = "https://example.invalid/slack-thread";
  let finishDelivery: (() => void) | undefined;
  let holdDelivery = false;
  const effects: string[] = [];
  const admin = { from: () => {
    let updating = false;
    const query: any = {
      update: () => { updating = true; return query; },
      eq: () => query, is: () => query, select: () => query,
      single: async () => ({ data: { onboarding_completed_at: "already-completed" }, error: null }),
      then: (resolve: any, reject: any) => {
        if (updating) effects.push("save");
        return Promise.resolve({ data: winsUpdate ? [{ user_id: user.id }] : [], error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  class OrgHttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  const stubs: Record<string, unknown> = {
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin, requireAuthenticatedUser: async () => user },
    "@/lib/org/server": {
      OrgHttpError,
      fetchOrgBootstrap: async () => ({ currentUser: { name: "Alex", role: "Engineer", onboardingCompletedAt: completedAt }, workspace: { workspaceId: accessibleWorkspace, signupState: null, isReviewing }, roles: [], members: [] }),
    },
    "@/lib/org/agent/chat": {},
    "@/lib/org/agent/onboardingPrompt": {},
    "@/lib/org/signupServer": {},
    "@/lib/org/signup": {
      isAdditionalOrgCreator: () => false,
      isOrgOnboardingComplete: (_signup: unknown, member: { onboardingCompletedAt?: string }) => Boolean(member.onboardingCompletedAt),
    },
    "@/lib/org/onboardingSlack.server": { sendOrgOnboardingSlackWelcome: async () => {
      effects.push("welcome");
      if (holdDelivery) await new Promise<void>(resolve => { finishDelivery = resolve; });
      return slackUrl;
    } },
  };
  const nodeModule = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = nodeModule._load;
  context.mock.method(nodeModule, "_load", function (this: typeof nodeModule, request: string, parent: unknown, isMain: boolean) {
    return request in stubs ? stubs[request] : originalLoad.call(this, request, parent, isMain);
  });
  const { POST } = await import("./route");
  const request = (responseLocale = "en") => POST(new NextRequest("https://example.invalid/api/org/onboarding", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, action: "complete", responseLocale }),
  }));

  await context.test("completion is saved before the welcome, and the response waits for the thread", async () => {
    holdDelivery = true;
    let responded = false;
    const pending = request().then(response => { responded = true; return response; });
    while (!finishDelivery) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(effects, ["save", "welcome"]);
    assert.equal(responded, false);
    finishDelivery();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal((await response.json()).slackUrl, slackUrl);
    holdDelivery = false;
  });
  await context.test("no destination still completes onboarding", async () => {
    effects.length = 0;
    slackUrl = null;
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).slackUrl, null);
    assert.deepEqual(effects, ["save", "welcome"]);
  });
  await context.test("an already-completed teammate is not welcomed again", async () => {
    effects.length = 0;
    completedAt = "already-completed";
    assert.equal((await request()).status, 200);
    assert.deepEqual(effects, []);
    completedAt = null;
  });
  await context.test("a reviewed workspace completes onboarding without any Slack delivery", async () => {
    effects.length = 0;
    isReviewing = true;
    slackUrl = "https://example.invalid/existing-channel";
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).slackUrl, null);
    assert.deepEqual(effects, ["save"]);
    isReviewing = false;
  });
  await context.test("a concurrent request that lost the existing completion update does not send another welcome", async () => {
    effects.length = 0;
    winsUpdate = false;
    assert.equal((await request()).status, 200);
    assert.deepEqual(effects, ["save"]);
    winsUpdate = true;
  });
  await context.test("invalid locale and inaccessible workspace do not save or send", async () => {
    effects.length = 0;
    assert.equal((await request("invalid")).status, 400);
    accessibleWorkspace = "another-workspace";
    assert.equal((await request()).status, 403);
    assert.deepEqual(effects, []);
  });
});
