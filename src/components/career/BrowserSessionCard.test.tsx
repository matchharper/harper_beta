import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { BrowserSessionView } from "./BrowserSessionCard";
import { MessagesProvider } from "@/i18n/useMessage";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { createRequire } from "node:module";

test("browser artifact survives message mapping and grants interaction only after handoff", () => {
  const message = toUiMessage(
    toTalentMessageResponse({
      id: 18,
      conversation_id: "c",
      user_id: "u",
      role: "assistant",
      content: "",
      message_type: "browser_session",
      payload: { session_id: "session-1" },
      created_at: "2026-10-29T00:00:00Z",
    })
  );
  assert.equal(message.browserSession?.sessionId, "session-1");
  for (const status of ["active", "human", "closed"]) {
    const html = renderToStaticMarkup(
      <MessagesProvider locale="en">
        <BrowserSessionView
          view={{
            session: {
              id: message.browserSession!.sessionId,
              status,
              revision: 1,
            },
            liveUrl: "https://example.com/viewer",
            executions: [],
          }}
          onAction={() => {}}
        />
      </MessagesProvider>
    );
    const dom = new JSDOM(html);
    const iframe = dom.window.document.querySelector("iframe");
    if (status === "closed") assert.equal(iframe, null);
    else {
      assert.equal(iframe?.classList.contains("pointer-events-none"), status !== "human");
      assert.equal(
        iframe?.getAttribute("tabindex"),
        status === "human" ? "0" : "-1"
      );
    }
    assert.equal(
      Boolean(dom.window.document.querySelector('a[target="_blank"]')),
      false
    );
    assert.doesNotMatch(
      dom.window.document.body.textContent ?? "",
      /지원 브라우저|직접 조작/
    );
    dom.window.close();
  }
});

test("browser load failure renders a recoverable error", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <BrowserSessionView error="Unable to load session" onAction={() => {}} />
    </MessagesProvider>
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Unable to load session/);
  assert.doesNotMatch(html, /Loading the browser/);
});

test("a confirmed stopped browser does not claim direct control or offer its old viewer", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <BrowserSessionView
        view={{ session: { id: "session-1", status: "idle", revision: 7 }, browserAvailability: "stopped", liveUrl: null, executions: [] }}
        onAction={() => {}}
      />
    </MessagesProvider>
  );
  const dom = new JSDOM(html);
  assert.match(dom.window.document.querySelector("section")?.textContent ?? "", /종료된 브라우저/);
  assert.equal(dom.window.document.querySelector("iframe, a"), null);
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /직접 조작|불러올 수 없어요/);
  dom.window.close();
});

test("an unverified human session does not claim its browser is currently available or closed", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <BrowserSessionView
        view={{ session: { id: "session-1", status: "human", revision: 6 }, browserAvailability: "unknown", liveUrl: null, executions: [] }}
        onAction={() => {}}
      />
    </MessagesProvider>
  );
  assert.doesNotMatch(html, /직접 조작 중|종료된 브라우저/);
  assert.match(html, /브라우저를 불러오는 중이에요/);
  assert.doesNotMatch(html, /브라우저 화면을 불러올 수 없어요/);
});

test("browser preparation shows a busy viewport until the viewer connects; observation failures show an error", () => {
  for (const view of [
    undefined,
    { session: { id: "session-1", status: "running", revision: 1 }, liveUrl: null, executions: [], browserAvailability: "unknown" as const },
    { session: { id: "session-1", status: "running", revision: 2 }, liveUrl: "https://example.com/viewer", executions: [], browserAvailability: "active" as const },
  ]) {
    const html = renderToStaticMarkup(<MessagesProvider locale="ko"><BrowserSessionView view={view} onAction={() => {}} /></MessagesProvider>);
    const dom = new JSDOM(html);
    assert.match(dom.window.document.querySelector('[role="status"]')?.textContent ?? "", /브라우저를 불러오는 중이에요/);
    assert.ok(dom.window.document.querySelector('[aria-busy="true"]'));
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    assert.doesNotMatch(html, /불러올 수 없어요/);
    dom.window.close();
  }
  const html = renderToStaticMarkup(<MessagesProvider locale="ko"><BrowserSessionView
    view={{ session: { id: "session-1", status: "running", revision: 1 }, liveUrl: null, executions: [], observationFailed: true }} onAction={() => {}} />
  </MessagesProvider>);
  assert.match(html, /role="alert"/);
  assert.match(html, /불러올 수 없어요/);
  assert.doesNotMatch(html, /불러오는 중이에요/);
});

test("the timeline keeps independent forms and leaves browser previews to the composer dock", async () => {
  const require = createRequire(import.meta.url);
  const previousCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => { module.exports = {}; };
  let TimelineMessageList: typeof import("./chat/CareerTimelineSection")["TimelineMessageList"];
  try {
    ({ TimelineMessageList } = await import("./chat/CareerTimelineSection"));
  } finally {
    if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
    else delete require.extensions[".css"];
  }
  const browserMessage = toUiMessage(toTalentMessageResponse({
    id: 18, conversation_id: "c", user_id: "u", role: "assistant", content: "",
    message_type: "browser_session", payload: { session_id: "session-1" }, created_at: "2026-10-29T00:00:00Z",
  }));
  const formMessage = toUiMessage(toTalentMessageResponse({
    id: 19, conversation_id: "c", user_id: "u", role: "assistant", content: "",
    message_type: "career_form", created_at: "2026-10-29T00:00:01Z",
    payload: { formId: 19, revision: 1, kind: "form", items: [{ id: "answer", label: "경험", type: "textarea", content: "처음 답변" }], positive: { id: "continue", label: "계속", message: "계속해줘." } },
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  queryClient.setQueryData(["career-browser", "session-1"], {
    session: { id: "session-1", status: "human", revision: 4 },
    liveUrl: "https://example.com/viewer", executions: [],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterContext.Provider value={{ query: {}, pathname: "/career", asPath: "/career" } as NextRouter}>
        <MessagesProvider locale="ko">
          <TimelineMessageList messages={[browserMessage, formMessage, { ...formMessage, id: "20", careerForm: { ...formMessage.careerForm!, formId: 20 } }]} assistantTyping={false} thinkingLogsByMessageId={{}}
            isStartingCall={false} assistantChoiceActionsDisabled={false} onboardingWrapupPending={false} onOpenOpportunity={() => {}} />
        </MessagesProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelector("iframe"), null);
  assert.equal(dom.window.document.querySelectorAll("[data-career-form-id]").length, 2);
  assert.deepEqual([...dom.window.document.querySelectorAll("textarea")].map((input) => input.value), ["처음 답변", "처음 답변"]);
  for (const input of dom.window.document.querySelectorAll("textarea")) {
    assert.equal(input.closest("article")?.classList.contains("w-full"), true);
  }
  dom.window.close();
  queryClient.clear();
});
