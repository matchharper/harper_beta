import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoIntroRoleSummaryReminderText,
  type AutoIntroCandidateReplyReminder,
} from "./autoIntroToCompanyMessage";
import { companyReceivedRequestedDocument } from "./autoIntroToCompanyNotifications";

function reminderText(
  locale: "ko" | "en",
  reply: Pick<
    AutoIntroCandidateReplyReminder,
    "documentReceived" | "expectsDocument"
  >
) {
  const text = buildAutoIntroRoleSummaryReminderText({
    locale,
    publicSiteUrl: "https://example.com",
    summary: {
      companyName: "Acme",
      reminders: {
        candidateReplies: [
          {
            candidateName: "Kim",
            recommendationId: "recommendation-id",
            roleId: "role-id",
            roleTitle: "Backend Engineer",
            talentId: "talent-id",
            workspaceId: "workspace-id",
            ...reply,
          },
        ],
        upcomingMeetings: [],
      },
      roles: [],
      workspaceId: "workspace-id",
    },
  });
  assert.ok(text);
  return text;
}

test("resume request with an uploaded resume says the material arrived", () => {
  const reply = { documentReceived: true, expectsDocument: true };
  assert.match(
    reminderText("ko", reply),
    /이력서를 요청했고, 자료를 받았어요\./
  );
  assert.match(reminderText("en", reply), /sent the requested material/);
});

test("resume request answered without a resume does not claim it arrived", () => {
  const reply = { documentReceived: false, expectsDocument: true };
  const ko = reminderText("ko", reply);
  const en = reminderText("en", reply);
  assert.doesNotMatch(ko, /자료를 받았어요/);
  assert.match(
    ko,
    /이력서를 요청했고 답변은 받았지만, 이력서는 아직 오지 않았어요\./
  );
  assert.doesNotMatch(en, /sent the requested material/);
  assert.match(
    en,
    /replied to your resume request .* but hasn't sent the resume yet/
  );
});

test("question requests keep the answered-question copy", () => {
  const reply = { documentReceived: false, expectsDocument: false };
  assert.match(
    reminderText("ko", reply),
    /질문하신 내용을 .*께 전달했고 답변을 받았어요\./
  );
  assert.match(reminderText("en", reply), /answered your question about/);
});

const request = {
  created_at: "2026-09-23T02:58:15.123+00:00",
  recommendation_id: "recommendation-id",
};

function relay(
  createdAt: string,
  status: string,
  recommendationId = "recommendation-id"
) {
  return {
    created_at: createdAt,
    deliveries: [{ status, type: "company_contact_company_delivery" }],
    recommendation_id: recommendationId,
  };
}

test("a text-only answer to a resume request is not a received resume", () => {
  assert.equal(companyReceivedRequestedDocument(request, []), false);
});

test("a resume relayed to the company after the request counts as received", () => {
  assert.equal(
    companyReceivedRequestedDocument(request, [
      relay("2026-10-19T11:26:03.661676+00:00", "sent"),
    ]),
    true
  );
});

test("a resume that has not reached the company is not received yet", () => {
  for (const status of ["queued", "failed", "cancelled"]) {
    assert.equal(
      companyReceivedRequestedDocument(request, [
        relay("2026-10-19T11:26:03.661676+00:00", status),
      ]),
      false
    );
  }
});

test("an older resume or another connection's resume does not answer this request", () => {
  assert.equal(
    companyReceivedRequestedDocument(request, [
      relay("2026-09-01T00:00:00+00:00", "sent"),
      relay("2026-10-19T11:26:03+00:00", "sent", "other-recommendation-id"),
    ]),
    false
  );
});
