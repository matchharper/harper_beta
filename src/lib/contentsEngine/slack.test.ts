import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGtmContentCompensationSlackMessage,
  buildGtmOutreachDeliveryFailureSlackMessage,
  buildGtmOutreachReplySlackMessage,
} from "./slack";

test("renders fixed compensation without implying that views determined it", () => {
  const message = buildGtmContentCompensationSlackMessage(
    {
      amount: 150_000,
      commentsNonAuthor: 120,
      contentRef: 31,
      costId: "cost-fixed",
      costRef: 12,
      creatorName: "Fixture Creator",
      currency: "KRW",
      likes: 210,
      metricAsOf: "2026-09-18T04:20:00Z",
      performanceRating: "good",
      performanceReason: "비교 콘텐츠보다 반응이 강함",
      postUrl: "https://www.instagram.com/reel/fixture/",
      pricingModel: "fixed",
      strategyName: "고정비 실험",
      title: "Fixture content",
      views: 24_000,
    },
    "https://matchharper.com/ops/gtm"
  );
  const detail = message.blocks[0].text.text;
  assert.match(detail, /Fixture Creator/);
  assert.match(detail, /조회 24,000 · 좋아요 210 · 댓글 120/);
  assert.match(detail, /지급 예정 \*150,000 KRW\*/);
  assert.match(detail, /🟢 \*좋음\*/);
  assert.ok(detail.split("\n").length <= 4);
});

test("renders the measured views for performance-linked compensation", () => {
  const message = buildGtmContentCompensationSlackMessage(
    {
      amount: 275_000,
      commentsNonAuthor: 101,
      contentRef: 32,
      costId: "cost-variable",
      costRef: 13,
      creatorName: "Another Creator",
      currency: "KRW",
      likes: null,
      metricAsOf: "2026-09-18T04:20:00Z",
      performanceRating: "insufficient",
      performanceReason: "좋아요가 없어 판단 근거가 부족함",
      postUrl: null,
      pricingModel: "base_plus_views",
      strategyName: "조회수 실험",
      title: "Fixture content",
      views: 25_000,
    },
    "https://matchharper.com/ops/gtm"
  );
  const detail = message.blocks[0].text.text;
  assert.match(detail, /조회 25,000 · 좋아요 확인 불가 · 댓글 101/);
  assert.match(detail, /⚪ \*판단 보류\*/);
});

test("links creator replies directly to the GTM conversation", () => {
  const url =
    "https://matchharper.com/ops/gtm?sheet=creator-directory&creator=creator-1&creatorTab=conversation";
  const message = buildGtmOutreachReplySlackMessage(
    {
      activityId: "activity-1",
      activityRef: 10,
      body: "Interested in learning more.",
      creatorId: "creator-1",
      creatorName: "Creator",
      creatorRef: 73,
      dispatchRef: 20,
      fromEmail: "creator@example.com",
      outboundSentAt: "2026-09-21T00:00:00.000Z",
      outboundSubject: "Proposal",
      receivedAt: "2026-09-21T01:00:00.000Z",
      subject: "Re: Proposal",
      triageSummary: "협업 조건을 확인하고 싶어 합니다.",
      triageType: "question",
    },
    url
  );
  assert.match(JSON.stringify(message.blocks), /GTM에서 대화 보기/);
  assert.match(JSON.stringify(message.blocks), /\|Creator>/);
  assert.match(
    JSON.stringify(message.blocks),
    new RegExp(url.replace("?", "\\?"))
  );
});

test("labels Resend complaints accurately and links to GTM", () => {
  const url =
    "https://matchharper.com/ops/gtm?sheet=creator-directory&creator=creator-1&creatorTab=conversation";
  const message = buildGtmOutreachDeliveryFailureSlackMessage(
    {
      activityId: "activity-2",
      creatorId: "creator-1",
      creatorName: "Creator",
      creatorRef: 73,
      diagnosticCode: "Recipient reported this message as spam",
      dispatchRef: 20,
      permanent: true,
      recipientEmail: "creator@example.com",
      status: "email.complained",
      subject: "Proposal",
    },
    url
  );
  assert.match(message.text, /스팸 신고/);
  assert.match(JSON.stringify(message.blocks), /GTM에서 확인/);
  assert.match(JSON.stringify(message.blocks), /\|Creator>/);
  assert.match(
    JSON.stringify(message.blocks),
    new RegExp(url.replace("?", "\\?"))
  );
});
