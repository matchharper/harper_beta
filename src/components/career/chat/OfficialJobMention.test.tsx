import React, { act } from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import {
  buildOfficialJobsCareerHref,
  buildOfficialJobsInitialChatDraft,
  buildOfficialJobsInitialChatMentionLabel,
} from "@/lib/officialJobs";
import {
  appendCareerOpportunityMentionMetadata,
  formatCareerOpportunityMentionsForLlm,
  stripCareerOpportunityMentionMetadata,
} from "@/lib/career/opportunityMentionText";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "../CareerSidebarContext";
import { MessagesProvider } from "@/i18n/useMessage";

test("a job link seeds the existing mention token and sends its role ID with the message", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
  const { default: CareerComposerSection } =
    await import("./CareerComposerSection");
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  // React's input polyfill can be selected when imported before JSDOM.
  Object.assign(dom.window.HTMLElement.prototype, {
    attachEvent() {},
    detachEvent() {},
  });
  const globals = [
    "window",
    "document",
    "HTMLElement",
    "HTMLTextAreaElement",
    "navigator",
    "getComputedStyle",
    "Event",
    "CustomEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of globals)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[key],
    });
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const job = {
    companyName: "Public Company",
    roleTitle: "Platform Engineer",
    roleId: "20000000-0000-4000-8000-000000000001",
    slug: "platform-engineer",
  };
  const url = new URL(buildOfficialJobsCareerHref(job), "http://localhost");
  const title = url.searchParams.get("job")!;
  const company = url.searchParams.get("job_company")!;
  const selectedRoleId = url.searchParams.get("job_role_id")!;
  const sent: Parameters<
    CareerChatPanelContextValue["onSendChatMessage"]
  >[0][] = [];
  try {
    for (const locale of ["ko", "en"] as const) {
      const draft = buildOfficialJobsInitialChatDraft(title, company, locale);
      const label = buildOfficialJobsInitialChatMentionLabel(
        title,
        company,
        locale
      );
      const panel = {
        messages: [],
        user: { id: "fixture" },
        conversationId: "fixture-conversation",
        stage: "chat",
        inputMode: "text",
        isOnboardingDone: true,
        pendingActionsOverride: [],
        interviewProgress: { percent: 100 },
        scrollRef: { current: null },
        initialChatDraft: draft,
        initialChatDraftKey: `official_jobs:${locale}:${selectedRoleId}`,
        initialChatOpportunityMention: { label, roleId: selectedRoleId },
        onSendChatMessage: async (input: Parameters<CareerChatPanelContextValue["onSendChatMessage"]>[0]) => {
          sent.push(input);
        },
      } as unknown as CareerChatPanelContextValue;
      await act(async () =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <RouterContext.Provider value={{ locale, query: {} } as NextRouter}>
              <CareerSidebarProvider value={{} as CareerSidebarContextValue}>
                <MessagesProvider locale={locale}>
                  <CareerChatPanelProvider value={panel}>
                    <CareerComposerSection key={locale} />
                  </CareerChatPanelProvider>
                </MessagesProvider>
              </CareerSidebarProvider>
            </RouterContext.Provider>
          </QueryClientProvider>
        )
      );
      const textarea = dom.window.document.querySelector("textarea")!;
      assert.equal(textarea.value, draft);
      assert.ok(
        [...dom.window.document.querySelectorAll("span.text-link")].some(
          (token) => token.textContent === label
        )
      );
      assert.ok(
        !dom.window.document.body.textContent?.includes(selectedRoleId)
      );
      const sendButton = dom.window.document.querySelector<HTMLButtonElement>(
        `button[aria-label="${locale === "ko" ? "메시지 보내기" : "Send message"}"]`
      );
      assert.ok(sendButton);
      await act(async () => sendButton.click());
      const payload = sent.at(-1)!;
      assert.equal(payload.text, draft);
      assert.equal(payload.opportunityMentions?.[0].roleId, selectedRoleId);
      const stored = appendCareerOpportunityMentionMetadata(
        payload.text,
        payload.opportunityMentions!
      );
      assert.equal(stripCareerOpportunityMentionMetadata(stored), draft);
      assert.ok(
        formatCareerOpportunityMentionsForLlm(stored).includes(
          `roleId: ${job.roleId}`
        )
      );
    }
    assert.equal(sent.length, 2);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
