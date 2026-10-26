import assert from "node:assert/strict";
import test from "node:test";
import {
  orgCandidateActivityFeedContent,
  orgCandidateActivityKind,
  orgCandidateActivityTitle,
  readOrgCandidateActivity,
} from "./candidateActivityFeed";

test("standalone candidate messages retain their full body without a company request", () => {
  const body = "근무 조건을 알려주세요.\n\n첨부: Resume.pdf";
  const item = orgCandidateActivityFeedContent({
    id: "progress-1",
    text: body,
    metadata: { eventType: "candidate_message_delivered", relayId: "relay-1" },
  });
  assert.ok(item?.activity);
  assert.equal(item.activity.requestId, null);
  assert.equal(item.activity.requestKind, null);
  assert.equal(item.activity.relayId, "relay-1");
  assert.equal(item.delivery?.bodyText, body);
  assert.equal(item.delivery?.id, "progress-1");
  assert.equal(orgCandidateActivityKind(item.activity), "candidate_message");
});

test("company questions, resume requests, general contact, and both reply transports keep their direction", () => {
  const cases = [
    [
      { eventType: "candidate_contact_sent", requestKind: "question" },
      "company_question",
    ],
    [
      { eventType: "candidate_contact_sent", requestKind: "resume" },
      "company_resume_request",
    ],
    [
      { eventType: "candidate_contact_sent", requestKind: "contact" },
      "company_message",
    ],
    [
      { eventType: "candidate_contact_sent", requestKind: "future-kind" },
      "company_message",
    ],
    [{ eventType: "candidate_contact_sent" }, "company_message"],
    [
      { eventType: "candidate_response_received", requestId: "request-1" },
      "candidate_response",
    ],
    [
      {
        eventType: "candidate_message_delivered",
        requestId: "request-1",
        relayId: "relay-2",
      },
      "candidate_response",
    ],
    [
      {
        eventType: "candidate_message_delivered",
        requestId: " ",
        relayId: "relay-3",
      },
      "candidate_message",
    ],
  ] as const;
  for (const [metadata, expected] of cases) {
    const activity = readOrgCandidateActivity(metadata);
    assert.ok(activity);
    assert.equal(orgCandidateActivityKind(activity), expected);
  }
});

test("multiple replies to one request keep separate delivery identities and request context", () => {
  const items = ["first", "second"].map((id) =>
    orgCandidateActivityFeedContent({
      id,
      text: id,
      metadata: {
        eventType: "candidate_message_delivered",
        requestId: "same-request",
        relayId: id,
        requestContext: "근무 시간",
      },
    })
  );
  assert.deepEqual(
    items.map((item) => item?.delivery?.id),
    ["first", "second"]
  );
  assert.deepEqual(
    items.map((item) => item?.text),
    ["요청 내용 · 근무 시간", "요청 내용 · 근무 시간"]
  );
});

test("delivery history does not turn queued, failed, cancelled, or unknown events into sent messages", () => {
  for (const eventType of [
    "candidate_contact_scheduled",
    "candidate_contact_failed",
    "candidate_contact_cancelled",
    "unknown",
  ]) {
    assert.equal(
      orgCandidateActivityFeedContent({
        id: "progress",
        text: "body",
        metadata: { eventType },
      }),
      null
    );
  }
  for (const metadata of [null, [], "message", { eventType: 1 }])
    assert.equal(readOrgCandidateActivity(metadata), null);
});

test("outbound email subject uses recorded delivery facts and incoming messages have no invented subject", () => {
  const row = {
    id: "progress",
    text: "body",
    metadata: {
      eventType: "candidate_contact_sent",
      subject: "Recorded subject",
    },
  };
  assert.equal(
    orgCandidateActivityFeedContent(row)?.delivery?.subject,
    "Recorded subject"
  );
  assert.equal(
    orgCandidateActivityFeedContent(row, "Delivery subject")?.delivery?.subject,
    "Delivery subject"
  );
  assert.equal(
    orgCandidateActivityFeedContent({
      ...row,
      metadata: { ...row.metadata, eventType: "candidate_message_delivered" },
    })?.delivery?.subject,
    null
  );
});

test("home and modal labels distinguish questions, replies, and new messages in both languages", () => {
  const ko = (
    source: string,
    _en: string,
    values?: Record<string, string | number | null | undefined>
  ) => source.replace("{name}", String(values?.name ?? ""));
  const en = (
    _ko: string,
    source: string,
    values?: Record<string, string | number | null | undefined>
  ) => source.replace("{name}", String(values?.name ?? ""));
  assert.equal(
    orgCandidateActivityTitle("company_question", ko, "테스트"),
    "테스트님에게 질문을 보냈어요"
  );
  assert.equal(
    orgCandidateActivityTitle("candidate_response", ko),
    "후보자의 답변이 도착했어요"
  );
  assert.equal(
    orgCandidateActivityTitle("candidate_message", ko),
    "후보자에게 메시지가 왔어요"
  );
  assert.equal(
    orgCandidateActivityTitle("company_resume_request", en, "Candidate A"),
    "Resume requested from Candidate A"
  );
  assert.equal(
    orgCandidateActivityTitle("candidate_response", en, "Candidate A"),
    "Candidate A replied"
  );
  assert.equal(
    orgCandidateActivityTitle("candidate_message", en),
    "New message from the candidate"
  );
});
