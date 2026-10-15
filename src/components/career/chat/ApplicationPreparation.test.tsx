import {
  askApplicationInput,
  finishApplicationAnswer,
} from "@/lib/career/simulation/applicationInput";
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "../CareerSidebarContext";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { supabase } from "@/lib/supabase";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { MessagesProvider } from "@/i18n/useMessage";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "../CareerChatPanelContext";
import {
  createSimulationSession,
  mutateSimulationSession,
} from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";

test("composer collects decisions without chat turns, restores answers, and separates approval from submission", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const {
    ApplicationPreparationContext,
    ApplicationPreparationProvider,
    useApplicationPreparation,
  } = await import("./ApplicationPreparationContext");
  const { ApplicationPreparationComposerSlot } =
    await import("./ApplicationPreparationComposer");
  const { default: CareerComposerSection } =
    await import("./CareerComposerSection");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { ApplicationDraftProgress } =
    await import("./ApplicationDraftProgress");
  const { ApplicationDraftReview } = await import("./ApplicationDraftReview");
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { pretendToBeVisual: true, url: "http://localhost" }
  );
  const globals = [
    "Event",
    "CustomEvent",
    "window",
    "document",
    "HTMLElement",
    "HTMLTextAreaElement",
    "navigator",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = globals.map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const
  );
  for (const k of globals)
    Object.defineProperty(globalThis, k, {
      configurable: true,
      value:
        k === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : k === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[k],
    });
  dom.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  const root = createRoot(dom.window.document.getElementById("root")!);
  let state = createSimulationSession({
    roleRef: "r",
    roleName: "Engineer",
    documentId: "cv",
    documentName: "CV",
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.actions = [
    {
      id: "C",
      inputKind: "change",
      title: "Clarify ownership",
      category: "wording",
      target: "Two experiences",
      proposal: "Show your contribution across both jobs",
      edits: [
        {
          target: "Acme",
          originalText: "Built APIs",
          suggestedText: "Implemented internal APIs",
        },
        {
          target: "Beta",
          originalText: "",
          suggestedText: "Maintained the dashboard",
        },
      ],
      reason: "JD requires ownership",
      requirementIds: [],
      evidenceIds: [],
      needsConfirmation: false,
      questions: [],
      executionPrompt: "PRIVATE",
      status: "pending",
      resolution: "",
      evidenceMessageId: null,
    },
    {
      id: "Q",
      inputKind: "question",
      title: "What did you own?",
      category: "content",
      target: "Two experiences",
      proposal: "One answer can help both experiences",
      reason: "JD requires ownership",
      requirementIds: [],
      evidenceIds: [],
      needsConfirmation: true,
      questions: ["What did you personally deliver?"],
      executionPrompt: "PRIVATE",
      status: "pending",
      resolution: "",
      evidenceMessageId: null,
    },
  ];
  state.preparation.currentItemId = "C";
  let chatCalls = 0;
  const commands: Record<string, unknown>[] = [];
  const panel = {
    messages: [],
    user: { id: "test" },
    conversationId: "c",
    stage: "chat",
    inputMode: "text",
    isOnboardingDone: true,
    pendingActionsOverride: [],
    interviewProgress: { percent: 100 },
    scrollRef: { current: null },
    onSendChatMessage: async () => {
      chatCalls++;
    },
  } as unknown as CareerChatPanelContextValue;
  let saveSucceeds = true;
  const command = async (input: Record<string, unknown>) => {
    commands.push(input);
    return saveSucceeds;
  };
  const render = async (
    child: React.ReactNode = (
      <>
        <ApplicationPreparationComposerSlot>
          <textarea aria-label="Ordinary composer" />
        </ApplicationPreparationComposerSlot>
        <ApplicationDraftProgress />
      </>
    )
  ) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <RouterContext.Provider
            value={{ locale: "ko", query: {} } as NextRouter}
          >
            <CareerSidebarProvider value={{} as CareerSidebarContextValue}>
              <MessagesProvider locale="ko">
                <CareerChatPanelProvider value={panel}>
                  <ApplicationPreparationContext.Provider
                    value={{
                      record: { messageId: 10, state },
                      drafts: [],
                      pending: false,
                      error: "",
                      command,
                    }}
                  >
                    {child}
                  </ApplicationPreparationContext.Provider>
                </CareerChatPanelProvider>
              </MessagesProvider>
            </CareerSidebarProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
  const button = (label: string) =>
    [...dom.window.document.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute("aria-label") === label ||
        b.textContent?.trim() === "1" + label
    )!;
  try {
    for (const status of ["running", "failed", "cancelled"] as const) {
      state.analysisStatus = status;
      await render();
      assert.ok(
        dom.window.document.querySelector('[aria-label="Ordinary composer"]')
      );
      assert.equal(
        dom.window.document.querySelector("[data-preparation-questions]"),
        null
      );
      assert.doesNotMatch(dom.window.document.body.textContent!, /0 \/ 0/);
    }
    state.analysisStatus = "completed";
    const items = state.actions;
    state.actions = [];
    await render();
    assert.equal(
      dom.window.document.querySelector("[data-preparation-questions]"),
      null
    );
    state.actions = items;
    await render();
    assert.equal(dom.window.document.querySelectorAll("textarea").length, 1);
    assert.equal(
      dom.window.document.querySelector('[aria-label="Ordinary composer"]'),
      null
    );
    assert.equal(dom.window.document.querySelectorAll("del").length, 1);
    assert.equal(
      dom.window.document.querySelectorAll('button[aria-label="제안 문구 수정"]').length,
      2
    );
    assert.match(dom.window.document.body.textContent!, /1 \/ 2/);
    assert.ok(dom.window.document.querySelector('svg[aria-label="판단 근거"]'));
    assert.doesNotMatch(dom.window.document.body.textContent!, /rational/);
    assert.doesNotMatch(
      dom.window.document.body.textContent!,
      /PRIVATE|진행하기/
    );
    await act(async () => button("적용").click());
    assert.equal(commands.length,0);
    assert.equal(dom.window.document.querySelector("[data-response-flash]")?.getAttribute("data-response-flash"),"accept");
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
    assert.deepEqual(commands.at(-1), {
      operation: "respond",
      itemId: "C",
      response: { decision: "accept", edits: state.actions[0].edits },
    });
    assert.equal(chatCalls, 0);
    state = mutateSimulationSession(
      state,
      { action: "respond", actionId: "C", response: { decision: "accept" } },
      0
    );
    state = mutateSimulationSession(
      state,
      {
        action: "respond",
        actionId: "Q",
        response: { decision: "answer", text: "Owned A dashboard and B API" },
      },
      0
    );
    state.preparation!.currentItemId = "Q";
    await render();
    assert.equal(
      dom.window.document.querySelector("textarea")?.value,
      "Owned A dashboard and B API"
    );
    assert.equal(dom.window.document.querySelector('svg[aria-label="판단 근거"]'), null);
    const answerInput = dom.window.document.querySelector("textarea")!;
    // React's legacy input-event fallback in jsdom expects these focus hooks.
    Object.assign(answerInput, { attachEvent() {}, detachEvent() {} });
    await act(async () => answerInput.focus());
    const sendKey = async (options: KeyboardEventInit) => {
      const event = new dom.window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      await act(async () => answerInput.dispatchEvent(event));
      return event;
    };
    const beforeEnter = commands.length;
    assert.equal(
      (await sendKey({ isComposing: true })).defaultPrevented,
      false
    );
    assert.equal((await sendKey({ keyCode: 229 })).defaultPrevented, false);
    assert.equal((await sendKey({ shiftKey: true })).defaultPrevented, false);
    assert.equal(commands.length, beforeEnter);
    assert.equal((await sendKey({})).defaultPrevented, true);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
    assert.equal(commands.length, beforeEnter + 1);
    assert.deepEqual(commands.at(-1), {
      operation: "respond",
      itemId: "Q",
      response: { decision: "answer", text: "Owned A dashboard and B API" },
    });
    assert.equal((await sendKey({ repeat: true })).defaultPrevented, true);
    assert.equal(commands.length, beforeEnter + 1);
    saveSucceeds = false;
    await act(async () => button("답변 저장 후 다음").click());
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
    assert.equal(
      dom.window.document.querySelector("textarea")?.value,
      "Owned A dashboard and B API"
    );
    saveSucceeds = true;
    await act(async () => button("답변 저장 후 다음").click());
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
    assert.equal(commands.at(-1)?.operation, "respond");
    assert.equal(chatCalls, 0);
    assert.equal(chatCalls, 0);
    state.preparation!.showInputs = false;
    state.preparation!.generation.status = "running";
    await render();
    assert.ok(
      dom.window.document.querySelector('[aria-label="Ordinary composer"]')
    );
    assert.equal(
      dom.window.document.querySelector("[data-preparation-questions]"),
      null
    );
    assert.match(
      dom.window.document.querySelector('[role="status"]')!.textContent!,
      /초안 작성 중/
    );
    state.preparation!.generation.status = "failed";
    await render();
    await act(async () => button("초안 다시 만들기").click());
    assert.equal(commands.at(-1)?.operation, "generate");
    state.preparation!.generation.status = "idle";
    await render();
    assert.equal(button("입력 내용 다시 보기"), undefined);
    const savedResponses = state.preparation!.responses;
    state.preparation!.responses = {};
    await render();
    assert.equal(button("입력 내용 다시 보기"), undefined);
    assert.equal(button("이어서 준비하기"), undefined);
    state.preparation!.responses = savedResponses;
    // Exercise the actual parent branch, not only the child/slot.
    state.analysisStatus = "running";
    await render(<CareerComposerSection />);
    const wrapper = dom.window.document.querySelector("[data-vaul-no-drag]")!;
    assert.ok(wrapper);
    assert.equal(wrapper.querySelectorAll("textarea").length, 1);
    assert.equal(wrapper.querySelector("[data-preparation-questions]"), null);
    const widthWrapperClass = wrapper.firstElementChild!.className;
    state.analysisStatus = "completed";
    state.preparation!.showInputs = true;
    await render(<CareerComposerSection />);
    assert.ok(wrapper.querySelector("[data-preparation-questions]"));
    assert.equal(wrapper.querySelectorAll("textarea").length, 1);
    assert.equal(wrapper.firstElementChild!.className, widthWrapperClass);
    Object.defineProperty(dom.window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    dom.window.matchMedia = () =>
      ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList;
    await render(<CareerComposerSection />);
    assert.equal(wrapper.firstElementChild!.className, widthWrapperClass);
    const body = wrapper.querySelector(".overflow-y-auto")!;
    assert.ok(body);
    assert.equal(
      body.querySelector("form"),
      null,
      "input controls are outside the scrolling body"
    );
    state.preparation!.generation.status = "running";
    await render(<CareerComposerSection />);
    assert.equal(wrapper.querySelector("[data-preparation-questions]"), null);
    assert.equal(wrapper.querySelectorAll("textarea").length, 1);
    assert.equal(wrapper.firstElementChild!.className, widthWrapperClass);
    const p = state.preparation!;
    p.draftVersion = 1;
    p.draftMessageId = 20;
    p.generation = {
      status: "ready",
      inputRevision: p.inputRevision,
      runId: "run",
      startedAt: null,
    };
    const draft = {
      version: 1 as const,
      sessionMessageId: 10,
      draftVersion: 1,
      inputRevision: p.inputRevision,
      runId: "run",
      roleName: "Engineer",
      content: {
        resume: "# FULL RESUME\nBoth jobs preserved",
        materials: [],
        notes: "",
      },
    };
    await render(<ApplicationDraftReview draft={draft} messageId={20} />);
    assert.match(dom.window.document.body.textContent!, /FULL RESUME/);
    assert.equal(button("입력 내용 다시 보기"), undefined);
    assert.match(
      dom.window.document.body.textContent!,
      /실제 지원 제출은 아직 연결되지/
    );
    await act(async () => button("확인하고 지원").click());
    assert.deepEqual(commands.at(-1), {
      operation: "approve",
      draftVersion: 1,
    });
    p.inputRevision++;
    await render(<ApplicationDraftReview draft={draft} messageId={20} />);
    assert.equal(button("확인하고 지원").disabled, true);

    // A live POST stream must switch the parent before the model finishes.
    const auth = mock.method(supabase.auth, "getSession", async () => ({
      data: { session: { access_token: "test" } },
      error: null,
    }));
    state.preparation = createPreparation();
    state.actions = [state.actions[1]];
    state.preparation.currentItemId = "Q";
    let serverRecord = { messageId: 10, state: structuredClone(state) };
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    let postCount = 0;
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, init?: RequestInit) => {
        if (init?.method === "POST") {
          postCount++;
          return new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                streamController = c;
              },
            }),
            { headers: { "content-type": "application/x-ndjson" } }
          );
        }
        return Response.json({ session: serverRecord, drafts: [] });
      }
    );
    let controls: ReturnType<typeof useApplicationPreparation>;
    function CaptureControls() {
      controls = useApplicationPreparation();
      return null;
    }
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    try {
      await render(
        <ApplicationPreparationProvider>
          <CaptureControls />
          <CareerComposerSection />
          <ApplicationDraftProgress />
        </ApplicationPreparationProvider>
      );
      await act(flush);
      assert.ok(
        dom.window.document.querySelector("[data-preparation-questions]")
      );
      let finished = false;
      let result: Promise<boolean>;
      await act(async () => {
        result = controls!
          .command({
            operation: "respond",
            itemId: "Q",
            response: { decision: "answer", text: "Built APIs" },
          })
          .then((ok) => {
            finished = true;
            return ok;
          });
        await flush();
      });
      serverRecord = {
        messageId: 10,
        state: mutateSimulationSession(
          serverRecord.state,
          {
            action: "respond",
            actionId: "Q",
            response: { decision: "answer", text: "Built APIs" },
          },
          0
        ),
      };
      serverRecord.state.revision++;
      serverRecord.state.preparation!.showInputs = false;
      serverRecord.state.preparation!.generation = {
        status: "running",
        runId: "stream",
        startedAt: new Date().toISOString(),
        inputRevision: 1,
      };
      const bytes = new TextEncoder().encode(
        JSON.stringify({ session: serverRecord }) + "\n"
      );
      await act(async () => {
        streamController!.enqueue(bytes.slice(0, 17));
        streamController!.enqueue(bytes.slice(17));
        await flush();
      });
      assert.equal(finished, false);
      assert.equal(
        dom.window.document.querySelector("[data-preparation-questions]"),
        null
      );
      assert.equal(
        dom.window.document.querySelector("textarea")!.disabled,
        false
      );
      assert.match(
        dom.window.document.querySelector('[role="status"]')!.textContent!,
        /초안 작성 중/
      );
      // Failed generation does not undo the already committed answer or restore the wizard.
      serverRecord = structuredClone(serverRecord);
      serverRecord.state.revision++;
      serverRecord.state.preparation!.generation.status = "failed";
      await act(async () => {
        streamController!.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ session: serverRecord }) +
              "\n" +
              JSON.stringify({ error: "Model failed" }) +
              "\n"
          )
        );
        streamController!.close();
        assert.equal(await result!, true);
      });
      assert.equal(
        controls!.record!.state.preparation!.responses.Q.text,
        "Built APIs"
      );
      assert.equal(
        dom.window.document.querySelector("[data-preparation-questions]"),
        null
      );
      assert.ok(button("초안 다시 만들기"));
      assert.equal(postCount, 1);
    } finally {
      fetchMock.mock.restore();
      auth.mock.restore();
    }
    state.analysisStatus = "completed";
    state.status = "active";
    state.actions = [];
    state.preparation = createPreparation();
    state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
    await render();
    assert.equal(
      dom.window.document.querySelector("[data-preparation-questions]"),
      null,
      "analysis completion alone does not open questions"
    );
    state = askApplicationInput(
      state,
      {
        purpose: "Confirm application details",
        introduction: "Choose the confirmed availability.",
        items: [
          {
            kind: "choice",
            title: "When could you start?",
            options: [
              { id: "one-month", label: "한 달 뒤 가능해요", description: "현재 업무를 인계할 시간이 필요해요" },
              { id: "discuss", label: "일정을 더 이야기하고 싶어요" },
            ],
          },
        ],
      },
      "dynamic-choice"
    );
    await render();
    const choice = [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("한 달 뒤 가능해요")
    )!;
    assert.match(choice.textContent!, /한 달 뒤 가능해요: 현재 업무를 인계할 시간이 필요해요/);
    assert.equal(choice.querySelector("small, strong"), null);
    assert.ok(choice.className.includes("font-normal"));
    assert.equal(dom.window.document.querySelector('svg[aria-label="판단 근거"]'), null);
    await act(async () => choice.click());
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
    assert.deepEqual(commands.at(-1)?.response, {
      decision: "answer",
      text: "한 달 뒤 가능해요",
      optionId: "one-month",
    });
    const questionId = state.preparation!.currentItemId!;
    state = finishApplicationAnswer(
      mutateSimulationSession(
        state,
        {
          action: "respond",
          actionId: questionId,
          response: { decision: "answer", text: "한 달 뒤 가능해요" },
        },
        99
      )
    );
    await render();
    assert.ok(
      dom.window.document.querySelector('[aria-label="Ordinary composer"]')
    );
    assert.equal(
      dom.window.document.querySelector("[data-preparation-questions]"),
      null
    );
    assert.equal(button("입력 내용 다시 보기"), undefined);
    assert.equal(state.preparation!.generation.status, "idle");
  } finally {
    await act(async () => root.unmount());
    for (const [k, desc] of previous) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else Reflect.deleteProperty(globalThis, k);
    }
    queryClient.clear();
    dom.window.close();
  }
});

test("final file question shows one verified candidate without a file picker; submission review keeps its summary", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ApplicationPreparationContext } =
    await import("./ApplicationPreparationContext");
  const { ApplicationPreparationComposer } =
    await import("./ApplicationPreparationComposer");
  let state = createSimulationSession({
    roleRef: "job:test",
    roleName: "Engineer",
    documentId: "cv",
    documentName: "Resume.pdf",
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  const render = () =>
    renderToStaticMarkup(
      <MessagesProvider locale="ko">
        <ApplicationPreparationContext.Provider
          value={{
            record: { messageId: 1, state },
            drafts: [],
            pending: false,
            error: "",
            command: async () => true,
          }}
        >
          <ApplicationPreparationComposer />
        </ApplicationPreparationContext.Provider>
      </MessagesProvider>
    );
  state = askApplicationInput(
    state,
    {
      purpose: "final_file",
      items: [
        {
          kind: "material",
          documentPurpose: "final_resume",
          title: "Confirm",
          documentId: "cv",
          documentName: "Resume.pdf",
          description: "Hidden generic explanation",
        },
      ],
    },
    "final-file"
  );
  let html = render();
  assert.match(html, /어떤 방식으로 지원할까요/);
  assert.match(html, /Resume.pdf/);
  assert.match(html, /직접 지원하기/);
  assert.match(html, /하퍼가 대신 지원하기/);
  assert.doesNotMatch(
    html,
    /type="file"|role="combobox"|Hidden generic explanation/
  );
  state = askApplicationInput(
    state,
    {
      replace: true,
      purpose: "final_submission",
      items: [
        {
          kind: "choice",
          title: "Submit?",
          description: "Company, role, file and all answers",
          options: [
            { id: "submit", label: "Submit" },
            { id: "cancel", label: "Cancel" },
          ],
        },
      ],
    },
    "submission"
  );
  html = render();
  assert.match(html, /Company, role, file and all answers/);
});

test("review questions remain closed until the matching chat review has rendered", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ApplicationPreparationContext } = await import("./ApplicationPreparationContext");
  const { ApplicationPreparationComposerSlot } = await import("./ApplicationPreparationComposer");
  let state=createSimulationSession({roleName:"Role",roleRef:"job:test",documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";state.preparation=createPreparation();state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"review",reviewMarkdown:"## Full answer\n\nReview this before deciding.",items:[{kind:"choice",title:"Use this?",options:[{id:"yes",label:"Use"},{id:"no",label:"Revise"}]}]},"r1");
  const render=(renderedReviewId?:string)=>renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationPreparationContext.Provider value={{record:{state,messageId:1},drafts:[],pending:false,error:"",command:async()=>true,renderedReviewId}}><ApplicationPreparationComposerSlot><span>Ordinary input</span></ApplicationPreparationComposerSlot></ApplicationPreparationContext.Provider></MessagesProvider>);
  assert.match(render(),/Ordinary input/);
  assert.match(render("old-review"),/Ordinary input/);
  const html=render(state.activity!.batches[0].review!.id);
  assert.doesNotMatch(html,/Ordinary input/);
  assert.match(html,/Use this\?/);
  assert.doesNotMatch(html,/Review this before deciding/);
});

test("saved answers show inspection waiting, then a recoverable continuation without a duplicate composer", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ApplicationPreparationContext } = await import("./ApplicationPreparationContext");
  const { ApplicationPreparationComposerSlot } = await import("./ApplicationPreparationComposer");
  const state = createSimulationSession({ roleName: "Role", roleRef: "job:test", documentId: "cv", documentName: "CV" });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.preparation.showInputs = false;
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [{ id: "saved", key: "saved", purpose: "suggestions", itemIds: [], status: "submitted", continuation: "pending", responses: {}, createdAt: new Date().toISOString() }] };
  state.applicationInspection = { status: "running", runId: "inspection" };
  const render = (pending = false) => renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationPreparationContext.Provider value={{ record: { state, messageId: 1 }, drafts: [], pending, error: "", command: async () => true }}><ApplicationPreparationComposerSlot><span>Ordinary input</span></ApplicationPreparationComposerSlot></ApplicationPreparationContext.Provider></MessagesProvider>);
  assert.match(render(true), /Your answers are saved/);
  assert.doesNotMatch(render(true), /Continue with saved answers|data-preparation-questions/);
  state.applicationInspection.status = "completed";
  assert.doesNotMatch(render(), /Your answers are saved/);
  assert.match(render(), /Continue with saved answers/);
  state.activity.batches[0].continuation = "done";
  assert.doesNotMatch(render(), /Continue with saved answers/);
});

test("all question choice surfaces use the same numbered buttons; writing remains open ended", async () => {
  const {renderToStaticMarkup} = await import("react-dom/server");
  const {ApplicationPreparationContext} = await import("./ApplicationPreparationContext");
  const {ApplicationPreparationComposer} = await import("./ApplicationPreparationComposer");
  const buttonClasses: string[] = [];
  for (const item of [
    {kind:"change",title:"Improve this?"},
    {kind:"choice",title:"Choose",options:[{id:"a",label:"One"},{id:"b",label:"A longer second choice"}]},
    {kind:"material",title:"Provide a file"},
    {kind:"material",title:"Choose a file",documentId:"cv"},
    {kind:"material",title:"Apply",documentPurpose:"final_resume",documentId:"cv"},
    {kind:"question",title:"What motivates you?"},
  ]) {
    let state=createSimulationSession({roleName:"Role",roleRef:"job:test",documentId:"cv",documentName:"CV"});
    state.analysisStatus="completed";state.preparation=createPreparation();state.activity={version:1,offerId:1,outputs:{},batches:[]};
    state=askApplicationInput(state,{purpose:"test",items:[item]},`test-${item.title}`);
    const html=renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationPreparationContext.Provider value={{record:{state,messageId:1},drafts:[],pending:false,error:"",command:async()=>true}}><ApplicationPreparationComposer/></ApplicationPreparationContext.Provider></MessagesProvider>);
    const dom=new JSDOM(html);
    const group=dom.window.document.querySelector(".auto-rows-fr");
    if(item.kind === "question") {assert.equal(group,null);assert.ok(dom.window.document.querySelector("textarea"));}
    else {
      assert.ok(group);
      const buttons=Array.from(group.querySelectorAll("button"));
      assert.equal(buttons.length,item.kind === "material" && item.documentId && !item.documentPurpose ? 3 : 2);
      buttons.forEach((button,index)=>{assert.equal(button.firstElementChild?.textContent,String(index+1));buttonClasses.push(button.className);});
    }
    dom.window.close();
  }
  assert.equal(new Set(buttonClasses).size,1);
});
