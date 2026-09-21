import assert from "node:assert/strict";
import test from "node:test";
import { buildContentsEngineSheetsRpc } from "@/lib/contentsEngine/sheetsRpc";

test("injects the server token and verified actor into outreach review", () => {
  const operation = buildContentsEngineSheetsRpc({
    actorEmail: "reviewer@matchharper.com",
    params: {
      action: "approve",
      dispatch_id: "00000000-0000-4000-8000-000000000001",
    },
    rpc: "gtm_outreach_review",
    serverToken: "server-secret",
  });
  assert.equal(operation.rpcArgs.p_token, "server-secret");
  assert.equal(operation.rpcArgs.p_actor_email, "reviewer@matchharper.com");
});

test("allows the complete Sheet read and write RPC surface", () => {
  const cases = [
    ["gtm_api", { action: "list", entity: "gtm_creators", data: {} }],
    ["gtm_sheet_view", { view: "creator_directory", limit: 500, offset: 0 }],
    [
      "gtm_compensation_strategy_save",
      { data: { name: "Pilot" }, request_id: "request-id" },
    ],
  ] as const;
  for (const [rpc, params] of cases) {
    const operation = buildContentsEngineSheetsRpc({
      actorEmail: "operator@matchharper.com",
      params,
      rpc,
      serverToken: "server-secret",
    });
    assert.equal(operation.rpc, rpc);
    assert.equal(operation.rpcArgs.p_token, "server-secret");
  }
});

test("rejects RPCs and fields outside the Sheet contract", () => {
  assert.throws(
    () =>
      buildContentsEngineSheetsRpc({
        actorEmail: "operator@matchharper.com",
        params: {},
        rpc: "dangerous_admin_rpc",
        serverToken: "server-secret",
      }),
    /Unknown Contents Engine/
  );
  assert.throws(
    () =>
      buildContentsEngineSheetsRpc({
        actorEmail: "operator@matchharper.com",
        params: { token: "client-supplied-secret" },
        rpc: "gtm_api",
        serverToken: "server-secret",
      }),
    /Unknown operation field/
  );
  assert.throws(
    () =>
      buildContentsEngineSheetsRpc({
        actorEmail: "operator@matchharper.com",
        params: { actor_email: "spoofed@example.com" },
        rpc: "gtm_outreach_review",
        serverToken: "server-secret",
      }),
    /Unknown operation field/
  );
});
