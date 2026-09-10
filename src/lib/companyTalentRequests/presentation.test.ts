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

test("pending company question requires a successful response writer before relay claims", () => {
  const context = serializeTalentPendingRequest({
    expects_document: false,
    id: "request-question",
    request_context: "주 2회 서울 오피스 출근이 가능하신가요?",
    role: { name: "Backend Engineer" },
    workspace: { company_name: "Acme" },
  });

  assert.match(
    context ?? "",
    /MUST call record_company_request_response before the final reply/
  );
  assert.match(context ?? "", /only the latest user message/);
  assert.match(
    context ?? "",
    /unless record_company_request_response returned ok=true/
  );
  assert.match(
    context ?? "",
    /do not claim that the company has already received it/
  );
});

test("pending resume decline uses the same successful-writer boundary", () => {
  const context = serializeTalentPendingRequest({
    expects_document: true,
    id: "request-resume",
    request_context: "최신 이력서를 공유해 주세요.",
    role: { name: "Backend Engineer" },
    workspace: { company_name: "Acme" },
  });

  assert.match(
    context ?? "",
    /explicitly declines.*MUST call record_company_request_response/
  );
  assert.match(context ?? "", /upload is completed by the document service/i);
  assert.match(
    context ?? "",
    /unless record_company_request_response returned ok=true/
  );
});

test("renewed interest defers to the tool when the company changed stage later", () => {
  const context = serializeTalentPendingRequest({
    expects_document: false,
    id: "request-reengagement",
    intent: "candidate_reengagement",
    request_context: "다시 연결받을 의향이 있으신가요?",
    role: { name: "Backend Engineer" },
    workspace: { company_name: "Acme" },
  });

  assert.match(context ?? "", /newer company stage change takes precedence/);
  assert.match(context ?? "", /tool's assistantInstruction/);
});

test("candidate contact confirmation shows the body without mechanical fields", () => {
  const body =
    "안녕하세요.\n\n회사에서 확인을 부탁드린 내용입니다.\n\nHarper 드림";
  const presentation = candidateContactDraftPresentation({
    body,
  });

  assert.equal(
    candidateContactDraftFallbackReply("민수"),
    "네, 제가 대신 민수님께 여쭤보고, 답이 오면 여기로 알려드릴게요. 우선 아래 내용으로 연락드리려고 해요. 보내기 전에 한 번만 확인해 주시겠어요?"
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
    "네, 요청하신 내용으로 김호진님께 확인을 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다."
  );
  const lateNight = new Date("2026-08-27T14:50:00.000Z");
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
      now: lateNight,
      scheduledAt: "2026-08-27T14:55:00.000Z",
    }),
    "네, 요청하신 내용으로 김호진님께 확인을 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다."
  );
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: true,
    }),
    "네, 요청하신 내용으로 김호진님께 바로 확인을 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다."
  );
  assert.equal(
    candidateContactScheduledReply({
      candidateName: "김호진",
      immediate: false,
      kind: "resume",
    }),
    "네, 요청하신 내용으로 김호진님께 최신 이력서를 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다."
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
