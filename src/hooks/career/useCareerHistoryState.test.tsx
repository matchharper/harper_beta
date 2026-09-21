import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerHistoryState } from "./useCareerHistoryState";

const opportunity: CareerHistoryOpportunity = {
  clickedAt: null,
  companyDescription: null,
  companyHomepageUrl: null,
  companyLinkedinUrl: null,
  companyLogoUrl: null,
  companyName: "Example",
  description: null,
  employmentTypes: [],
  externalJdUrl: "https://example.com/jobs/1",
  feedback: null,
  feedbackAt: null,
  feedbackReason: null,
  href: "https://example.com/jobs/1",
  id: "opportunity-1",
  isAccepted: false,
  isInternal: false,
  kind: "recommendation",
  location: null,
  opportunityType: OpportunityType.ExternalJd,
  postedAt: null,
  recommendedAt: "2026-09-17T00:00:00.000Z",
  recommendationReasons: [],
  roleId: "role-1",
  savedStage: null,
  sourceJobId: null,
  sourceProvider: null,
  sourceType: "external",
  status: "recommended",
  title: "Product Engineer",
  viewedAt: null,
  workMode: null,
};

test("a chat send invalidates a follow-up whose feedback save is still pending", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/career",
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousCustomEvent = Object.getOwnPropertyDescriptor(
    globalThis,
    "CustomEvent"
  );
  const previousEvent = Object.getOwnPropertyDescriptor(globalThis, "Event");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    value: dom.window.Event,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: dom.window.CustomEvent,
  });

  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  let resolveFeedbackPatch!: (response: Response) => void;
  const feedbackPatch = new Promise<Response>((resolve) => {
    resolveFeedbackPatch = resolve;
  });
  let markPatchRequested!: () => void;
  const patchRequested = new Promise<void>((resolve) => {
    markPatchRequested = resolve;
  });
  let followUpRequestCount = 0;
  const fetchWithAuth: FetchWithAuth = async (url, init) => {
    if (url === "/api/talent/opportunities" && init?.method === "PATCH") {
      markPatchRequested();
      return feedbackPatch;
    }
    if (url === "/api/talent/opportunities/feedback-followup") {
      followUpRequestCount += 1;
      return Response.json({ assistantMessage: null, ok: true });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const hookRef: {
    current: ReturnType<typeof useCareerHistoryState> | null;
  } = { current: null };
  const Harness = () => {
    hookRef.current = useCareerHistoryState({
      autoLoad: false,
      conversationId: "conversation-1",
      enabled: false,
      fetchWithAuth,
      initialSessionPage: {
        counts: null,
        items: [opportunity],
        nextOffset: null,
      },
      userId: "user-1",
    });
    return null;
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessagesProvider locale="ko">
            <Harness />
          </MessagesProvider>
        </QueryClientProvider>
      );
    });
    assert.ok(hookRef.current);

    let updatePromise: Promise<boolean | void> | undefined;
    await act(async () => {
      updatePromise = hookRef.current?.onUpdateHistoryOpportunityFeedback(
        opportunity.id,
        "positive"
      );
      await patchRequested;
    });

    await act(async () => {
      hookRef.current?.cancelPendingOpportunityFeedbackFollowUp();
    });

    await act(async () => {
      resolveFeedbackPatch(
        Response.json({
          assistantMessage: null,
          feedbackFollowUp: {
            delayMs: 0,
            delayed: true,
            feedback: "positive",
            opportunityId: opportunity.id,
            trigger: "delayed_external_feedback",
          },
          historyShouldRefresh: false,
          opportunity: {
            ...opportunity,
            feedback: "positive",
            feedbackAt: "2026-09-17T00:00:01.000Z",
            savedStage: "saved",
          },
          opportunityDiscoveryQueued: false,
        })
      );
      await updatePromise;
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    assert.equal(followUpRequestCount, 0);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (previousEvent) {
      Object.defineProperty(globalThis, "Event", previousEvent);
    } else {
      Reflect.deleteProperty(globalThis, "Event");
    }
    if (previousCustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", previousCustomEvent);
    } else {
      Reflect.deleteProperty(globalThis, "CustomEvent");
    }
    dom.window.close();
  }
});
