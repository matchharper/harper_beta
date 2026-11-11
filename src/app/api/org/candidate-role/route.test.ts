import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("Role moves enforce manage permission and access to both Roles before writing", async (t) => {
  const effects: string[] = [];
  let denied = "";
  let currentStage = "pending_connection";
  let previousResult: Record<string, unknown> | null = null;
  let lastRpc: Record<string, unknown> = {};
  let lastAgentMessage: Record<string, any> = {};
  let member = true;
  let sendFails = false;
  class OrgHttpError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  const stubs: Record<string, unknown> = {
    "@/lib/server/candidateAccess": {
      requireAuthenticatedUser: async () => ({ id: "actor" }),
      getSupabaseAdmin: () => ({
        from: (table: string) => {
          const query = {
            select: () => query,
            eq: () => query,
            contains: () => query,
            order: () => query,
            limit: () => query,
            maybeSingle: async () => ({
              data: previousResult
                ? { metadata: { roleMoveResult: previousResult } }
                : null,
              error: null,
            }),
            single: async () => ({
              data:
                table === "company_roles"
                  ? {
                      name: "Platform engineer",
                      description: "Build the platform",
                      status: "active",
                    }
                  : { setting_locale: "ko", preferred_locale: "ko" },
              error: null,
            }),
          };
          return query;
        },
        rpc: async (_name: string, args: Record<string, unknown>) => {
          effects.push("move");
          lastRpc = args;
          assert.equal(args.p_actor_id, "actor");
          return {
            data:
              args.p_method === "ask_candidate_agent"
                ? { status: "requested", sourceMessageId: 42, recommendationId: "rec" }
                : { status: "moved" },
            error: null,
          };
        },
      }),
    },
    "@/lib/org/server": {
      OrgHttpError,
      fetchOrgTalentDetail: async () => ({
        recommendation: { stage: currentStage },
        talent: { name: "Candidate" },
        workspace: { companyName: "Fixture company" },
        role: { name: "Backend engineer" },
      }),
      assertOrgWorkspacePermission: async ({
        permission,
      }: {
        permission: string;
      }) => {
        effects.push(permission);
        if (denied === permission) throw new OrgHttpError(403, "Forbidden");
      },
      assertOrgRoleAccess: async ({ roleId }: { roleId: string }) => {
        effects.push(roleId);
        if (denied === roleId) throw new OrgHttpError(403, "Forbidden");
      },
    },
    "@/lib/agentContacts/store": {
      agentContactDatabase: () => ({ query: async () => [] }),
      companyAgentContactMember: async () => {
        effects.push("member");
        return member ? { id: "membership" } : undefined;
      },
      sendAgentContact: async (args: Record<string, any>) => {
        effects.push("agent-message");
        lastAgentMessage = args;
        if (sendFails) throw new Error("mailbox unavailable");
        return { message: { id: "agent-message" }, reused: false };
      },
    },
    "@/lib/org/agent/store": {
      ensureOrgRoleCreationConversation: async () => {
        effects.push("conversation");
        return { conversation: { id: "conversation" } };
      },
    },
  };
  const modules = Module as unknown as {
    _load: (name: string, parent: unknown, main: boolean) => unknown;
  };
  const load = modules._load;
  t.mock.method(
    modules,
    "_load",
    function (name: string, parent: unknown, main: boolean) {
      return name in stubs
        ? stubs[name]
        : load.call(modules, name, parent, main);
    }
  );
  const { POST } = await import("./route");
  const request = (overrides: Record<string, unknown> = {}) =>
    POST(
      new NextRequest("http://localhost/api/org/candidate-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "workspace",
          sourceRoleId: "source",
          targetRoleId: "target",
          talentId: "talent",
          recommendationId: "rec",
          expectedStage: "pending_connection",
          targetStageId: "pending_connection",
          requestId: "request",
          method: "direct",
          confirmedDirectly: true,
          ...overrides,
        }),
      })
    );
  for (const boundary of ["manage_candidates", "source", "target"]) {
    denied = boundary;
    effects.length = 0;
    assert.equal((await request()).status, 403);
    assert.equal(effects.includes("move"), false);
    assert.equal(effects.includes("conversation"), false);
  }
  denied = "";
  effects.length = 0;
  assert.equal((await request()).status, 200);
  assert.deepEqual(effects, [
    "manage_candidates",
    "source",
    "target",
    "conversation",
    "move",
  ]);
  effects.length = 0;
  const ask = { method: "ask_candidate", confirmedDirectly: false };
  const requested = {
    status: "requested",
    sourceMessageId: 42,
    recommendationId: "rec",
    agentMessageId: "agent-message",
  };
  // The question goes to the candidate's agent; no email copy is composed.
  assert.deepEqual(await (await request(ask)).json(), requested);
  assert.deepEqual(effects, [
    "manage_candidates",
    "source",
    "target",
    "member",
    "conversation",
    "move",
    "agent-message",
  ]);
  assert.equal(lastRpc.p_method, "ask_candidate_agent");
  assert.equal(lastRpc.p_body, undefined);
  assert.equal(lastRpc.p_request_id, "request");
  assert.equal(lastRpc.p_confirmed_directly, false);
  assert.deepEqual(lastAgentMessage.source, {
    kind: "company",
    workspaceId: "workspace",
    userId: "actor",
    messageId: 42,
  });
  assert.equal(lastAgentMessage.operationKey, "org-web-role-move:actor:request");
  assert.equal(lastAgentMessage.recommendationId, "rec");
  assert.match(lastAgentMessage.message, /Platform engineer/);
  // An agreement moves nothing by itself: the team confirms (owner decision, review 2).
  assert.match(lastAgentMessage.message, /회사 팀이 확인한 뒤/);
  assert.equal(lastAgentMessage.request, undefined);

  // A retry after a lost response resends the same question idempotently and moves nothing.
  effects.length = 0;
  previousResult = { status: "requested", sourceMessageId: 42, recommendationId: "rec" };
  assert.deepEqual(await (await request(ask)).json(), requested);
  assert.equal(effects.includes("move"), false);
  assert.equal(effects.includes("agent-message"), true);

  // An older email question is returned as it was.
  effects.length = 0;
  previousResult = { status: "requested" };
  assert.deepEqual(await (await request(ask)).json(), previousResult);
  assert.equal(effects.includes("agent-message"), false);
  assert.equal(effects.includes("move"), false);

  // The send fails after the approval was stored: the retry with the same
  // request sends the question from the stored approval and stores nothing new.
  effects.length = 0;
  previousResult = null;
  sendFails = true;
  assert.equal((await request(ask)).status, 500);
  assert.deepEqual(effects.slice(-2), ["move", "agent-message"]);
  effects.length = 0;
  sendFails = false;
  previousResult = { status: "requested", sourceMessageId: 42, recommendationId: "rec" };
  assert.deepEqual(await (await request(ask)).json(), requested);
  assert.equal(effects.includes("move"), false);
  assert.equal(lastAgentMessage.operationKey, "org-web-role-move:actor:request");

  // Without a company membership (an internal full-access user) nothing is stored or sent.
  effects.length = 0;
  previousResult = null;
  member = false;
  assert.deepEqual(await (await request(ask)).json(), { status: "company_member_required" });
  assert.deepEqual(effects, ["manage_candidates", "source", "target", "member"]);
  // A direct move does not send as the company and is unaffected.
  effects.length = 0;
  assert.equal((await request()).status, 200);
  assert.equal(effects.includes("member"), false);
  assert.equal(effects.includes("move"), true);
  member = true;

  effects.length = 0;
  previousResult = null;
  currentStage = "connected";
  assert.deepEqual(await (await request(ask)).json(), {
    status: "state_changed",
  });
  assert.equal(effects.includes("agent-message"), false);
  assert.equal(effects.includes("move"), false);
});
