import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getComposioGmailReadAccess, getComposioGmailWriteAccess } from "@/lib/integrations/composio";

async function readStatus(grantedScopes?: string[], unavailable = false, notConnectedEmail?: string) {
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/supabaseServer": { getRequestUser: async () => ({ id: "owner", email: notConnectedEmail }) },
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
    "@/lib/integrations/gmail": { gmailConnectionGeneration: () => null, fetchTalentGmailIntegration: async () => notConnectedEmail === undefined ? { status: "active", composio_connected_account_id: "account" } : null },
    "@/lib/integrations/googleMailDomain.server": { isGoogleMailAddress: async (email: string) => email.endsWith("@startup.example") },
  };
  const source = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { GET: (request: { nextUrl: URL }) => Promise<{ body: { connected?: boolean; writeConnected?: boolean; googleMail?: boolean }; status: number }> } };
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

test("a never-connected account learns whether its mailbox is on Google", async () => {
  const workspace = await readStatus(undefined, false, "ceo@startup.example");
  // The route runs in its own VM context, so compare plain values.
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.body)), { connected: false, writeConnected: false, status: "not_connected", googleMail: true });
  const other = await readStatus(undefined, false, "person@naver.com");
  assert.equal(other.body.googleMail, false);
});
