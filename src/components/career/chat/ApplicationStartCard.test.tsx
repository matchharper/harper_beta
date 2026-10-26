import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MessagesProvider } from "@/i18n/useMessage";
import { ApplicationStartCard } from "./ApplicationStartCard";
import { JSDOM } from "jsdom";
import { applicationStartRequestSchema, parseApplicationStartOffer } from "@/lib/career/simulation/startOffer";
test("compact start card and disables starting until a resume is selected", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <ApplicationStartCard
        offer={{
          version: 1,
          status: "ready",
          roleName: "Example · Engineer",
          roleId: "role-a",
          resumes: [],
        }}
        messageId={1}
        disabled={false}
        onAction={() => {}}
      />
    </MessagesProvider>
  );
  for (const label of [
    "하퍼로 지원하기",
    "이력서를 업로드해 주세요",
    "함께 지원 시작하기",
  ])
    assert.ok(html.includes(label));
  assert.ok(!html.includes("자동으로 지원 완료"));
  const doc = new JSDOM(html).window.document;
  const start = [...doc.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("함께 지원 시작하기")
  );
  assert.equal(start?.hasAttribute("disabled"), true);
});
test("start request carries only the card and selected document, not a client-defined role or prompt", () => {
  assert.equal(
    applicationStartRequestSchema.safeParse({
      action: "start",
      sessionMessageId: 1,
      expectedRevision: 1,
      documentId: null,
    }).success,
    false
  );
  assert.ok(
    applicationStartRequestSchema.safeParse({
      action: "start",
      sessionMessageId: 1,
      expectedRevision: 1,
      documentId: "resume",
    }).success
  );
  assert.equal(
    applicationStartRequestSchema.safeParse({
      action: "start",
      sessionMessageId: 1,
      expectedRevision: 1,
      documentId: "resume",
      roleId: "other",
    }).success,
    false
  );
});

test("persisted start card keeps the authored explanation above the next role without another confirmation", () => {
  const offer = parseApplicationStartOffer(JSON.parse(JSON.stringify({
    version: 1, status: "ready", roleName: "Example · Field Engineer", roleId: "role-b",
    introduction: "이전 준비는 저장해 두었어요. 나중에 이어갈 수 있어요. **Field Engineer** 지원을 도와드릴게요.",
    selectedDocumentId: "resume", resumes: [{ id: "resume", name: "My CV.pdf", primary: true }],
  })))!;
  const html = renderToStaticMarkup(<MessagesProvider locale="ko"><ApplicationStartCard offer={offer} messageId={2} disabled={false} onAction={() => {}} /></MessagesProvider>);
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.body.textContent?.includes(offer.introduction!.replaceAll("**", "")));
  assert.ok(html.indexOf("이전 준비는") < html.indexOf("<section"));
  assert.equal(doc.querySelector("strong")?.textContent, "Field Engineer");
  const start = [...doc.querySelectorAll("button")].find(button => button.textContent?.includes("함께 지원 시작하기"));
  assert.equal(start?.hasAttribute("disabled"), false);
});
