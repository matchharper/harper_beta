import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { JSDOM } from "jsdom";

import { MessagesProvider } from "@/i18n/useMessage";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import type { CareerMessage } from "@/components/career/types";
import { appendCareerOpportunityMentionMetadata } from "@/lib/career/opportunityMentionText";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import CareerMessageBubble from "./CareerMessageBubble";

const router: NextRouter = {
  query: {},
  isReady: true,
  pathname: "/career",
  asPath: "/career",
  basePath: "",
  route: "/career",
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

test("saved form artifact reaches the assistant bubble with its editable initial content", () => {
  const message = toUiMessage(toTalentMessageResponse({
    id: 404, conversation_id: "conversation", user_id: "user", role: "assistant", content: "", message_type: "career_form", created_at: "2026-10-29T00:00:00Z",
    payload: { formId: 404, revision: 3, kind: "form", title: "지원 내용 확인", items: [{ id: "answer", label: "관련 경험", type: "textarea", content: { value: "저장된 초기 답변" } }], positive: { id: "continue", label: "이 내용으로 진행", message: "이 내용으로 진행해줘." } },
  }));
  const html = renderToStaticMarkup(<RouterContext.Provider value={router}><MessagesProvider locale="ko"><CareerMessageBubble isUser={false} message={message} /></MessagesProvider></RouterContext.Provider>);
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelector("textarea")?.value, "저장된 초기 답변");
  assert.equal(dom.window.document.querySelector("[data-career-form-revision]")?.getAttribute("data-career-form-revision"), "3");
  assert.match(dom.window.document.body.textContent ?? "", /이 내용으로 진행/);
  dom.window.close();
});

test("user opportunity mentions keep text-action in immediate and restored messages", () => {
  const opportunityMentions = [
    { label: "Example · AI Research Engineer", roleId: "role-short" },
    { label: "Example · AI Research Engineer (Search & Agent) (경력) 채용", roleId: "role-long" },
    { label: "Other · Platform Engineer", roleId: "role-other" },
  ];
  const content = `${opportunityMentions[1].label}에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘.\n${opportunityMentions[2].label}와 ${opportunityMentions[1].label}도 비교해줘. https://example.com`;
  const immediate: CareerMessage = {
    id: "temp-user-mention",
    role: "user",
    content,
    opportunityMentions,
    messageType: "chat",
    createdAt: "2026-10-29T00:00:00.000Z",
  };
  const restored = toUiMessage(toTalentMessageResponse({
    id: 123,
    conversation_id: "conversation",
    user_id: "user",
    role: "user",
    content: appendCareerOpportunityMentionMetadata(content, opportunityMentions),
    message_type: "chat",
    created_at: immediate.createdAt,
  }));
  assert.deepEqual(restored.opportunityMentions, opportunityMentions);

  for (const message of [immediate, restored, { ...immediate, opportunityMentions: undefined }]) {
    const html = renderToStaticMarkup(
      <RouterContext.Provider value={router}>
        <MessagesProvider locale="ko">
          <CareerMessageBubble isUser message={message} />
        </MessagesProvider>
      </RouterContext.Provider>
    );
    const dom = new JSDOM(html);
    try {
      assert.deepEqual(
        [...dom.window.document.querySelectorAll("span.text-action")].map((node) => node.textContent),
        message.opportunityMentions
          ? [opportunityMentions[1].label, opportunityMentions[2].label, opportunityMentions[1].label]
          : []
      );
      assert.ok(dom.window.document.body.textContent?.includes("에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘."));
      assert.ok(dom.window.document.querySelector('a[href="https://example.com"]'));
      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /HARPER_OPPORTUNITY_MENTIONS|role-short|role-long|role-other/);
    } finally {
      dom.window.close();
    }
  }
});

test("renders completed markdown spans while an assistant message is streaming", () => {
  const html = renderToStaticMarkup(
    <RouterContext.Provider value={router}>
      <MessagesProvider locale="ko">
        <CareerMessageBubble
          isUser={false}
          message={{
            id: "streaming-assistant",
            role: "assistant",
            content: "**굵게** ~~취소선~~ `코드`",
            messageType: "chat",
            createdAt: "2026-09-22T00:00:00.000Z",
            typing: true,
            typingMode: "stream",
          }}
        />
      </MessagesProvider>
    </RouterContext.Provider>
  );

  assert.match(html, /<strong[^>]*>굵게<\/strong>/);
  assert.match(html, /<del>취소선<\/del>/);
  assert.match(html, /<code[^>]*>코드<\/code>/);
  assert.doesNotMatch(html, /\*\*굵게\*\*|~~취소선~~/);
});

test("Career user and assistant bubbles cap at 740px and assistant Markdown uses the Career variant", () => {
  for (const isUser of [true, false]) {
    const html = renderToStaticMarkup(
      <RouterContext.Provider value={router}>
        <MessagesProvider locale="ko">
          <CareerMessageBubble
            isUser={isUser}
            message={{
              id: "width-preview",
              role: isUser ? "user" : "assistant",
              content:
                "# Fieldguide\n\n[회사 소개](https://example.com/company)",
              messageType: "chat",
              createdAt: "2026-09-23T00:00:00.000Z",
            }}
          />
        </MessagesProvider>
      </RouterContext.Provider>
    );
    assert.match(html, /max-w-\[min\(740px,/);
    assert.doesNotMatch(html, /max-w-\[min\((?:820|920)px,/);
    if (!isUser) {
      assert.match(html, /<h1[^>]*text-xl font-medium/);
      assert.match(html, /data-rich-text-reference="true"/);
      assert.match(html, /s2\/favicons/);
    }
  }
});
