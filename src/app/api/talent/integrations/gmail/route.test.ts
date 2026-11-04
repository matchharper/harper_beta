import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getComposioGmailReadAccess, getComposioGmailWriteAccess } from "@/lib/integrations/composio";

async function readStatus(grantedScopes?: string[], unavailable = false) {
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/supabaseServer": { getRequestUser: async () => ({ id: "owner" }) },
    "@/lib/talentOnboarding/server": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/integrations/composio": {
      getComposioGmailReadAccess,
      getComposioGmailWriteAccess,
      getComposioAccountStatus: () => "ACTIVE",
      isOwnedComposioGmailAccount: () => true,
      getComposioConnectedAccount: async () => {
        if (unavailable) throw new Error("provider unavailable");
        return { grantedScopes };
      },
    },
    "@/lib/integrations/gmail": { fetchTalentGmailIntegration: async () => ({ status: "active", composio_connected_account_id: "account" }) },
    "@/lib/integrations/gmailCareerHistoryMemory": { fetchLatestGmailCareerMemory: async () => ({ data: null }) },
    "@/lib/integrations/gmailCareerHistoryRun": { fetchLatestGmailCareerHistoryRun: async () => null },
  };
  const source = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { GET: (request: { nextUrl: URL }) => Promise<{ body: { connected?: boolean; writeConnected?: boolean }; status: number }> } };
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    console,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return loaded.exports.GET({ nextUrl: new URL("http://localhost/api/talent/integrations/gmail") });
}

test("Gmail completion distinguishes a read-only connection from verified write access", async () => {
  const readOnly = await readStatus(["https://www.googleapis.com/auth/gmail.readonly"]);
  assert.equal(readOnly.body.connected, true);
  assert.equal(readOnly.body.writeConnected, false);
  const writable = await readStatus(["https://www.googleapis.com/auth/gmail.modify"]);
  assert.equal(writable.body.writeConnected, true);
});

test("unknown grants and provider outages do not report verified write access", async () => {
  const unknown = await readStatus();
  assert.equal(unknown.status, 503);
  assert.notEqual(unknown.body.writeConnected, true);
  const unavailable = await readStatus(undefined, true);
  assert.equal(unavailable.body.connected, true);
  assert.equal(unavailable.body.writeConnected, false);
});
