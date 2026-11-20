import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { NextRequest } from "next/server";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const state = { scope: "openid", owned: true, confirmed: [] as { conversationId?: string; readGranted: boolean }[], links: 0 };
const stubs = {
  "@/lib/supabaseServer":
    "export const getRequestUser = async () => ({ id: 'talent-fixture' });",
  "@/lib/talentOnboarding/server":
    "export const getTalentSupabaseAdmin = () => ({});",
  "@/lib/integrations/gmail": "export const fetchTalentGmailIntegration = async () => null; export const gmailConnectionVersion = () => 'absent';",
  "@/lib/integrations/gmailConnection.server":
    "export const confirmCareerGmailConnection = async (args) => { globalThis.__gmailRouteTest.confirmed.push(args); return { conversationId: args.conversationId ?? null }; };",
};

async function route(name: string, method: "GET" | "POST" = "POST") {
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
    exports: {} as Record<"GET" | "POST", (request: Request) => Promise<Response>>,
  };
  new Function("require", "module", "exports", compile(source))(
    fixtureRequire,
    routeModule,
    routeModule.exports
  );
  return routeModule.exports[method];
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
    SUPABASE_SERVICE_ROLE_KEY: "fixture-signing-key",
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
  const httpFetch = globalThis.fetch;
  let returnUrl: URL | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const account = {
        id: url.pathname.endsWith("/ca_new") ? "ca_new" : "ca_fixture",
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
        const callback = new URL(body.callback_url);
        assert.equal(callback.pathname, "/api/talent/integrations/gmail/complete");
        returnUrl = callback;
        assert.equal(callback.searchParams.get("gmailConversationId"), "8e4acbd8-4940-4fe7-aee5-df4f7f190ce9");
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
  const conversationId = "8e4acbd8-4940-4fe7-aee5-df4f7f190ce9";
  const partial = await complete(request({ connectedAccountId: "ca_fixture" }));
  assert.equal((await partial.json()).status, "permissions_required");
  assert.equal(state.confirmed.length, 0);
  const fresh = await connect(request({ capability: "read", conversationId, returnTo: "/career" }));
  assert.equal((await fresh.json()).connected, false);
  assert.equal(state.links, 1);
  state.scope = "https://mail.google.com/ openid";
  const granted = await complete(request({ connectedAccountId: "ca_fixture", conversationId }));
  assert.equal((await granted.json()).status, "active");
  assert.equal(state.confirmed[0].conversationId, conversationId);
  assert.equal(state.confirmed[0].readGranted, true);
  const get = await route("complete", "GET");
  assert.ok(returnUrl);
  returnUrl.searchParams.set("status", "success");
  returnUrl.searchParams.set("connected_account_id", "ca_new");
  const cookie = fresh.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  // Follow only the provider's return request over HTTP. No JS, user bearer,
  // redirect to the workspace, or UI POST is involved in this confirmation.
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url!, "http://localhost");
    const response = await get(new NextRequest(url, {
      headers: incoming.headers.cookie ? { cookie: incoming.headers.cookie } : {},
    }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const providerReturn = `http://127.0.0.1:${address.port}${returnUrl.pathname}${returnUrl.search}`;
  const callback = await httpFetch(providerReturn, { headers: { cookie }, redirect: "manual" });
  assert.equal(callback.status, 303);
  assert.equal(new URL(callback.headers.get("location")!).searchParams.get("gmailConnect"), "verified");
  assert.equal(state.confirmed.length, 2);
  assert.deepEqual([state.confirmed[1].conversationId, state.confirmed[1].readGranted], [conversationId, true]);
  const withoutIntent = await httpFetch(providerReturn, { redirect: "manual" });
  assert.equal(new URL(withoutIntent.headers.get("location")!).searchParams.get("gmailConnect"), "callback");
  assert.equal(state.confirmed.length, 2);
  state.owned = false;
  assert.equal((await complete(request({ connectedAccountId: "ca_fixture" }))).status, 403);
  assert.equal(state.confirmed.length, 2);
});
