import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyTalentRequestFeedCard } from "./CompanyTalentRequestFeedCard";

test("shows a natural sent state with the received answer and a quiet sent-message disclosure", () => {
  const html = renderToStaticMarkup(
    <CompanyTalentRequestFeedCard
      item={{
        canCancel: false,
        cancelledAt: null,
        createdAt: "2026-08-28T00:00:00.000Z",
        deliveryStatus: "sent",
        id: "request-1",
        label: "회사 질문 확인",
        lastError: null,
        requestContext: "합류 가능 시점을 확인해 주세요.",
        requestKind: "question",
        responseMessage: "9월 첫째 주부터 합류할 수 있다고 답했어요.",
        roleId: "role-1",
        roleName: "Backend Engineer",
        scheduledAt: "2026-08-28T00:20:00.000Z",
        sentAt: "2026-08-28T00:20:00.000Z",
        sentMessage: "가능한 합류 시점을 알려 주세요.",
        status: "답변 수신",
        workflowStatus: "awaiting_talent",
      }}
    />
  );

  assert.match(html, /후보자에게 질문을 보냈어요/);
  assert.match(html, /후보자 답변/);
  assert.match(html, /9월 첫째 주부터 합류할 수 있다고 답했어요/);
  assert.match(html, /후보자에게 보낸 내용/);
  assert.match(html, /가능한 합류 시점을 알려 주세요/);
  assert.match(html, /Role · Backend Engineer/);
  assert.doesNotMatch(html, /발송 완료|이메일과 Harper 채팅/);
});

test("shows a saved draft without implying that delivery was scheduled", () => {
  const html = renderToStaticMarkup(
    <CompanyTalentRequestFeedCard
      item={{
        canCancel: false,
        cancelledAt: null,
        createdAt: "2026-09-10T02:08:10.740Z",
        deliveryStatus: "unknown",
        id: "request-draft-1",
        label: "회사 질문 확인",
        lastError: null,
        requestContext: "채용 프로세스를 다시 진행할 의사가 있는지 확인 요청",
        requestKind: "question",
        responseMessage: null,
        roleId: "role-1",
        roleName: "Product Engineer",
        scheduledAt: null,
        sentAt: null,
        sentMessage: null,
        status: "후보자 메일 초안 작성됨 · 발송 전",
        workflowStatus: "draft",
      }}
    />
  );

  assert.match(html, /후보자에게 보낼 문구를 준비했어요/);
  assert.match(html, /2026\. 09\. 10\. 오전 11:08에 저장했어요/);
  assert.match(html, /아직 후보자에게 보내지 않았어요/);
  assert.doesNotMatch(html, /전달할 예정이에요/);
});
