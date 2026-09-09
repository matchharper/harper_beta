import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_SERVICE_FAQ_ITEMS } from "@/lib/org/serviceFaq";

const hasTag = (
  item: (typeof COMPANY_SERVICE_FAQ_ITEMS)[number],
  tag: string
) => item.tags.some((current) => current === tag);

test("Company service FAQ has 20 distinct user-facing entries", () => {
  assert.equal(COMPANY_SERVICE_FAQ_ITEMS.length, 20);
  assert.equal(
    new Set(COMPANY_SERVICE_FAQ_ITEMS.map((item) => item.question)).size,
    20
  );
  assert.equal(
    new Set(COMPANY_SERVICE_FAQ_ITEMS.map((item) => item.key)).size,
    20
  );
  assert.ok(
    COMPANY_SERVICE_FAQ_ITEMS.every(
      (item) =>
        item.question.trim().length > 0 &&
        item.answer.trim().length > 0 &&
        hasTag(item, "locale:ko")
    )
  );
});

test("Company pricing copy states the approved commercial boundary", () => {
  const pricingCopy = COMPANY_SERVICE_FAQ_ITEMS.filter((item) =>
    hasTag(item, "topic:pricing")
  )
    .map((item) => item.answer)
    .join("\n");

  assert.match(pricingCopy, /월 구독료가 없어요/);
  assert.match(pricingCopy, /채용이 성사된 경우에만 비용이 발생/);
  assert.match(pricingCopy, /개별적으로 연락드려/);
  assert.doesNotMatch(pricingCopy, /\d+%|만원|원\/월/);
});

test("Company FAQ explains consequences and concrete next actions", () => {
  const connect = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:connect")
  );
  const reject = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:reject")
  );
  const paused = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:recommendation-paused")
  );

  assert.match(connect?.question ?? "", /연결 수락/);
  assert.match(connect?.answer ?? "", /^연결 수락은/);
  assert.doesNotMatch(connect?.answer ?? "", /\bConnect\b/);
  assert.match(reject?.question ?? "", /연결 거절/);
  assert.match(reject?.answer ?? "", /^연결 거절은/);
  assert.doesNotMatch(reject?.answer ?? "", /\bReject\b/);
  assert.match(reject?.answer ?? "", /후보자에게 보이며/);
  assert.match(reject?.answer ?? "", /신중하게 선택/);
  assert.match(paused?.answer ?? "", /잘 맞고 실제로 대화할 의사가 있는 분/);
  assert.match(paused?.answer ?? "", /문의하기/);
});

test("Company candidate-contact FAQ explains the one considerate follow-up", () => {
  const candidateContact = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:candidate-contact")
  );

  assert.match(candidateContact?.answer ?? "", /최소 3일/);
  assert.match(candidateContact?.answer ?? "", /follow-up 이메일을 한 번/);
  assert.match(candidateContact?.answer ?? "", /요청이 계속 유효하면/);
});

test("Company scheduling FAQ reflects Calendar-assisted coordination", () => {
  const scheduling = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:scheduling")
  );
  const pipeline = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:pipeline")
  );

  assert.match(scheduling?.answer ?? "", /Google Calendar를 연결/);
  assert.match(scheduling?.answer ?? "", /이미 바쁜 시간을 제외/);
  assert.match(scheduling?.answer ?? "", /Calendar 초대와 Google Meet 링크/);
  assert.match(scheduling?.answer ?? "", /Pipeline의 다른 단계로 옮기는 것만으로/);
  assert.match(pipeline?.answer ?? "", /단계만 옮기면/);
  assert.match(pipeline?.answer ?? "", /Harper에게 후보자 연락 또는 인터뷰 일정 조율/);
  assert.doesNotMatch(pipeline?.answer ?? "", /회사가 별도로 연락한 뒤/);
});
