import assert from "node:assert/strict";
import test from "node:test";
import { gtmCompanyInviteRoleId, shareLinkRoleId } from "@/lib/gtmPlays/companyInviteRole";
import { isGtmOnboardingDeferred } from "@/lib/org/signup";
import { shareLinkMailPs } from "./mailBlock";
import {
  careerLines,
  isPersonalMailDomain,
  isShareLinkCta,
  isShareLinkToken,
  shareLinkDomain,
  shareLinkLanguage,
  shareLinkPostingKey,
} from "./shared";

test("a token is 22 url-safe characters (16 random bytes)", () => {
  assert.equal(isShareLinkToken("AbCdEfGhIjKlMnOpQrSt_-"), true);
  assert.equal(isShareLinkToken("short"), false);
  assert.equal(isShareLinkToken("AbCdEfGhIjKlMnOpQrSt_-x"), false);
  assert.equal(isShareLinkToken("AbCdEfGhIjKlMnOpQrSt/+"), false);
  assert.equal(isShareLinkToken(null), false);
});

test("buttons are a fixed set", () => {
  for (const cta of ["salary", "start", "schedule", "more", "ask"]) assert.equal(isShareLinkCta(cta), true);
  assert.equal(isShareLinkCta("delete"), false);
});

test("the company domain comes from an address or a URL", () => {
  assert.equal(shareLinkDomain("Recruit@Acme.co.kr"), "acme.co.kr");
  assert.equal(shareLinkDomain("https://www.acme.com/careers?x=1"), "acme.com");
  assert.equal(shareLinkDomain("acme.com"), "acme.com");
  assert.equal(shareLinkDomain("not a domain"), null);
  assert.equal(shareLinkDomain(""), null);
});

test("personal mail domains never count as a company", () => {
  assert.equal(isPersonalMailDomain("gmail.com"), true);
  assert.equal(isPersonalMailDomain("NAVER.COM"), true);
  assert.equal(isPersonalMailDomain("acme.com"), false);
  assert.equal(isPersonalMailDomain(null), false);
});

test("one link per posting: the URL without query or hash, else the title", () => {
  assert.equal(
    shareLinkPostingKey({ url: "https://Jobs.acme.com/123/?utm=mail#apply", title: "x" }),
    shareLinkPostingKey({ url: "https://jobs.acme.com/123", title: "y" })
  );
  assert.equal(shareLinkPostingKey({ url: null, title: "  Backend   Engineer " }), "title:backend engineer");
});

test("the page follows the posting's language, else the candidate's", () => {
  const posting = (title: string, description = "") => ({ title, description, companyName: null, url: null, location: null });
  assert.equal(shareLinkLanguage(posting("백엔드 엔지니어", "서버 개발을 담당합니다"), { locale: "en" }), "ko");
  assert.equal(shareLinkLanguage(posting("Backend Engineer", "Own our APIs"), { locale: "ko" }), "en");
  assert.equal(shareLinkLanguage(posting(""), { locale: "ko" }), "ko");
  assert.equal(shareLinkLanguage(posting(""), { locale: null }), "en");
});

test("career lines: newest three, current job ends with now", () => {
  const lines = careerLines([
    { role: "Backend Engineer", company: "Acme", start: "2021-03-01", end: null },
    { role: null, company: null, start: "2020-01-01", end: "2021-01-01" },
    { role: "Intern", company: "Beta", start: "2019-06-01", end: "2019-12-01" },
    { role: "Student", company: "Uni", start: null, end: null },
    { role: "Old", company: "Gamma", start: "2010-01-01", end: "2011-01-01" },
  ], "ko");
  assert.deepEqual(lines, [
    "Backend Engineer · Acme · 2021.03 – 현재",
    "Intern · Beta · 2019.06 – 2019.12",
    "Student · Uni",
  ]);
});

test("the mail ends with a plain P.S. in the candidate's voice: no box, no button, the exact link", () => {
  const url = "https://matchharper.com/c/AbCdEfGhIjKlMnOpQrSt_-";
  const ko = shareLinkMailPs({ snapshot: { wants: ["초기 팀의 백엔드 리드"] }, url, language: "ko" });
  assert.equal(ko.text, [
    "P.S. 이력서에 다 담지 못한 내용(제가 찾는 일과 조건, 이 자리와 맞는 점)은 제 커리어 에이전트 Harper에 정리해 두었습니다. 로그인 없이 바로 보시고, 궁금한 점은 Harper에게 물어보실 수 있습니다.",
    `후보 요약 및 Q&A 보기: ${url}`,
  ].join("\n"));
  assert.ok(ko.html.includes(`<a href="${url}">후보 요약 및 Q&amp;A 보기</a>`));
  assert.doesNotMatch(ko.html, /style=|<table|button/);
  // Only what the page shows is named: without shared wants it does not promise conditions.
  assert.match(shareLinkMailPs({ snapshot: { wants: [] }, url, language: "ko" }).text, /\(경력 요약과 이 자리와 맞는 점\)/);
  assert.match(shareLinkMailPs({ snapshot: { wants: [] }, url, language: "en" }).text, /^P\.S\. What my resume doesn't cover \(my background and why this role fits\)/);
});

test("one Role per link per workspace, separate from #2 mails", () => {
  const link = "11111111-1111-4111-8111-111111111111";
  const workspace = "22222222-2222-4222-8222-222222222222";
  const id = shareLinkRoleId(link, workspace);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, shareLinkRoleId(link.toUpperCase(), workspace));
  assert.notEqual(id, shareLinkRoleId(link, "33333333-3333-4333-8333-333333333333"));
  assert.notEqual(id, gtmCompanyInviteRoleId(link, workspace));
});

test("the person who signed up from a link sees the Role first; others onboard as usual", () => {
  const marker = { linkId: "l", roleId: "r", talentId: "t", claimedBy: "u1", claimedAt: "2026-11-15T00:00:00Z" };
  const state = { createdBy: "u1", researchStatus: "idle" as const, shareLink: marker };
  assert.equal(isGtmOnboardingDeferred(state, "u1"), true);
  assert.equal(isGtmOnboardingDeferred(state, "u2"), false);
  assert.equal(isGtmOnboardingDeferred({ ...state, shareLink: { ...marker, claimedBy: "u2" } }, "u1"), false);
  assert.equal(isGtmOnboardingDeferred({ createdBy: "u1", researchStatus: "idle" }, "u1"), false);
});
