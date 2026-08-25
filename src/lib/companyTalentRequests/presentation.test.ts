import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateContactBodyWithoutTransportFooter,
  candidateContactDraftPresentation,
} from "@/lib/companyTalentRequests/presentation";

const SYSTEM_FOOTER =
  "If you have any issues, feedback, or want someone on the team to take a look, email chris@matchharper.com. Harper is still learning, so it can make mistakes or get details wrong.\n\nIf you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.";

test("candidate contact confirmation shows only the stored contact copy", () => {
  const body =
    "안녕하세요.\n\n회사에서 확인을 부탁드린 내용입니다.\n\nHarper 드림";
  const presentation = candidateContactDraftPresentation({
    body,
    candidateName: "민수",
    revision: 2,
    roleName: "Backend Engineer",
    subject: "Backend Engineer 관련 확인",
  });

  assert.match(presentation, /제목: Backend Engineer 관련 확인/);
  assert.match(presentation, /본문:\n```text/);
  assert.equal(presentation.includes(body), true);
  assert.equal(presentation.includes(SYSTEM_FOOTER), false);
  assert.doesNotMatch(presentation, /footer|고정 안내|서비스 안내/i);
  assert.match(presentation, /아직 보내지 않았어요/);
  assert.match(
    presentation,
    /답하거나, 답하기 어렵다고 하거나, 답하지 않을 수 있어요/
  );
  assert.match(presentation, /자동으로 재촉하지는 않으며/);
  assert.match(presentation, /답변이 오면 .*이 대화에서 알려드릴게요/);
});

test("candidate contact copy drops a transport footer before display or storage", () => {
  const body = "후보자에게 확인할 본문입니다.";
  const withFooter = `${body}\r\n\r\n${SYSTEM_FOOTER.replace(/\n/g, "\r\n")}`;

  assert.equal(candidateContactBodyWithoutTransportFooter(withFooter), body);
  assert.equal(
    candidateContactDraftPresentation({
      body: withFooter,
      candidateName: "민수",
      revision: 1,
      roleName: "Backend Engineer",
      subject: "확인 요청",
    }).includes(SYSTEM_FOOTER),
    false
  );
});
