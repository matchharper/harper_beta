import assert from "node:assert/strict";
import test from "node:test";
import { checkBeforeSend, type PreSendInput } from "./ashleyCheck";

const POSTING = "Company A — Backend Engineer (Seoul)\nWork mode: hybrid\nSalary (posting): 60,000,000–80,000,000 KRW per year\nWe build payments.";

const input = (draft: string, patch: Partial<PreSendInput> = {}): PreSendInput => ({
  draft, postingTexts: [POSTING], canAskCompany: false, suppressed: false, windowOpen: true, humanOwned: false, ...patch,
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

test("pay, visa, remote, relocation: only what the posting says", () => {
  assert.equal(checkBeforeSend(input("The salary is 60,000,000 to 80,000,000 KRW.")).status, "ok");
  const amount = checkBeforeSend(input("The salary is around 95,000,000 KRW."));
  assert.equal(amount.status, "fail");
  assert.match(amount.status === "fail" ? amount.reasons.join() : "", /연봉 금액/);
  assert.equal(checkBeforeSend(input("They sponsor visas for this role.")).status, "fail");
  assert.equal(checkBeforeSend(input("이 자리는 이주 지원이 있어요.")).status, "fail");
  assert.equal(checkBeforeSend(input("It is a hybrid role.")).status, "ok");
  // Fixed copy relays the company's own words: no posting check.
  assert.equal(checkBeforeSend(input('"We sponsor visas."', { fixedCopy: true })).status, "ok");
});

test("pay/culture rule, branch 1: a company mail can go — 'I'll ask the company without your name' passes", () => {
  const draft = "Hi Sam,\n\nThe posting doesn't say whether they sponsor visas. I'll ask the company without your name and get back to you.";
  assert.deepEqual(checkBeforeSend(input(draft, { canAskCompany: true })), { status: "ok" });
  const ko = "안녕하세요.\n\n연봉은 공고에 나와 있지 않아요. 회사에 이름 없이 물어볼게요.";
  assert.deepEqual(checkBeforeSend(input(ko, { canAskCompany: true })), { status: "ok" });
});

test("pay/culture rule, branch 2: no company mail can go — a promise to ask now is held; 'once you're on Harper' passes", () => {
  const now = checkBeforeSend(input("연봉은 공고에 나와 있지 않아요. 회사에 이름 없이 물어볼게요."));
  assert.equal(now.status, "fail");
  assert.match(now.status === "fail" ? now.reasons.join() : "", /회사에 물어보겠다고/);
  assert.equal(checkBeforeSend(input("I'll ask the company and get back to you.")).status, "fail");
  const later = "The posting doesn't say what the pay is. Once you're on Harper, I'll ask the team while introducing you.";
  assert.deepEqual(checkBeforeSend(input(later)), { status: "ok" });
  const laterKo = "처우는 공고에 나와 있지 않아요. 가입하시면 소개하면서 팀에 물어볼게요.";
  assert.deepEqual(checkBeforeSend(input(laterKo)), { status: "ok" });
});

test("never claiming to be a person, never calling herself an AI", () => {
  assert.equal(checkBeforeSend(input("저는 진짜 사람이에요.")).status, "fail");
  assert.equal(checkBeforeSend(input("I'm a real person, not a bot.")).status, "fail");
  assert.equal(checkBeforeSend(input("저는 AI 리크루터예요.")).status, "fail");
  assert.equal(checkBeforeSend(input("As I'm an AI, I can't say.")).status, "fail");
});

test("opt-out list and a human-owned thread fail; outside the hours the mail waits", () => {
  assert.equal(checkBeforeSend(input("Hi", { suppressed: true })).status, "fail");
  assert.equal(checkBeforeSend(input("Hi", { humanOwned: true })).status, "fail");
  assert.deepEqual(checkBeforeSend(input("Hi", { windowOpen: false })), { status: "wait", reasons: ["보내는 시간이 아니에요"] });
  // A failure wins over waiting (it goes to a person, not to the next open tick).
  assert.equal(checkBeforeSend(input("Hi", { windowOpen: false, suppressed: true })).status, "fail");
  assert.equal(checkBeforeSend(input("   ")).status, "fail");
});

test("curly apostrophes read as plain ones; 'the posting doesn’t say' passes, a stated fact does not (replay 11/21)", () => {
  const ask = { canAskCompany: true };
  assert.deepEqual(checkBeforeSend(input("Hi Candidate A,\n\nThe posting doesn’t list a salary range. I’ll ask Company A without using your name and get back to you.\n\nMay Harper send the company a nameless summary of your title?", ask)), { status: "ok" });
  assert.deepEqual(checkBeforeSend(input("The posting doesn’t say whether Company A sponsors visas. I’ll ask the company without using your name and get back to you.", ask)), { status: "ok" });
  assert.deepEqual(checkBeforeSend(input("The posting doesn’t say what Company B pays for the role. Once you join Harper, I’ll ask the team about pay when I introduce you.\n\nGet introduced: https://matchharper.com/jobs/invite/x?next=connect_request&question=What+is+the+pay%3F")), { status: "ok" });
  assert.deepEqual(checkBeforeSend(input("No salary range is listed.")), { status: "ok" });
  assert.deepEqual(checkBeforeSend(input("공고에 연봉은 안 나와 있어요.")), { status: "ok" });
  // Facts, not "the posting doesn't say": still held.
  assert.equal(checkBeforeSend(input("They don’t sponsor visas.")).status, "fail");
  assert.equal(checkBeforeSend(input("The role doesn’t include relocation support.")).status, "fail");
  assert.equal(checkBeforeSend(input("The posting doesn’t list pay, but it’s around $150k.")).status, "fail");
  // The other checks read curly apostrophes too.
  assert.equal(checkBeforeSend(input("I’m a real person, not a bot.")).status, "fail");
  assert.equal(checkBeforeSend(input("I’ll ask the company and get back to you.")).status, "fail");
});
