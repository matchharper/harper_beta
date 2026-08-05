import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrgIntroEmailFeedCard } from "./OrgIntroEmailFeedCard";

test("renders an internal-only email with sender, recipients, and body", () => {
  const html = renderToStaticMarkup(
    <OrgIntroEmailFeedCard
      item={{
        bodyText: "다음 주 화요일 오후에 이야기 나누면 좋겠습니다.",
        createdAt: "2026-08-05T07:00:00.000Z",
        direction: "inbound",
        fromEmail: "recruiter@example.com",
        id: "message-1",
        subject: "Re: Introduction",
        toEmails: ["candidate@example.com"],
      }}
      recipientLabels={["Candidate · candidate@example.com"]}
      senderLabel="Recruiter · recruiter@example.com"
    />
  );

  assert.match(html, /Harper 내부 전용/);
  assert.match(html, /받은 답장/);
  assert.match(html, /Recruiter · recruiter@example.com/);
  assert.match(html, /Candidate · candidate@example.com/);
  assert.match(html, /다음 주 화요일 오후에 이야기 나누면 좋겠습니다/);
  assert.match(html, /repeating-linear-gradient/);
});
