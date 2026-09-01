import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { queryKeys } from "@/lib/queryKeys";
import type { GoogleCalendarStatus } from "./googleCalendarTypes";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
before(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ui-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-ui-test-key";
});
after(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined)
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

const router: NextRouter = {
  query: { orgId: "workspace" },
  isReady: true,
  pathname: "/org/settings",
  asPath: "/org/settings?orgId=workspace",
  basePath: "",
  route: "/org/settings",
  push: async () => true,
  replace: async () => true,
  reload() {},
  back() {},
  forward() {},
  prefetch: async () => {},
  beforePopState() {},
  isFallback: false,
  isPreview: false,
  isLocaleDomain: false,
  events: { on() {}, off() {}, emit() {} },
};

for (const [state, expected] of [
  ["not_connected", ">연결</button>"],
  ["active", "연결됨"],
  ["expired", "다시 연결"],
  ["disabled", "연결 해제 다시 시도"],
] as const) {
  test(`personal integration UI renders ${state} with the scheduling scope`, async () => {
    const { OrgGoogleCalendarIntegration } =
      await import("@/components/org/workspace/OrgGoogleCalendarIntegration");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData<GoogleCalendarStatus>(
      queryKeys.org.googleCalendar("alice", "workspace"),
      { provider: "google_calendar", status: state }
    );
    const html = renderToStaticMarkup(
      createElement(
        RouterContext.Provider,
        { value: router },
        createElement(
          QueryClientProvider,
          { client },
          createElement(OrgGoogleCalendarIntegration, {
            userId: "alice",
            workspaceId: "workspace",
          })
        )
      )
    );
    assert.ok(html.includes(expected), html);
    assert.ok(html.includes("Google Calendar"));
    assert.ok(html.includes("미팅 가능 시간을 확인하고,"));
    assert.ok(
      html.includes("인터뷰 링크를 만들고 초대하기 위해 연결이 필요해요.")
    );
    client.clear();
  });
}

test("personal query keys isolate employees and workspaces", () => {
  assert.notDeepEqual(
    queryKeys.org.googleCalendar("alice", "workspace"),
    queryKeys.org.googleCalendar("bob", "workspace")
  );
  assert.notDeepEqual(
    queryKeys.org.googleCalendar("alice", "workspace"),
    queryKeys.org.googleCalendar("alice", "another-workspace")
  );
});

test("runtime integration paths keep auth and tool execution server-only", () => {
  const server = readFileSync(
    new URL("./googleCalendarServer.ts", import.meta.url),
    "utf8"
  );
  assert.match(server, /await getFreshRequestUser\(req\)/);
  assert.match(server, /await assertOrgWorkspaceAccess\(/);
  assert.match(server, /userId: user\.id/);
  assert.doesNotMatch(server, /permission:\s*"manage_integrations"/);
  const vendor = readFileSync(
    new URL("./composio.ts", import.meta.url),
    "utf8"
  );
  assert.match(vendor, /tools\/execute/);
  assert.doesNotMatch(vendor, /NEXT_PUBLIC_COMPOSIO/);
  const syncServer = readFileSync(
    new URL("../meetings/calendarSyncServer.ts", import.meta.url),
    "utf8"
  );
  assert.match(syncServer, /\.from\("company_user_workspace"\)/);
  const ui = readFileSync(
    new URL(
      "../../components/org/workspace/OrgGoogleCalendarIntegration.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const hook = readFileSync(
    new URL("../../hooks/org/useOrgGoogleCalendar.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    ui + hook,
    /COMPOSIO_API_KEY|googleCalendarServer|integrations\/composio|googleCalendarStore/
  );
});
