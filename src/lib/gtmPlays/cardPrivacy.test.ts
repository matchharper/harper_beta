import assert from "node:assert/strict";
import test from "node:test";
import { cardLeaks, headlineOrgs, identifyingTokens, isSameOrg, normalizeOrgName } from "./cardPrivacy";

const member = {
  name: "Edward Drake",
  headline: "Director, Investment Banking at Clarus Securities Inc. | ex-SK Telecom",
  experiences: [{ company: "Clarus Securities Inc." }, { company: "토스(비바리퍼블리카)" }, { company: "Freelance" }],
  educations: [{ school: "Seoul National University" }, { school: "연세대학교" }],
};

const card = (text: Partial<{ title: string; highlights: string[]; fit: string }>) => ({
  title: text.title ?? "투자은행 디렉터",
  highlights: text.highlights ?? ["국내 증권사에서 M&A 자문 10년"],
  fit: text.fit ?? "딜 경험이 많아요.",
});

test("organisation names compare without legal suffixes, (주) or punctuation", () => {
  assert.equal(normalizeOrgName("Clarus Securities, Inc."), "clarus securities");
  assert.equal(normalizeOrgName("(주)비바리퍼블리카"), "비바리퍼블리카");
  assert.equal(normalizeOrgName("Costco"), "costco");
});

test("a headline names its employer after 'at' / '@' and ex-/formerly organisations", () => {
  assert.deepEqual(headlineOrgs(member.headline), ["Clarus Securities Inc.", "SK Telecom"]);
  assert.deepEqual(headlineOrgs("Venture Capital | Private Markets"), []);
  assert.deepEqual(headlineOrgs("VP at SBVA (formerly SoftBank Ventures Asia)"), ["SBVA", "SoftBank Ventures Asia"]);
});

test("a safe card passes; the name, an employer, a school, a link or an address is caught", () => {
  const tokens = identifyingTokens(member);
  assert.deepEqual(cardLeaks(card({}), tokens), []);
  assert.deepEqual(cardLeaks(card({ title: "Edward의 투자 경력" }), tokens), ["edward"]);
  assert.ok(cardLeaks(card({ highlights: ["Clarus에서 M&A 자문"] }), tokens).includes("clarus"));
  assert.ok(cardLeaks(card({ fit: "clarus securities 출신이에요." }), tokens).includes("clarus securities"));
  assert.ok(cardLeaks(card({ highlights: ["토스에서 결제 PM"] }), tokens).includes("토스"));
  assert.ok(cardLeaks(card({ highlights: ["비바리퍼블리카 근무"] }), tokens).includes("비바리퍼블리카"));
  assert.ok(cardLeaks(card({ fit: "연세대학교 졸업" }), tokens).includes("연세대학교"));
  assert.ok(cardLeaks(card({ fit: "SK Telecom 출신" }), tokens).includes("sk telecom"));
  assert.deepEqual(cardLeaks(card({ fit: "자세한 건 linkedin.com/in/x" }), tokens), ["링크"]);
  assert.ok(cardLeaks(card({ fit: "edward@x.com" }), tokens).includes("이메일"));
});

test("generic words and short tokens are not flagged", () => {
  const tokens = identifyingTokens(member);
  for (const token of ["seoul", "freelance", "ai", "inc", "national"]) assert.ok(!tokens.includes(token), token);
  assert.deepEqual(cardLeaks(card({ highlights: ["서울 기반 AI 투자", "Seoul-based national bank 경험"] }), tokens), []);
  // Whole words only for Latin text: "drakeford" is not "Drake".
  assert.deepEqual(cardLeaks(card({ fit: "drakeford 프로젝트" }), tokens), []);
});

test("Korean names are caught anywhere in the text", () => {
  const tokens = identifyingTokens({ name: "박성우", headline: null, experiences: [], educations: [] });
  assert.deepEqual(cardLeaks(card({ fit: "박성우님은 투자 심사를 했어요." }), tokens), ["박성우"]);
});

test("the posting company matches its current employee's employer name", () => {
  assert.ok(isSameOrg("Sierra", "Sierra Technologies, Inc."));
  assert.ok(isSameOrg("(주)토스", "토스"));
  assert.ok(!isSameOrg("AI", "AI Labs"));
  assert.ok(!isSameOrg("Toss", "Tossup Games"));
  assert.ok(!isSameOrg("", "Toss"));
});
