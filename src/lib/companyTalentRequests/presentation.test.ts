import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateContactBodyWithoutTransportFooter,
  candidateContactDraftFallbackReply,
  candidateContactDraftPresentation,
  candidateContactScheduledReply,
  serializeTalentPendingRequest,
} from "@/lib/companyTalentRequests/presentation";

const SYSTEM_FOOTER =
  "If you have any issues, feedback, or want someone on the team to take a look, email chris@matchharper.com. Harper is still learning, so it can make mistakes or get details wrong.\n\nIf you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.";

for (const content of [
  "주 2회 서울 출근이 가능한가요?",
  "최신 이력서를 보내주세요.",
  "어떤 역할로 이어가고 싶으신가요?",
]) {
  test(`all company contacts use the same routing contract: ${content}`, () => {
    const context =
      serializeTalentPendingRequest({
        id: "contact-1",
        recommendation_id: "connection-1",
        request_context: content,
        role: { name: "Engineer" },
        workspace: { company_name: "Acme" },
      }) ?? "";
    assert.match(context, /connectionId: recommendation:connection-1/);
    assert.match(context, /Use contact_company/);
    assert.match(context, /sends immediately/);
    assert.doesNotMatch(context, /requestId:/);
    assert.match(context, /does not change a hiring stage/);
    assert.doesNotMatch(context, /disposition|record_company_request_response/);
    assert.ok(context.includes(content));
  });
}

test("candidate contact confirmation shows the body without mechanical fields", () => {
  const body =
    "안녕하세요.\n\n회사에서 확인을 부탁드린 내용입니다.\n\nHarper 드림";
  const presentation = candidateContactDraftPresentation({
    body,
  });

  assert.equal(
    candidateContactDraftFallbackReply("민수"),
    "네, 제가 대신 민수님께 연락을 전달할게요. 우선 아래 내용으로 보내려고 해요. 보내기 전에 한 번만 확인해 주시겠어요?"
  );
  assert.match(presentation, /> 회사에서 확인을 부탁드린 내용입니다\./);
  assert.match(presentation, /> Harper 드림/);
  assert.equal(presentation.includes(SYSTEM_FOOTER), false);
  assert.doesNotMatch(presentation, /footer|고정 안내|서비스 안내/i);
  assert.doesNotMatch(
    presentation,
    /제목:|본문:|Role:|Backend Engineer 관련 확인/
  );
  assert.match(presentation, /^> 안녕하세요\./);
  assert.doesNotMatch(
    presentation,
    /이메일|Harper 채팅|자동으로 재촉|아직 보내지는 않았어요|보내도 괜찮을까요/
  );
});

test("Slack candidate contact preview renders a hidden clickable resume URL", () => {
  const url = "https://matchharper.com/career/profile?resumeRequest=signed";
  const presentation = candidateContactDraftPresentation({
    body: `아래 링크에서 올려주세요.\n\n[이력서 업로드](${url})`,
    source: "slack",
  });

  assert.equal(presentation.includes(`<${url}|이력서 업로드>`), true);
  assert.doesNotMatch(presentation, /\[이력서 업로드\]\(/);
});

test("candidate contact completion does not foreground the short delivery buffer", () => {
  const afternoon = new Date("2026-08-27T05:00:00.000Z");
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
      now: afternoon,
      scheduledAt: "2026-08-27T05:05:00.000Z",
    }),
    "네, 요청하신 내용으로 김호진님께 연락을 전달할게요. 후보자가 답장을 보내면 이 대화로 알려드리겠습니다."
  );
  const lateNight = new Date("2026-08-27T14:50:00.000Z");
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
      now: lateNight,
      scheduledAt: "2026-08-27T14:55:00.000Z",
    }),
    "네, 요청하신 내용으로 김호진님께 연락을 전달할게요. 후보자가 답장을 보내면 이 대화로 알려드리겠습니다."
  );
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: true,
    }),
    "네, 요청하신 내용으로 김호진님께 바로 연락을 전달할게요. 후보자가 답장을 보내면 이 대화로 알려드리겠습니다."
  );
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
    }),
    "네, 요청하신 내용으로 김호진님께 연락을 전달할게요. 후보자가 답장을 보내면 이 대화로 알려드리겠습니다."
  );
  assert.doesNotMatch(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
      scheduledAt: "2026-08-27T05:05:00.000Z",
    }),
    /조금 뒤에|5분/
  );
});

test("candidate contact copy drops a transport footer before display or storage", () => {
  const body = "후보자에게 확인할 본문입니다.";
  const withFooter = `${body}\r\n\r\n${SYSTEM_FOOTER.replace(/\n/g, "\r\n")}`;

  assert.equal(candidateContactBodyWithoutTransportFooter(withFooter), body);
  assert.equal(
    candidateContactDraftPresentation({
      body: withFooter,
    }).includes(SYSTEM_FOOTER),
    false
  );
});
