import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessagesProvider } from "@/i18n/useMessage";
import { CareerPendingActionContextCard } from "./CareerPendingActionContextCard";

const handlers = {
  onDismiss: () => undefined,
  onToggleExpanded: () => undefined,
};

const renderCard = (node: ReactNode, locale: "en" | "ko" = "ko") =>
  renderToStaticMarkup(
    <MessagesProvider locale={locale}>{node}</MessagesProvider>
  );

test("question context is clamped when collapsed and scrolls within five lines when expanded", () => {
  const action = {
    id: "fit_1",
    kind: "internal_fit_question" as const,
    prompt:
      "이 역할에서는 해외 팀과 매일 영어로 협업합니다. 현재 업무에서 영어로 회의를 진행한 경험이 있나요?",
  };
  const collapsed = renderCard(
    <CareerPendingActionContextCard
      action={action}
      expanded={false}
      {...handlers}
    />
  );
  const expanded = renderCard(
    <CareerPendingActionContextCard action={action} expanded {...handlers} />
  );

  assert.match(collapsed, /line-clamp-3/);
  assert.match(collapsed, /아래 답변은 이 요청에 연결됩니다/);
  assert.match(expanded, /max-h-\[6\.25rem\]/);
  assert.match(expanded, /overflow-y-auto/);
});

test("company request context clearly identifies its company and role", () => {
  const markup = renderCard(
    <CareerPendingActionContextCard
      action={{
        companyName: "Harper Portfolio",
        expiresAt: "2026-08-30T00:00:00.000Z",
        id: "request_1",
        kind: "company_request",
        prompt: "최근 프로젝트에서 맡은 역할을 알려주세요.",
        requestMode: "question",
        resumeRequestToken: null,
        roleId: "role_1",
        roleTitle: "Applied AI Engineer",
      }}
      expanded={false}
      {...handlers}
    />
  );

  assert.match(markup, /회사에서 온 질문/);
  assert.match(markup, /Harper Portfolio/);
  assert.match(markup, /Applied AI Engineer/);
});

test("resume request context exposes its dedicated upload action", () => {
  const markup = renderCard(
    <CareerPendingActionContextCard
      action={{
        companyName: "Harper Portfolio",
        expiresAt: "2026-08-30T00:00:00.000Z",
        id: "request_2",
        kind: "company_request",
        prompt: "최신 이력서를 업로드하거나 공유하지 않겠다고 답해주세요.",
        requestMode: "resume",
        resumeRequestToken: "signed-token",
        roleId: "role_1",
        roleTitle: "Applied AI Engineer",
      }}
      expanded={false}
      onUploadResume={() => undefined}
      {...handlers}
    />
  );

  assert.match(markup, /이력서 업로드/);
  assert.match(markup, /pb-12/);
});

test("company request context uses English visible and accessibility copy", () => {
  const markup = renderCard(
    <CareerPendingActionContextCard
      action={{
        companyName: "Harper Portfolio",
        expiresAt: "2026-08-30T00:00:00.000Z",
        id: "request_3",
        kind: "company_request",
        prompt: "Please upload your latest resume.",
        requestMode: "resume",
        resumeRequestToken: "signed-token",
        roleId: "role_1",
        roleTitle: "Applied AI Engineer",
      }}
      expanded={false}
      onUploadResume={() => undefined}
      {...handlers}
    />,
    "en"
  );

  assert.match(markup, /Company request · Resume/);
  assert.match(markup, /Upload resume/);
  assert.match(markup, /Show more request details/);
  assert.match(markup, /Dismiss selected item/);
  assert.doesNotMatch(markup, /[가-힣]/);
});
