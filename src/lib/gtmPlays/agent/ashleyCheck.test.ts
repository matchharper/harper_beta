import assert from "node:assert/strict";
import test from "node:test";
import { checkBeforeSend, type PreSendInput } from "./ashleyCheck";

const POSTING = "Company A — Backend Engineer (Seoul)\nWork mode: hybrid\nSalary (posting): 60,000,000–80,000,000 KRW per year\nWe build payments.";

const input = (draft: string, patch: Partial<PreSendInput> = {}): PreSendInput => ({
  draft, postingTexts: [POSTING], suppressed: false, windowOpen: true, humanOwned: false, ...patch,
});

test("a plain answer passes", () => {
  assert.deepEqual(checkBeforeSend(input("안녕하세요, 지민님.\n\n이 자리는 서울에서 일하는 하이브리드 근무예요. 가입하시면 바로 팀에 소개할게요.")), { status: "ok" });
});

test("links: Harper's only; email addresses and phone numbers: none", () => {
  assert.equal(checkBeforeSend(input("See https://matchharper.com/jobs and app.matchharper.com.")).status, "ok");
  const foreign = checkBeforeSend(input("Apply at https://jobs.example.com/a or example.org/apply."));
  assert.equal(foreign.status, "fail");
  assert.match(foreign.status === "fail" ? foreign.reasons[0] : "", /하퍼 밖 링크/);
  assert.equal(checkBeforeSend(input("Write to recruiter@example.com.")).status, "fail");
  assert.equal(checkBeforeSend(input("Write to ashley@matchharper.com.")).status, "ok");
  assert.equal(checkBeforeSend(input("Call me at +82 10-1234-5678.")).status, "fail");
  assert.equal(checkBeforeSend(input("It pays 60,000,000–80,000,000 KRW a year.")).status, "ok");
});

test("pay: an amount must be in the posting (a question is not a claim)", () => {
  assert.equal(checkBeforeSend(input("The salary is 60,000,000 to 80,000,000 KRW.")).status, "ok");
  const amount = checkBeforeSend(input("The salary is around 95,000,000 KRW."));
  assert.equal(amount.status, "fail");
  assert.match(amount.status === "fail" ? amount.reasons.join() : "", /연봉 금액/);
  assert.equal(checkBeforeSend(input("연봉은 9,500만 원 정도예요.")).status, "fail");
  assert.equal(checkBeforeSend(input("The posting doesn’t list pay, but it’s around $150k.")).status, "fail");
  assert.equal(checkBeforeSend(input("Would around $150k work for you?")).status, "ok");
  // The signup link's words are not a sentence about the role.
  assert.deepEqual(checkBeforeSend(input("Get introduced: https://matchharper.com/jobs/invite/x?next=connect_request&question=Is+it+%24150k%3F")), { status: "ok" });
  // Fixed copy relays the company's own words: no pay check.
  assert.equal(checkBeforeSend(input('"We pay $200k."', { fixedCopy: true })).status, "ok");
});

test("meaning is Ashley's, not a word list: the replies replay 3 held pass (Shaun 11/21)", () => {
  for (const draft of [
    "On pay, the posting is silent, so I can't tell you a range.",
    "There's nothing about relocation support in the posting.",
    "You mentioned you'd need visa sponsorship. The posting doesn't say whether they sponsor visas, and I can't ask the company for you.",
    "I can’t ask the company for you on this one, but Harper can send you similar roles once you join.",
    "공고에 연봉은 안 나와 있어요. 이 공고는 제가 회사에 물어볼 수 없어요.",
    "회사에 이름 없이 물어볼게요. 답이 올지, 언제 올지는 약속드리기 어려워요.",
    "The posting doesn't say what the pay is. Once you're on Harper, I'll ask the team while introducing you.",
  ]) assert.deepEqual(checkBeforeSend(input(draft)), { status: "ok" }, draft);
});

test("opt-out list and a human-owned thread fail; outside the hours the mail waits", () => {
  assert.equal(checkBeforeSend(input("Hi", { suppressed: true })).status, "fail");
  assert.equal(checkBeforeSend(input("Hi", { humanOwned: true })).status, "fail");
  assert.deepEqual(checkBeforeSend(input("Hi", { windowOpen: false })), { status: "wait", reasons: ["보내는 시간이 아니에요"] });
  // A failure wins over waiting (it goes to a person, not to the next open tick).
  assert.equal(checkBeforeSend(input("Hi", { windowOpen: false, suppressed: true })).status, "fail");
  assert.equal(checkBeforeSend(input("   ")).status, "fail");
});
