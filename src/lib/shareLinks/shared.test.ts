import assert from "node:assert/strict";
import test from "node:test";
import { gtmCompanyInviteRoleId, shareLinkRoleId } from "@/lib/gtmPlays/companyInviteRole";
import { isGtmOnboardingDeferred } from "@/lib/org/signup";
import { shareLinkMailHtml, shareLinkMailText } from "./mailBlock";
import {
  careerLines,
  isPersonalMailDomain,
  isShareLinkCta,
  isShareLinkToken,
  shareLinkCandidatePosting,
  shareLinkDomain,
  shareLinkLanguage,
  shareLinkPostingKey,
  type ShareLinkSnapshot,
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
  assert.equal(shareLinkPostingKey(null), "");
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
  assert.equal(shareLinkLanguage(null, { locale: "ko" }), "ko");
  assert.equal(shareLinkLanguage(null, { locale: null }), "en");
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

const snapshot: ShareLinkSnapshot = {
  name: "Kim <b>Min</b>",
  headline: null,
  location: null,
  summary: "s",
  fit: ["Built payments at \"Acme\" & scaled it", "5 years of Go"],
  career: [],
  wants: [],
};

test("the mail box escapes the candidate's words once and keeps the exact link", () => {
  const url = "https://matchharper.com/c/AbCdEfGhIjKlMnOpQrSt_-";
  const html = shareLinkMailHtml({ snapshot, url, language: "en" });
  assert.match(html, /Why Harper sent you Kim &lt;b&gt;Min&lt;\/b&gt;/);
  assert.match(html, /Built payments at &quot;Acme&quot; &amp; scaled it/);
  assert.doesNotMatch(html, /&amp;lt;/);
  assert.ok(html.includes(`href="${url}"`));
  const text = shareLinkMailText({ snapshot, url, language: "ko" });
  assert.match(text, /Harper가 Kim <b>Min<\/b>님을 보내는 이유/);
  assert.match(text, /✓ 5 years of Go/);
  assert.ok(text.endsWith(url));
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

test("without a posting, the Role comes from the candidate: latest title, then headline", () => {
  const base = {
    snapshot: { ...snapshot, name: "김하준", summary: "결제 백엔드 5년", career: ["Backend Engineer · Acme · 2021.03 – 현재"], fit: ["결제 시스템 경험"], location: "서울" },
    companyName: "Beta",
    language: "ko" as const,
  };
  const posting = shareLinkCandidatePosting({ ...base, currentRole: "Backend Engineer" });
  assert.equal(posting.title, "Backend Engineer");
  assert.equal(posting.url, null);
  assert.equal(posting.location, "서울");
  assert.match(posting.description, /^Beta에 직접 연락한 김하준님을 보고 만든 Role이에요/);
  assert.match(posting.description, /- Backend Engineer · Acme · 2021\.03 – 현재/);
  assert.match(posting.description, /이 회사에 도움이 될 수 있는 이유:\n- 결제 시스템 경험/);
  // The heading after the career list starts its own block, so it is not read as part of the last career item.
  assert.match(posting.description, /현재\n\n이 회사에 도움이 될 수 있는 이유:/);
  assert.equal(shareLinkCandidatePosting({ ...base, currentRole: null, snapshot: { ...base.snapshot, headline: "Payments engineer" } }).title, "Payments engineer");
  assert.equal(shareLinkCandidatePosting({ ...base, currentRole: " ", snapshot: { ...base.snapshot, headline: null } }).title, "새 Role");
});
