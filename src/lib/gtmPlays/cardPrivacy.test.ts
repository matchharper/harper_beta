import assert from "node:assert/strict";
import test from "node:test";
import { cardLeaks, headlineOrgs, identifyingTokens, isSameOrg, normalizeOrgName } from "./cardPrivacy";

// Made-up people and organisations (public repo).
const member = {
  name: "Jordan Vale",
  headline: "Director, Investment Banking at Northwind Securities Inc. | ex-Bluecomet Telecom",
  experiences: [{ company: "Northwind Securities Inc." }, { company: "가람페이(가람리퍼블릭)" }, { company: "Freelance" }],
  educations: [{ school: "Hanbit National University" }, { school: "한빛대학교" }],
};

const card = (text: Partial<{ title: string; highlights: string[]; fit: string }>) => ({
  title: text.title ?? "투자은행 디렉터",
  highlights: text.highlights ?? ["국내 증권사에서 M&A 자문 10년"],
  fit: text.fit ?? "딜 경험이 많아요.",
});

test("organisation names compare without legal suffixes, (주) or punctuation", () => {
  assert.equal(normalizeOrgName("Northwind Securities, Inc."), "northwind securities");
  assert.equal(normalizeOrgName("(주)가람리퍼블릭"), "가람리퍼블릭");
  assert.equal(normalizeOrgName("Orbitmart"), "orbitmart");
});

test("a headline names its employer after 'at' / '@' and ex-/formerly organisations", () => {
  assert.deepEqual(headlineOrgs(member.headline), ["Northwind Securities Inc.", "Bluecomet Telecom"]);
  assert.deepEqual(headlineOrgs("Venture Capital | Private Markets"), []);
  assert.deepEqual(headlineOrgs("VP at NVA (formerly Nimbus Ventures Asia)"), ["NVA", "Nimbus Ventures Asia"]);
});

test("a safe card passes; the name, an employer, a school, a link or an address is caught", () => {
  const tokens = identifyingTokens(member);
  assert.deepEqual(cardLeaks(card({}), tokens), []);
  assert.deepEqual(cardLeaks(card({ title: "Jordan의 투자 경력" }), tokens), ["jordan"]);
  assert.ok(cardLeaks(card({ highlights: ["Northwind에서 M&A 자문"] }), tokens).includes("northwind"));
  assert.ok(cardLeaks(card({ fit: "northwind securities 출신이에요." }), tokens).includes("northwind securities"));
  assert.ok(cardLeaks(card({ highlights: ["가람페이에서 결제 PM"] }), tokens).includes("가람페이"));
  assert.ok(cardLeaks(card({ highlights: ["가람리퍼블릭 근무"] }), tokens).includes("가람리퍼블릭"));
  assert.ok(cardLeaks(card({ fit: "한빛대학교 졸업" }), tokens).includes("한빛대학교"));
  assert.ok(cardLeaks(card({ fit: "Bluecomet Telecom 출신" }), tokens).includes("bluecomet telecom"));
  assert.deepEqual(cardLeaks(card({ fit: "자세한 건 linkedin.com/in/x" }), tokens), ["링크"]);
  assert.ok(cardLeaks(card({ fit: "jordan@x.com" }), tokens).includes("이메일"));
});

test("generic words and short tokens are not flagged", () => {
  const tokens = identifyingTokens(member);
  for (const token of ["seoul", "freelance", "ai", "inc", "national"]) assert.ok(!tokens.includes(token), token);
  assert.deepEqual(cardLeaks(card({ highlights: ["서울 기반 AI 투자", "Seoul-based national bank 경험"] }), tokens), []);
  // Whole words only for Latin text: "valeford" is not "Vale".
  assert.deepEqual(cardLeaks(card({ fit: "valeford 프로젝트" }), tokens), []);
});

test("Korean names are caught anywhere in the text", () => {
  const tokens = identifyingTokens({ name: "김하늘", headline: null, experiences: [], educations: [] });
  assert.deepEqual(cardLeaks(card({ fit: "김하늘님은 투자 심사를 했어요." }), tokens), ["김하늘"]);
});

test("the posting company matches its current employee's employer name", () => {
  assert.ok(isSameOrg("Orbit", "Orbit Technologies, Inc."));
  assert.ok(isSameOrg("(주)가람", "가람"));
  assert.ok(!isSameOrg("AI", "AI Labs"));
  assert.ok(!isSameOrg("Nova", "Novalis Games"));
  assert.ok(!isSameOrg("", "Nova"));
});
