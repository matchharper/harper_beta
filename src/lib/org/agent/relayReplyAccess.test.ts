import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { OrgHttpError } from "../httpError";

// Run the production handler with isolated adapters: no DB, model or delivery.
function load(file: string, dependencies: Record<string, unknown>, extra = "") {
  const source = readFileSync(new URL(file, import.meta.url), "utf8") + extra;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    console,
    Error,
    require: (name: string) => dependencies[name] ?? {},
  });
  return module.exports;
}

test("historical relay replies require current Role access without a profile-opening paywall", async () => {
  let roleAllowed = true;
  let sends = 0;
  const target = {
    roleId: "role",
    roleName: "Backend",
    talentId: "talent",
    candidateName: "PRIVATE NAME",
    candidateEmail: "private@example.invalid",
  };
  const handler = load(
    "./toolExecution.ts",
    {
      "@/lib/org/teamAccess": {
        assertOrgTeamRoleAccess: async () => {
          if (!roleAllowed) throw new OrgHttpError(404, "Role not found");
        },
      },
      "@/lib/org/agent/toolAvailability": {
        OrgAgentToolInputError: class extends Error {},
      },
      "@/lib/companyTalentRequests/server": {
        fetchCompanyTalentRelayReplyTarget: async () => target,
        sendCompanyTalentRelayReply: async () => {
          sends++;
          return { status: "sent", requestId: "request" };
        },
      },
      "@/lib/companyTalentRequests/directMessage": {
        prepareDirectCandidateMessage: () => ({
          subject: "Approved question",
          body: "Approved content",
          requestContext: "Authorized reply",
        }),
      },
      "@/lib/career/promptLocale": { parseCareerPromptLocale: () => null },
    },
    "\nexport { executeCandidateContactLifecycleItem };"
  ).executeCandidateContactLifecycleItem;
  const args = () => ({
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    },
    user: { id: "actor" },
    workspaceId: "workspace",
    currentUserMessageId: 1,
    input: { action: "send", relayId: "historical-relay" },
    state: {
      roleById: new Map([["role", { roleId: "role" }]]),
      toolResults: [],
    },
    name: "contact_talent",
    callId: "reply",
  });

  roleAllowed = false;
  await assert.rejects(
    handler(args()),
    (error: Error) => (error as OrgHttpError).status === 404
  );
  assert.equal(sends, 0);
  roleAllowed = true;
  const result = await handler(args());
  assert.equal(sends, 1);
  assert.equal(result.candidateName, target.candidateName);
  assert.equal(result.status, "sent");
});
