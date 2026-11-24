import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCING_SKIP, greetingName, mailedWithin, openingFromEvents, openingNote, parseOpening, sourcedPostingText, sourcingSkipNote,
  titleFromSearchGroup, websiteDomain, type SourcedOpening,
} from "./companySourcing";

// Made-up people, companies and addresses only (public repo).

test("the skip reasons are the exact words /ops counts as 제외 (gtm_agent_people.skip_reason)", () => {
  assert.deepEqual(Object.values(SOURCING_SKIP), ["하퍼 고객사", "30일 안에 연락한 회사", "맞는 회원 0명", "주소 없음", "공고를 읽지 못함", "막은 회사"]);
  assert.equal(sourcingSkipNote(SOURCING_SKIP.noAddress, "채용 담당자 주소를 찾지 못했어요"), "회사 소싱 제외 · 주소 없음 · 채용 담당자 주소를 찾지 못했어요");
  assert.equal(sourcingSkipNote(SOURCING_SKIP.customer), "회사 소싱 제외 · 하퍼 고객사");
});

test("30-day company rule: the same company by name, the same address, or the same company domain", () => {
  const recent = [
    { companyName: "Company A Inc.", toEmail: "jobs@company-a.example" },
    { companyName: "Company C", toEmail: "someone@gmail.com" },
  ];
  assert.equal(mailedWithin(recent, { names: ["Company A"] }), true);
  assert.equal(mailedWithin(recent, { names: ["Company B"], email: "riley@company-a.example" }), true);
  assert.equal(mailedWithin(recent, { names: ["Company B"], domain: "company-a.example" }), true);
  assert.equal(mailedWithin(recent, { names: ["Company B"], email: "riley@careers.company-a.example" }), true);
  // A personal mailbox's domain is everyone's: only the same address matches.
  assert.equal(mailedWithin(recent, { names: ["Company B"], email: "other@gmail.com" }), false);
  assert.equal(mailedWithin(recent, { names: ["Company B"], email: "someone@gmail.com" }), true);
  assert.equal(mailedWithin(recent, { names: ["Company B"], email: "riley@company-b.example", domain: "company-b.example" }), false);
  assert.equal(mailedWithin([], { names: ["Company A"] }), false);
});

test("the search's group is the title only when the post says it word for word", () => {
  const postText = "We're hiring a  Senior Backend Engineer in Seoul. DM me.";
  assert.equal(titleFromSearchGroup({ searchGroup: "senior backend engineer", postText }), "senior backend engineer");
  assert.equal(titleFromSearchGroup({ searchGroup: "hiring posts seoul", postText }), null);
  assert.equal(titleFromSearchGroup({ searchGroup: null, postText }), null);
  // The judge's titles, comma-separated: the first one the post says.
  assert.equal(titleFromSearchGroup({ searchGroup: "Staff Engineer, Senior Backend Engineer", postText }), "Senior Backend Engineer");
});

test("the reader's output is cleaned; anything malformed is no opening", () => {
  assert.deepEqual(parseOpening(null), { companyName: null, title: null, location: null, requirements: null, website: null });
  assert.deepEqual(parseOpening({ companyName: " Company A ", title: "Backend\n Engineer", location: "", requirements: "Go\nKubernetes", website: 3 }), {
    companyName: "Company A", title: "Backend Engineer", location: null, requirements: "Go\nKubernetes", website: null,
  });
});

test("the company's website counts only when the post shows it and it is the company's own", () => {
  const post = "Apply at https://careers.company-a.example/jobs or see lnkd.in/abc";
  assert.equal(websiteDomain("https://careers.company-a.example", post), "careers.company-a.example");
  assert.equal(websiteDomain("company-b.example", post), null);
  assert.equal(websiteDomain("lnkd.in", post), null);
  assert.equal(websiteDomain(null, post), null);
});

test("the opening is kept on the timeline and read back (the latest one), so the post is read once", () => {
  const opening: SourcedOpening = {
    companyName: "Company A", title: "Backend · Payments Engineer", location: null, requirements: "Go 3년 이상\n결제 경험", website: "company-a.example",
  };
  const note = openingNote(opening);
  assert.match(note, /^회사 소싱 · 읽은 공고 · Company A · Backend - Payments Engineer · - · company-a\.example\nGo 3년 이상/);
  const events = [
    { kind: "note" as const, note: openingNote({ ...opening, title: "Old Title", requirements: null }) },
    { kind: "found" as const, note: null },
    { kind: "note" as const, note },
    { kind: "note" as const, note: "회사 소싱 제외 · 주소 없음" },
  ];
  assert.deepEqual(openingFromEvents(events), { ...opening, title: "Backend - Payments Engineer" });
  assert.equal(openingFromEvents([{ kind: "note", note: "something else" }]), null);
  assert.equal(sourcedPostingText(opening, "We're hiring!"), "Go 3년 이상\n결제 경험\n\nWe're hiring!");
  assert.equal(sourcedPostingText({ requirements: null }, "We're hiring!"), "We're hiring!");
});

test("the greeting name: a Korean name without its surname, a romanized one by its given name, never a handle", () => {
  assert.equal(greetingName("김지훈"), "지훈");
  assert.equal(greetingName("이산"), "이산");
  assert.equal(greetingName("남궁민수"), "민수");
  assert.equal(greetingName("김 지훈"), "지훈");
  assert.equal(greetingName("Jihoon Kim"), "Jihoon");
  assert.equal(greetingName("Kim Jihoon"), "Jihoon");
  assert.equal(greetingName("Riley Moss, PhD"), "Riley");
  assert.equal(greetingName("Dr. Riley Moss"), "Riley");
  assert.equal(greetingName("Ji-hoon Park | Hiring"), "Ji-hoon");
  assert.equal(greetingName("@rileymoss"), null);
  assert.equal(greetingName("user123"), null);
  assert.equal(greetingName(null), null);
});
