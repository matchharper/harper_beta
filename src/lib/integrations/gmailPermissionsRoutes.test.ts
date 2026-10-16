import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const state = { scope: "openid", owned: true, saved: 0, queued: 0, links: 0 };
const stubs = {
  "@/lib/supabaseServer":
    "export const getRequestUser = async () => ({ id: 'talent-fixture' });",
  "@/lib/talentOnboarding/server":
    "export const getTalentSupabaseAdmin = () => ({});",
  "@/lib/integrations/gmail": `export const upsertTalentGmailIntegration = async () => { globalThis.__gmailRouteTest.saved++; }; export const fetchActiveTalentGmailIntegration = async () => ({ composio_connected_account_id: 'ca_fixture', updated_at: '2026-10-16T00:00:00Z' });`,
  "@/lib/integrations/gmailCareerHistoryQueue":
    "export const scheduleGmailCareerHistoryAnalysis = async () => { globalThis.__gmailRouteTest.queued++; };",
};

async function route(name: string) {
  const compile = (source: string) =>
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
  const fixtureRequire = (specifier: string) => {
    if (specifier in stubs) {
      const mockModule = { exports: {} };
      new Function(
        "module",
        "exports",
        compile(stubs[specifier as keyof typeof stubs])
      )(mockModule, mockModule.exports);
      return mockModule.exports;
    }
    return require(specifier);
  };
  const source = readFileSync(
    `src/app/api/talent/integrations/gmail/${name}/route.ts`,
    "utf8"
  );
  const routeModule = {
    exports: {} as { POST: (request: Request) => Promise<Response> },
  };
  new Function("require", "module", "exports", compile(source))(
    fixtureRequire,
    routeModule,
    routeModule.exports
  );
  return routeModule.exports.POST;
}

function request(body: object) {
  const req = new Request("http://localhost/api/talent/integrations/gmail", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return Object.assign(req, { nextUrl: new URL(req.url) });
}

test("partial consent, fresh consent, confirmed access and ownership at the real route boundaries", async (t) => {
  const globals = globalThis as unknown as { __gmailRouteTest?: typeof state };
  globals.__gmailRouteTest = state;
  const env = {
    COMPOSIO_API_KEY: "fixture",
    COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_fixture",
  };
  for (const [key, value] of Object.entries(env)) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  t.after(() => {
    delete globals.__gmailRouteTest;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const account = {
        id: "ca_fixture",
        user_id: state.owned ? "talent-fixture" : "another-talent",
        auth_config: { id: "ac_fixture" },
        toolkit: { slug: "gmail" },
        status: "ACTIVE",
        data: { scope: state.scope },
      };
      if (url.pathname.endsWith("/link")) {
        state.links++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.user_id, "talent-fixture");
        assert.equal(
          new URL(body.callback_url).searchParams.get("gmailImport"),
          "resume"
        );
        return Response.json({
          connected_account_id: "ca_new",
          redirect_url: "https://connect.composio.dev/link/test",
        });
      }
      return Response.json(
        url.pathname.endsWith("/connected_accounts")
          ? { items: [account] }
          : account
      );
    }
  );
  const connect = await route("connect");
  const complete = await route("complete");
  const analyze = await route("analyze");
  const partial = await complete(request({ connectedAccountId: "ca_fixture" }));
  assert.equal((await partial.json()).status, "permissions_required");
  assert.equal(state.saved, 1);
  const blocked = await analyze(request({}));
  assert.equal((await blocked.json()).status, "permissions_required");
  assert.equal(state.queued, 0);
  const fresh = await connect(request({ resumeImport: true }));
  assert.equal((await fresh.json()).connected, false);
  assert.equal(state.links, 1);
  state.scope = "https://mail.google.com/ openid";
  const granted = await complete(request({ connectedAccountId: "ca_fixture" }));
  assert.equal((await granted.json()).status, "active");
  assert.equal(state.queued, 0); // Consent alone does not start an unsolicited import.
  assert.equal((await (await analyze(request({}))).json()).status, "queued");
  assert.equal(state.queued, 1);
  state.owned = false;
  assert.equal(
    (await complete(request({ connectedAccountId: "ca_fixture" }))).status,
    403
  );
  assert.equal((await analyze(request({}))).status, 409);
  assert.equal(state.saved, 2);
  assert.equal(state.queued, 1);
});
