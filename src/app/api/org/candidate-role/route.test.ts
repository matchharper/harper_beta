import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("Role moves enforce manage permission and access to both Roles before writing", async (t) => {
  const effects: string[] = [];
  let denied = "";
  let currentStage = "pending_connection";
  let previousResult: { status: string } | null = null;
  let lastRpc: Record<string, unknown> = {};
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
            data: {
              status: args.p_method === "ask_candidate" ? "requested" : "moved",
            },
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
    "@/lib/companyTalentRequests/copy": {
      generateCandidateContactDraft: async (args: {
        verifiedContext: string;
      }) => {
        effects.push("compose");
        assert.equal(
          JSON.parse(args.verifiedContext).proposedRole,
          "Platform engineer"
        );
        return {
          subject: "Role change",
          body: "Would you like to change roles?",
          requestContext: "Ask about the role change",
        };
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
  assert.deepEqual(await (await request(ask)).json(), { status: "requested" });
  assert.deepEqual(effects, [
    "manage_candidates",
    "source",
    "target",
    "conversation",
    "compose",
    "move",
  ]);
  assert.equal(lastRpc.p_body, "Would you like to change roles?");
  assert.equal(lastRpc.p_request_id, "request");
  assert.equal(lastRpc.p_confirmed_directly, false);

  effects.length = 0;
  previousResult = { status: "requested" };
  assert.deepEqual(await (await request(ask)).json(), previousResult);
  assert.equal(effects.includes("compose"), false);
  assert.equal(effects.includes("move"), false);

  effects.length = 0;
  previousResult = null;
  currentStage = "connected";
  assert.deepEqual(await (await request(ask)).json(), {
    status: "state_changed",
  });
  assert.equal(effects.includes("compose"), false);
  assert.equal(effects.includes("move"), false);
});
