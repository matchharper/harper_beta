import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_SERVICE_FAQ_ITEMS } from "@/lib/org/serviceFaq";

const hasTag = (
  item: (typeof COMPANY_SERVICE_FAQ_ITEMS)[number],
  tag: string
) => item.tags.some((current) => current === tag);

test("Company service FAQ has 23 distinct user-facing entries", () => {
  assert.equal(COMPANY_SERVICE_FAQ_ITEMS.length, 23);
  assert.equal(
    new Set(COMPANY_SERVICE_FAQ_ITEMS.map((item) => item.question)).size,
    23
  );
  assert.equal(
    new Set(COMPANY_SERVICE_FAQ_ITEMS.map((item) => item.key)).size,
    23
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

test("Documents hides retrieval aliases while keeping them in the FAQ seed", () => {
  const documentItems = COMPANY_SERVICE_FAQ_ITEMS.filter(
    (item) => item.showInDocuments !== false
  );
  const hiddenItems = COMPANY_SERVICE_FAQ_ITEMS.filter(
    (item) => item.showInDocuments === false
  );

  assert.equal(documentItems.length, 21);
  assert.deepEqual(
    hiddenItems.map((item) => item.key),
    ["pricing-subscription", "pricing-success-fee"]
  );
  assert.ok(hiddenItems.every((item) => hasTag(item, "topic:pricing")));
});

test("Company onboarding FAQ adapts to the workspace's current Role state", () => {
  const gettingStarted = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:getting-started")
  );

  assert.match(gettingStarted?.answer ?? "", /New role/);
  assert.match(gettingStarted?.answer ?? "", /Slack에서 Harper에게/);
  assert.match(gettingStarted?.answer ?? "", /작성 중인 역할/);
  assert.match(gettingStarted?.answer ?? "", /채용 중인 역할/);
  assert.match(gettingStarted?.answer ?? "", /Inbox에 연결 대기/);
  assert.match(gettingStarted?.answer ?? "", /중단하거나 삭제/);
});

test("Company FAQ covers exploratory hiring and recommendation feedback", () => {
  const exploratoryHiring = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:exploratory-hiring")
  );
  const feedback = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:recommendation-feedback")
  );

  assert.doesNotMatch(exploratoryHiring?.question ?? "", /\?$/);
  assert.match(
    exploratoryHiring?.answer ?? "",
    /등록된 역할의 실제 업무와 기준/
  );
  assert.match(
    exploratoryHiring?.answer ?? "",
    /실제로 대화할 의사가 있는 분만/
  );
  assert.doesNotMatch(feedback?.question ?? "", /\?$/);
  assert.match(feedback?.answer ?? "", /공통 기준인지 구분/);
  assert.match(feedback?.answer ?? "", /Hiring Brief나 Evaluation Criteria/);
  assert.match(feedback?.answer ?? "", /연결 거절은 보류가 아니라/);
});

test("Company pricing copy states the approved commercial boundary", () => {
  const pricingCopy = COMPANY_SERVICE_FAQ_ITEMS.filter((item) =>
    hasTag(item, "topic:pricing")
  )
    .map((item) => item.answer)
    .join("\n");

  assert.match(pricingCopy, /월 구독료나 기본 사용료는 없어요/);
  assert.match(pricingCopy, /채용이 성사된 경우에만 비용이 발생/);
  assert.match(pricingCopy, /회사별로 안내|개별적으로 연락드려/);
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

test("Company connection explanations keep internal review private", () => {
  const connectionCopy = COMPANY_SERVICE_FAQ_ITEMS.filter((item) =>
    ["topic:service-overview", "topic:pending-connection"].some((tag) =>
      hasTag(item, tag)
    )
  )
    .map((item) => item.answer)
    .join("\n");

  assert.match(connectionCopy, /회사와 역할/);
  assert.match(connectionCopy, /대화해 볼 의사/);
  assert.match(connectionCopy, /연결 대기 상태로 회사에 소개/);
  assert.doesNotMatch(connectionCopy, /Harper 팀의 마지막 확인/);
  assert.doesNotMatch(connectionCopy, /Harper의 마지막 검토/);
});

test("Company candidate-contact FAQ explains the one considerate follow-up", () => {
  const candidateContact = COMPANY_SERVICE_FAQ_ITEMS.find((item) =>
    hasTag(item, "topic:candidate-contact")
  );

  assert.match(candidateContact?.answer ?? "", /최소 3일/);
  assert.match(candidateContact?.answer ?? "", /후속 확인 이메일을 한 번/);
  assert.match(candidateContact?.answer ?? "", /요청이 계속 유효하면/);
  assert.match(candidateContact?.answer ?? "", /연결 후 채용 절차/);
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
  assert.match(scheduling?.answer ?? "", /Google Calendar에 일정을 만들고/);
  assert.match(scheduling?.answer ?? "", /Google Meet 링크/);
  assert.match(
    scheduling?.answer ?? "",
    /Pipeline의 다른 단계로 옮기는 것만으로/
  );
  assert.match(pipeline?.answer ?? "", /단계만 옮기면/);
  assert.match(
    pipeline?.answer ?? "",
    /Harper에게 후보자 연락 또는 인터뷰 일정 조율/
  );
  assert.doesNotMatch(pipeline?.answer ?? "", /회사가 별도로 연락한 뒤/);
});
