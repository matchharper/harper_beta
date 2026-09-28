import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "@/components/career/CareerSidebarContext";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "@/components/career/CareerChatPanelContext";

test("deferred suggestions settle independently and two saved links skip Gmail loading", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "fixture-anon-key";
  const { supabase } = await import("@/lib/supabase");
  const { useCareerTaskSuggestions } =
    await import("./useCareerTaskSuggestions");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalGetSession = supabase.auth.getSession;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  (supabase.auth as any).getSession = async () => ({
    data: { session: { access_token: "fixture-token" } },
  });
  const requests: string[] = [];
  const resolvers = new Map<string, (response: Response) => void>();
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return new Promise<Response>((resolve) => {
      resolvers.set(url, resolve);
    });
  };
  let savedLinks = ["https://linkedin.com/in/fixture"];
  let state!: ReturnType<typeof useCareerTaskSuggestions>;
  function Harness() {
    state = useCareerTaskSuggestions();
    return (
      <div>
        Existing tasks
        <span
          data-feedback-loading={state.externalLoading}
          data-sources-loading={state.sourcesLoading}
        >
          {state.externalFeedback.length}
        </span>
      </div>
    );
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <CareerSidebarProvider
            value={
              {
                user: { id: "fixture-user" },
                workspaceDataLoading: false,
                savedProfileLinks: savedLinks,
              } as CareerSidebarContextValue
            }
          >
            <CareerChatPanelProvider
              value={
                {
                  sessionPending: false,
                  profilePending: false,
                  profileError: "",
                } as CareerChatPanelContextValue
              }
            >
              <Harness />
            </CareerChatPanelProvider>
          </CareerSidebarProvider>
        </QueryClientProvider>
      );
    });
  };
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };
  const settle = async (url: string, payload: unknown) => {
    await act(async () => {
      resolvers.get(url)!(
        new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json" },
        })
      );
    });
    await flush();
  };
  try {
    await render();
    assert.match(dom.window.document.body.textContent ?? "", /Existing tasks/);
    assert.equal(state.externalLoading, true);
    assert.equal(state.sourcesLoading, true);
    assert.deepEqual(
      new Set(requests),
      new Set([
        "/api/talent/pending-actions?scope=external-feedback",
        "/api/talent/integrations/gmail",
      ])
    );

    await settle("/api/talent/integrations/gmail", {
      connected: true,
      status: "active",
      analysis: { status: "not_started", updatedAt: null },
    });
    assert.equal(state.sourcesLoading, false);
    assert.equal(state.sourceSuggestion, null);
    assert.equal(state.externalLoading, true);

    await settle("/api/talent/pending-actions?scope=external-feedback", {
      externalFeedback: [
        {
          id: "rec",
          roleId: "role",
          companyName: "Fixture",
          companyLogoUrl: null,
          recommendedAt: "2026-09-28T09:00:00Z",
        },
      ],
    });
    assert.equal(state.externalLoading, false);
    assert.equal(state.externalFeedback[0].roleId, "role");

    await act(async () => {
      client.removeQueries({ queryKey: ["career-gmail-integration"] });
    });
    savedLinks = ["https://one.dev", "https://two.dev"];
    await render();
    assert.equal(state.sourcesLoading, false);
    assert.equal(state.sourceSuggestion, null);
    assert.equal(requests.length, 2);
  } finally {
    await act(async () => {
      root.unmount();
    });
    client.clear();
    supabase.auth.getSession = originalGetSession;
    await supabase.auth.stopAutoRefresh();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    dom.window.close();
  }
});
