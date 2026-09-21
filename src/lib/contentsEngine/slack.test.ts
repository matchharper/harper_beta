import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGtmOutreachDeliveryFailureSlackMessage,
  buildGtmOutreachReplySlackMessage,
} from "./slack";

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
