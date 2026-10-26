import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { JSDOM } from "jsdom";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrgRole } from "@/lib/org/server";

const roleId = "20000000-0000-4000-8000-000000000001";
const workspaceId = "10000000-0000-4000-8000-000000000001";
let savedSession: unknown = null;
let questionRefresh: Promise<void> | null = null;
let answerCompleted: (() => void) | null = null;
let nextSession: unknown = null;
const writes: Array<Record<string, unknown>> = [];
const chats: Array<Record<string, unknown>> = [];
const toasts: Array<{ variant: string }> = [];
const emptyRole = {
  roleId: "", workspaceId, status: "draft", name: "", description: null,
  locationText: null, workMode: null, employmentTypes: [], criteria: [],
  createdAt: "", updatedAt: "", externalJdUrl: null, request: null,
} satisfies OrgRole;
let RoleStartOnboarding: typeof import("./RoleStartOnboarding").RoleStartOnboarding;
let isRoleStartOnboarding: typeof import("./RoleStartOnboarding").isRoleStartOnboarding;
const refresh = async () => {};
const appendMessagesToCache = () => {};

before(async () => {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "@/i18n/org/OrgLocaleProvider") return { useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }) };
    if (name === "@/i18n/org/useOrgDocumentEditorCopy") return { useOrgDocumentEditorCopy: () => ({}) };
    if (name === "@/hooks/org/useOrgWorkspace") return { useOrgWorkspace: () => ({ permissions: { canManageCandidates: true }, user: { id: "synthetic-team-member" } }) };
    if (name === "@/hooks/org/useOrg") return { useUpdateOrgRole: () => ({ isPending: false, mutateAsync: refresh }) };
    if (name === "@/hooks/org/useOrgAgent") return {
      useOrgAgentMessageHistory: () => ({ messages: [], appendMessagesToCache }),
      useOrgAgentChat: () => ({ isStreaming: false, sendMessage: async (input: { onComplete: () => void }) => { chats.push(input); input.onComplete(); } }),
    };
    if (name === "@/store/useToastStore") return { useToastStore: () => (value: { variant: string }) => toasts.push(value) };
    if (name === "@/lib/internalApiClient") return { fetchWithInternalAuth: async (_url: string, init?: RequestInit) => {
      if (!init && questionRefresh) await questionRefresh;
      if (!init) return { session: savedSession, issues: [], role: {
        status: "draft", name: "예시 역할", description: "합성 역할 설명", hasDescription: true,
        locationText: "서울", workMode: "onsite", employmentTypes: ["full_time"], salaryRange: null,
      } };
      const body = JSON.parse(String(init.body));
      writes.push(body);
      if (body.action === "answer" && answerCompleted) {
        savedSession = nextSession;
        answerCompleted();
        return { session: savedSession };
      }
      return body.action === "create" ? { roleId } : { session: { phase: "drafting" } };
    } };
    if (name === "@/components/org/role-start/RoleReferenceInput") return {
      Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      RoleReferenceInput: ({ drafts, onDraftsChange }: { drafts: unknown[]; onDraftsChange: (value: unknown[]) => void }) => (
        <button onClick={() => onDraftsChange([{ link: "https://example.invalid/synthetic-profile" }])}>참고 프로필 {drafts.length}</button>
      ),
      referenceRowsToSend: (rows: unknown[]) => rows,
    };
    if (name === "@/components/ui/button") return { MuteButton: ({ children, onClick, disabled, "aria-label": label }: { children: ReactNode; onClick: () => void; disabled: boolean; "aria-label"?: string }) => <button aria-label={label} onClick={onClick} disabled={disabled}>{children}</button> };
    // The test exercises Setup's save/navigation state; these inputs provide
    // deterministic synthetic edits without loading editors or other screens.
    if (name === "@/components/ui/textarea") return { Textarea: ({ onChange }: { onChange: (event: { target: { value: string } }) => void }) => <button onClick={() => onChange({ target: { value: "합성 역할의 채용 공고입니다." } })}>공고 입력</button> };
    if (name === "@/components/org/role-start/RoleBriefFields") return { RoleBriefFields: () => null };
    if (name === "@/components/ui/input") return { Input: () => null };
    if (name === "@/components/ui/document-editor") return { DocumentEditor: () => null };
    if (name === "@/components/org/role-overview/RoleOverviewShared") return { RoleToggleButton: () => null };
    if (["@/components/org/role-start/OrgRoleStartPanel", "@/components/org/role-start/RoleBriefFields", "@/components/org/role-start/RoleStartCandidate", "@/components/org/role-start/RoleStartCandidateProfile", "@/components/ui/rich-text", "@/components/ui/dropdown-menu", "@/hooks/org/useOrgRoleNotifications", "@/hooks/org/useOrgSlack"].includes(name)) return {};
    return original.call(this, name, ...args);
  };
  try { ({ RoleStartOnboarding, isRoleStartOnboarding } = await import("./RoleStartOnboarding")); } finally { loader._load = original; }
});

test("drafts stay in onboarding without a session or after failure; finished roles leave it", () => {
  assert.equal(isRoleStartOnboarding(emptyRole), true);
  for (const phase of ["failed", "drafting", "questions", "review", "evaluating"]) {
    assert.equal(isRoleStartOnboarding(emptyRole, { session: { phase } } as never), true);
  }
  for (const phase of ["done", "superseded"]) {
    assert.equal(isRoleStartOnboarding(emptyRole, { session: { phase } } as never), false);
  }
  assert.equal(isRoleStartOnboarding({ ...emptyRole, status: "active" }), false);
});

test("new Setup creates nothing on entry and preserves reference input until continuing to Brief", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const opened: string[] = [];
  const click = async (label: string) => {
    const button = [...dom.window.document.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") ?? button.textContent) === label);
    assert.ok(button, `Missing button: ${label}`);
    assert.equal(button.disabled, false, `Disabled button: ${label}`);
    await act(async () => { button.click(); });
  };
  try {
    await act(async () => root.render(<QueryClientProvider client={queryClient}><RoleStartOnboarding role={emptyRole} workspaceId={workspaceId} onRoleCreated={id => opened.push(id)} /></QueryClientProvider>));
    assert.equal(writes.length, 0, "Visiting /org/new must not insert an empty Role");
    assert.match(dom.window.document.body.textContent!, /어떤 역할을 채용하시나요/);
    await click("참고 프로필 0");
    await click("공고 입력");
    await click("입력하기");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(writes.filter(write => write.action === "create").length, 1);
    assert.equal(chats[0].draftRoleId, roleId);
    assert.deepEqual(opened, [], "Stay on Setup until the team continues");
    assert.match(dom.window.document.body.textContent!, /참고 프로필 1/);
    await click("이대로 사용하기");
    assert.deepEqual(writes.map(write => write.action), ["create", "start", "add_references"]);
    assert.equal(writes[1].roleId, roleId);
    assert.equal(writes[2].roleId, roleId);
    assert.deepEqual(opened, [roleId]);
    assert.deepEqual(toasts.filter(toast => toast.variant === "error"), []);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    Object.assign(globalThis, { ...previous, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});


test("Brief back opens the last answer, traverses history and returns without resubmitting", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.sessionStorage.setItem(`role-start-setup:${roleId}`, "1");
  savedSession = {
    phase: "review", stalled: false, refining: false, progress: [],
    brief: { summary: "합성 인재상", criteria: [], hardConditions: [], otherNotes: [] },
    questions: { history: ["첫 질문", "마지막 질문"].map((question, index) => ({
      id: `q${index}`, question, why: null, chips: [], status: "answered",
      answer: { text: `답변 ${index + 1}` },
    })) },
    pendingQuestion: null,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const click = async (label: string) => {
    const button = [...dom.window.document.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") ?? button.textContent) === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => button.click());
  };
  const beforeWrites = writes.length;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><RoleStartOnboarding role={{ ...emptyRole, roleId }} workspaceId={workspaceId} /></QueryClientProvider>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    await click("이전");
    assert.match(dom.window.document.body.textContent!, /마지막 질문/);
    assert.match(dom.window.document.body.textContent!, /답변 2/);
    await click("이전");
    assert.match(dom.window.document.body.textContent!, /첫 질문/);
    await click("다음");
    assert.match(dom.window.document.body.textContent!, /마지막 질문/);
    await click("다음");
    assert.doesNotMatch(dom.window.document.body.textContent!, /마지막 질문/);
    assert.match(dom.window.document.body.textContent!, /채용 기준/);
    assert.equal(writes.slice(beforeWrites).some(write => ["answer", "finish_questions"].includes(String(write.action))), false);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    savedSession = null;
    Object.assign(globalThis, { ...previous, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});


test("answer controls stay disabled between save completion and the next question refresh", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.sessionStorage.setItem(`role-start-setup:${roleId}`, "1");
  const question = (id: string) => ({ id, question: id, why: null, chips: [{ id: "choice", label: "중요" }], status: "pending" });
  const initial = {
    phase: "questions", stalled: false, refining: false, progress: [],
    brief: { summary: "합성 인재상", criteria: [], hardConditions: [], otherNotes: [] },
    questions: { history: [] }, pendingQuestion: question("첫 질문"),
  };
  savedSession = initial;
  nextSession = { ...initial, pendingQuestion: question("다음 질문") };
  let releaseRefresh: () => void = () => {};
  answerCompleted = () => {
    questionRefresh = new Promise<void>(resolve => { releaseRefresh = resolve; });
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const choice = () => [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "중요")!;
  const beforeWrites = writes.length;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><RoleStartOnboarding role={{ ...emptyRole, roleId }} workspaceId={workspaceId} /></QueryClientProvider>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(choice().disabled, false);
    await act(async () => { choice().click(); await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.ok(questionRefresh, "Answer saved; the refresh is deliberately delayed");
    assert.match(dom.window.document.body.textContent!, /첫 질문/);
    assert.equal(choice().disabled, true, "Old question must remain locked after POST completes");
    await act(async () => choice().click());
    assert.equal(writes.slice(beforeWrites).filter(write => write.action === "answer").length, 1);
    await act(async () => { releaseRefresh(); await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.match(dom.window.document.body.textContent!, /다음 질문/);
    assert.equal(choice().disabled, false);
  } finally {
    releaseRefresh();
    await act(async () => root.unmount());
    client.clear();
    savedSession = nextSession = questionRefresh = answerCompleted = null;
    Object.assign(globalThis, { ...previous, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});
