import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const nodeModule = Module as typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadWithServerOnlyStub(
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalModuleLoad.call(this, request, parent, isMain);
};
const modulesPromise = Promise.all([
  import("../talentOnboarding/tools"),
  import("./server"),
  // Loaded later by createCompanyTalentRelay; load it while server-only is stubbed.
  import("./delivery"),
]).finally(() => {
  nodeModule._load = originalModuleLoad;
});

// The relay row is stored, but the company delivery cannot find it and fails.
function adminWhoseDeliveryFails() {
  const query = (table: string): any => {
    const chain: any = {
      eq: () => chain,
      maybeSingle: async () => ({
        data:
          table === "talent_messages"
            ? { content: "커피챗 좋습니다.", id: 1, message_type: "chat", role: "user" }
            : null,
        error: null,
      }),
      select: () => chain,
    };
    return chain;
  };
  return {
    from: query,
    rpc: async () => ({
      data: { id: "relay-1", idempotent: false, status: "queued" },
      error: null,
    }),
  };
}

test("contact_company does not tell Harper the message was delivered when delivery fails", async () => {
  const [{ executeTalentTool, TALENT_TOOL_NAMES }] = await modulesPromise;
  const result = (await executeTalentTool({
    context: {
      admin: adminWhoseDeliveryFails() as never,
      userId: "talent-1",
      userMessageId: 1,
    } as never,
    input: { connectionId: "recommendation:rec-1", relayContent: "커피챗 좋습니다." },
    logging: false,
    name: TALENT_TOOL_NAMES.CONTACT_COMPANY,
  })) as Record<string, unknown>;
  assert.equal(result.status, "queued");
  assert.match(String(result.modelOutput), /status=queued/);
  assert.match(String(result.assistantInstruction), /has not reached the company yet/);
  assert.doesNotMatch(String(result.assistantInstruction), /completes the requested delivery/);
});

test("connection history spells out whether the latest relay reached the company", async () => {
  const [, { formatRelayableCompanyTalentConnections }] = await modulesPromise;
  const base = {
    companyName: "회사",
    connectionId: "recommendation:rec-1",
    establishedAt: "2026-10-15",
    latestCompanyContactAt: null,
    latestRelayAt: "2026-10-19T02:04:55Z",
    origin: "company_contact",
    positionState: "pending_connection",
    recentContacts: [],
    recommendationId: "rec-1",
    roleName: "역할",
  } as any;
  assert.match(
    formatRelayableCompanyTalentConnections([{ ...base, latestRelayStatus: "queued" }]),
    /queued \(아직 회사에 전달되지 않음\)/
  );
  assert.match(
    formatRelayableCompanyTalentConnections([{ ...base, latestRelayStatus: "sent" }]),
    /sent \(회사에 전달됨\)/
  );
});
