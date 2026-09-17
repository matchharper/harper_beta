import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGtmOutreachDeliveryFailureSlackMessage,
  buildGtmOutreachReplySlackMessage,
} from "@/lib/contentsEngine/slack";

test("renders a compact classified Slack reply with creator context", () => {
  const message = buildGtmOutreachReplySlackMessage(
    {
      activityId: "activity-1",
      activityRef: 17,
      body: "단가는 80만원이고 사용권 범위를 알려주세요.",
      creatorName: "Fixture Creator",
      creatorRef: 12,
      dispatchRef: 8,
      fromEmail: "creator@example.com",
      outboundSubject: "Harper 유료 협업 제안",
      primaryHandle: "@fixture",
      receivedAt: "2026-09-17T10:00:00Z",
      subject: "Re: Harper 유료 협업 제안",
      triageSummary: "크리에이터가 단가와 사용권 범위를 협의하려고 합니다.",
      triageType: "negotiation",
    },
    "https://docs.google.com/spreadsheets/d/fixture/edit"
  );
  assert.match(message.text, /^🟡/);
  assert.equal(message.blocks.length, 2);
  const detail = message.blocks[1].text.text;
  assert.match(detail, /\*요약\*/);
  assert.match(detail, /#12 · Fixture Creator · @fixture/);
  assert.match(detail, /발송 #8/);
  assert.match(detail, /Contents Engine에서 원문 보기/);
  assert.ok(detail.split("\n").length <= 5);
});

test("escapes untrusted reply text before inserting it into Slack mrkdwn", () => {
  const message = buildGtmOutreachReplySlackMessage(
    {
      activityId: "activity-2",
      activityRef: 18,
      body: "<script>alert('&')</script>",
      creatorName: "A&B",
      creatorRef: 13,
      dispatchRef: 9,
      fromEmail: "creator@example.com",
      outboundSubject: "Subject",
      receivedAt: "2026-09-17T10:00:00Z",
      subject: "Reply",
      triageSummary: "팀원의 원문 확인이 필요합니다.",
      triageType: "unclassified",
    },
    "https://docs.google.com/spreadsheets/d/fixture/edit"
  );
  const detail = message.blocks[1].text.text;
  assert.doesNotMatch(detail, /<script>/);
  assert.match(detail, /&lt;script&gt;/);
  assert.match(detail, /A&amp;B/);
});

test("renders a compact permanent bounce alert with the exact recipient", () => {
  const message = buildGtmOutreachDeliveryFailureSlackMessage(
    {
      activityId: "activity-bounce-1",
      creatorName: "Fixture Creator",
      creatorRef: 12,
      diagnosticCode: "smtp; 550 5.1.1 <unknown>",
      dispatchRef: 8,
      permanent: true,
      recipientEmail: "creator@example.com",
      status: "5.1.1",
      subject: "Harper collaboration",
    },
    "https://docs.google.com/spreadsheets/d/fixture/edit"
  );
  assert.match(message.text, /^🔴 영구 반송/);
  const detail = message.blocks[1].text.text;
  assert.match(detail, /creator@example\.com/);
  assert.match(detail, /5\.1\.1/);
  assert.match(detail, /&lt;unknown&gt;/);
  assert.ok(detail.split("\n").length <= 5);
});
