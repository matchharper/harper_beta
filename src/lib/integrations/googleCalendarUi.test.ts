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
  test(`personal integration UI renders ${state} without claiming calendar access`, async () => {
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
    assert.ok(html.includes("Personal integrations"));
    assert.ok(html.includes("일정 조회나 생성, 초대 발송은 하지 않아요."));
    assert.ok(html.includes("다른 팀원과 공유되지 않아요."));
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

test("runtime integration paths use strict auth and expose no calendar execution surface", () => {
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
  assert.doesNotMatch(
    vendor,
    /tools\/execute|GOOGLECALENDAR_CREATE_EVENT|NEXT_PUBLIC_COMPOSIO/
  );
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
