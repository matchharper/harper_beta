import assert from "node:assert/strict";
import test from "node:test";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID, gtmWritesEnabled } from "./constants";
import {
  cardText,
  readCardText,
  companyDomain,
  extractEmails,
  cleanGtmKeywords,
  firstGtmEmail,
  gtmOptOutMarkdown,
  GTM_DEFAULT_ENVELOPE,
  gtmEnvelopeProblem,
  gtmFromHeader,
  gtmMemberSearchJd,
  parseGtmEmailList,
  gtmRoleKey,
  gtmRoleName,
  gtmRolePlan,
  gtmSearchRequest,
  splitGtmSearchRequest,
  type GtmJd,
  gtmMailLinkOrigin,
} from "./shared";

const jd: GtmJd = {
  source: "customer_role", companyName: "SBVA", title: "Investment Associate", description: "Role text",
  url: "https://example.com/job", location: "Seoul", sourceRoleId: "11111111-1111-1111-1111-111111111111",
  sourceWorkspaceId: "22222222-2222-2222-2222-222222222222", contactEmails: [],
};

test("a GTM Role lives in Harper's workspace, sealed from members by the existing test-only contract", () => {
  const plan = gtmRolePlan(jd, { roleName: gtmRoleName(jd), request: "Find associates", criteria: [] });
  assert.equal(plan.company_roles.company_workspace_id, GTM_WORKSPACE_ID);
  assert.equal(plan.company_roles.status, "active");
  assert.equal(plan.company_roles.information.testOnly, true);
  assert.deepEqual(plan.company_roles.information.testTalentIds, []);
  assert.equal(plan.company_roles.information.purpose, GTM_ROLE_PURPOSE);
  assert.equal(plan.company_roles.information.gtm.sourceRoleId, jd.sourceRoleId);
  assert.equal(plan.company_internal_roles.request, "Find associates");
  assert.equal(plan.company_roles.information.gtm.baseRequest, "Find associates");
  assert.equal(plan.company_roles.information.gtm.extraRequest, "");
  assert.equal(plan.company_roles.information.gtm.key, `customer_role:${jd.sourceRoleId}`);
});

test("extra instructions typed before the Role is saved go into the request it is created with", () => {
  const plan = gtmRolePlan(jd, { roleName: "Associate", request: "Find associates", criteria: [] }, " 서울 거주 ");
  assert.equal(plan.company_internal_roles.request, "Find associates\n\n추가 요청:\n서울 거주");
  assert.equal(plan.company_roles.information.gtm.extraRequest, "서울 거주");
});

test("the same posting maps to one GTM Role key", () => {
  const url = { ...jd, source: "url" as const, sourceRoleId: null };
  assert.equal(gtmRoleKey({ ...url, url: "https://www.jobs.example.com/123/?ref=li" }), "url:jobs.example.com/123");
  assert.equal(gtmRoleKey({ ...url, url: "http://jobs.example.com/123" }), "url:jobs.example.com/123");
  // Postings that live in the query stay apart; tracking parameters do not split one posting.
  const saramin = (idx: string) => gtmRoleKey({ ...url, url: `https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=${idx}&utm_source=x` });
  assert.notEqual(saramin("1"), saramin("2"));
  assert.equal(saramin("1"), "url:saramin.co.kr/zf_user/jobs/view?rec_idx=1");
  assert.notEqual(gtmRoleKey({ ...url, url: "https://boards.example.com/jobs?gh_jid=1" }), gtmRoleKey({ ...url, url: "https://boards.example.com/jobs?gh_jid=2" }));
  const text = { ...jd, source: "text" as const, sourceRoleId: null, url: null };
  assert.equal(gtmRoleKey({ ...text, companyName: " Sierra ", title: "Sales  Director" }), "text:sierra|sales director");
});

test("the member search reads the Role's text, request and criteria as one JD", () => {
  const memberJd = gtmMemberSearchJd({
    companyName: null, title: "Sales Director", description: "Role text", request: "Find sellers",
    criteria: [{ name: "Seoul", criteria: "Works in Seoul", requirement: "must" }], url: null, location: "Seoul",
  });
  assert.equal(memberJd.companyName, "Harper");
  assert.equal(memberJd.description, "Role text\n\nFind sellers\n\n- Seoul (필수): Works in Seoul");
});

test("extra instructions are added to the request the search reads, and come back apart for editing", () => {
  const request = gtmSearchRequest(" Find associates ", " 서울 거주, 초기 스타트업 경험 우선 ");
  assert.equal(request, "Find associates\n\n추가 요청:\n서울 거주, 초기 스타트업 경험 우선");
  assert.equal(gtmSearchRequest("Find associates", "  "), "Find associates");
  assert.deepEqual(
    splitGtmSearchRequest(request, { baseRequest: "Find associates", extraRequest: "서울 거주, 초기 스타트업 경험 우선" }),
    { base: "Find associates", extra: "서울 거주, 초기 스타트업 경험 우선" },
  );
  // The request was changed elsewhere (e.g. /org): the whole text becomes the base.
  assert.deepEqual(
    splitGtmSearchRequest("Edited elsewhere", { baseRequest: "Find associates", extraRequest: "x" }),
    { base: "Edited elsewhere", extra: "" },
  );
  assert.deepEqual(splitGtmSearchRequest(null, null), { base: "", extra: "" });
});

test("the Role name carries the hiring company once", () => {
  assert.equal(gtmRoleName(jd), "SBVA · Investment Associate");
  assert.equal(gtmRoleName({ companyName: "Toss", title: "Toss Backend Engineer" }), "Toss Backend Engineer");
  assert.equal(gtmRoleName({ companyName: "", title: "Engineer" }), "Engineer");
});

test("addresses are read only from the text, without no-reply ones", () => {
  assert.deepEqual(
    extractEmails("Send to Recruit@Example.co.kr. or noreply@example.com", "jobs@example.com", "recruit@example.co.kr"),
    ["recruit@example.co.kr", "jobs@example.com"],
  );
  assert.deepEqual(extractEmails(null, undefined, ""), []);
});

test("company domain from a homepage", () => {
  assert.equal(companyDomain("https://www.Example.com/careers?x=1"), "example.com");
  assert.equal(companyDomain("example.co.kr"), "example.co.kr");
  assert.equal(companyDomain(null), null);
});

test("writes stay off unless the server says on", () => {
  assert.equal(gtmWritesEnabled({}), false);
  assert.equal(gtmWritesEnabled({ GTM_PLAYS_WRITES: "true" }), false);
  assert.equal(gtmWritesEnabled({ GTM_PLAYS_WRITES: " ON " }), true);
});

test("the sender is Chris by default and must be a matchharper.com address", () => {
  assert.equal(gtmEnvelopeProblem(GTM_DEFAULT_ENVELOPE), null);
  assert.equal(gtmFromHeader(GTM_DEFAULT_ENVELOPE), "Chris Heo <chris@matchharper.com>");
  assert.match(gtmEnvelopeProblem({ ...GTM_DEFAULT_ENVELOPE, fromEmail: "chris@gmail.com" }) ?? "", /matchharper\.com/);
  assert.match(gtmEnvelopeProblem({ ...GTM_DEFAULT_ENVELOPE, cc: ["not-an-email"] }) ?? "", /참조/);
  assert.equal(gtmFromHeader({ fromName: 'Chris "Heo" <x>\r\nBcc: a@b.c', fromEmail: "Chris@MatchHarper.com" }),
    "Chris Heo x Bcc a@b.c <chris@matchharper.com>");
  assert.deepEqual(parseGtmEmailList("a@x.com, B@x.com; a@x.com  c@y.io"), ["a@x.com", "b@x.com", "c@y.io"]);
});

test("scraped DB keywords are plain phrases, at most six", () => {
  assert.deepEqual(
    cleanGtmKeywords(["Sales (Korea)", "sales  (korea)", "x", "head of sales", "100%_match", "영업 총괄", "a", "b2b sales", "country manager", "account executive", "extra"]),
    ["Sales Korea", "head of sales", "100 match", "영업 총괄", "b2b sales", "country manager"],
  );
});

test("the scraped DB keeps addresses as a JSON list; the first one is used", () => {
  assert.equal(firstGtmEmail('["Kim.Lee@Example.com", "other@x.io"]'), "kim.lee@example.com");
  assert.equal(firstGtmEmail(" plain@x.co.kr "), "plain@x.co.kr");
  assert.equal(firstGtmEmail("[]"), null);
  assert.equal(firstGtmEmail(null), null);
});

test("the opt-out line links to the mail's own page, reply only in previews without one", () => {
  assert.equal(gtmOptOutMarkdown("ko", "https://matchharper.com/api/email/gtm-unsubscribe?m=1&t=2"),
    "*이런 메일을 더 받지 않으시려면 [여기](https://matchharper.com/api/email/gtm-unsubscribe?m=1&t=2)를 눌러 주세요.*");
  assert.match(gtmOptOutMarkdown("en", "https://x.test/u"), /\[unsubscribe here\]\(https:\/\/x\.test\/u\)/);
  assert.match(gtmOptOutMarkdown("ko", null), /답장/);
});

test("mail links go to matchharper.com unless a local server names its own loopback address", () => {
  assert.equal(gtmMailLinkOrigin({}), "https://matchharper.com");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://127.0.0.1:3103/" }), "http://127.0.0.1:3103");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://localhost:3000" }), "http://localhost:3000");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "https://evil.example" }), "https://matchharper.com");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://127.0.0.1.evil.example" }), "https://matchharper.com");
});

test("a card edited as one text keeps title, highlights and fit apart", () => {
  const card = { title: "AI 사업화 리더", highlights: ["조직 100명 운영", "GTM 체계 구축"], fit: "엔터프라이즈 이해가 깊어요." };
  assert.deepEqual(readCardText(cardText(card)), { fields: card, cut: [] });
  // Lines are re-read wherever they are; a missing title stays empty instead of taking the fit.
  assert.deepEqual(readCardText("- 강점\n맞는 이유 1\n맞는 이유 2").fields, { title: "", highlights: ["강점"], fit: "맞는 이유 1 맞는 이유 2" });
  const long = readCardText(["제목", "- a", "- b", "- c", "- d", "x".repeat(301)].join("\n"));
  assert.deepEqual(long.fields.highlights, ["a", "b", "c"]);
  assert.equal(long.fields.fit.length, 300);
  assert.deepEqual(long.cut, ["강점은 3줄까지만 들어가요", "맞는 이유는 300자까지만 들어가요"]);
});
