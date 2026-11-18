import assert from "node:assert/strict";
import test from "node:test";
import { planDecisionSchema, type Fit } from "@/lib/externalRecommendationsV2/contract";
import type { V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";
import { PLAN_PROMPT } from "@/lib/externalRecommendationsV2/prompts";
import { cleanPublicDescription } from "../shared";
import {
  MAX_POSTING_AGE_DAYS, OUTREACH_PLAN_PROMPT, OUTREACH_REVISE_PROMPT, byRankScore, companyKey, detectLanguage, fitClears,
  fittingCompanyCount, gtmBrandNames, gtmRoleTitle, internalCandidate, isExcludedCompany, outreachContext, outreachPlanFields,
  postingExcluded, postingsFromSelection, publicBatchWorthReading, reviseEvidence, DRY_PUBLIC_READ, ENOUGH_FITS, PUBLIC_READ_MAX, shortfall, withFitScores, withOutreachRecency, withoutNames, type AgentPlanStep,
  type InternalRoleSource, type PostingMeta, type ScoredPosting,
} from "./match";
import type { AgentPersonInput } from "./types";

const person: AgentPersonInput = {
  name: "지수", headline: "Backend Engineer", location: "Seoul", currentCompany: "(주)데모페이", profileUrl: null,
  profileText: "결제 백엔드 5년, Kotlin, Spring", signalText: "이직 준비 중입니다. 백엔드 포지션 찾고 있어요.", signalUrl: null,
  signalAt: "2026-11-15T00:00:00Z",
};

const plan: V2SearchPlan = {
  searchIntentSummary: "결제 백엔드", roleTitles: ["Backend Engineer", "Server Engineer"],
  ftsKeywords: [{ terms: ["Kotlin", "Spring", "payments"], weight: 3 }], includeContract: false, includeIntern: false,
  includeParttime: false, includeRemote: true, remoteOnly: false, isPreferEntry: -1, postingRecency: null,
  countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
};

const fit = (mutualFit: number, constraintPass = 90, candidateInterest = 70, companyInterest = 70): Fit =>
  ({ mutualFit, constraintPass, candidateInterest, companyInterest });

const scoredPosting = (roleId: string, companyName: string, value: Fit): ScoredPosting =>
  ({ roleId, companyName, title: "Backend Engineer", location: "Seoul", fit: value });

const meta = (roleId: string, companyName: string): PostingMeta =>
  ({ kind: "external", roleId, url: null, companyName, title: "Backend Engineer", location: "Seoul" });

const gtmSource: InternalRoleSource = {
  role_id: "00000000-0000-4000-8000-000000000001", kind: "gtm", name: "핀테크 스타트업 · Backend Engineer at Hidden Ledger",
  company_workspace_id: "00000000-0000-4000-8000-0000000000aa", company_name: "Harper 고객사",
  description: "Hidden Ledger builds payment ledgers. Join Hidden Ledger's core team.", location_text: "Seoul", work_mode: null,
  type: null, posted_at: null, seniority_level: null, summary: { ko: { content: "Hidden Ledger 요약" } }, salary_min: null,
  salary_max: null, salary_currency: null, salary_period: null, salary_range: null, company_description: "Hidden Ledger Inc.",
  company_db_short_description: null, company_db_employee_count_range: null, company_db_founded_year: null,
  company_db_location: null, public_description: "핀테크 스타트업", gtm_company: "Hidden Ledger",
};

test("language from the person's own words", () => {
  assert.equal(detectLanguage(["이직 준비 중입니다 backend"]), "ko");
  assert.equal(detectLanguage(["Open to work as a backend engineer"]), "en");
  assert.equal(detectLanguage([null, ""], "en"), "en");
});

test("company keys ignore legal forms, spaces and case; the current company is excluded", () => {
  assert.equal(companyKey("(주)데모 페이"), companyKey("데모페이"));
  assert.equal(companyKey("Demo Pay, Inc."), "demopay");
  assert.equal(isExcludedCompany("데모페이", ["(주)데모페이"]), true);
  assert.equal(isExcludedCompany("Demo Pay Korea", ["Demo Pay"]), true);
  assert.equal(isExcludedCompany("Other Co", ["Demo Pay"]), false);
  assert.equal(isExcludedCompany("AB", ["ABC Labs"]), false);
});

test("the person reads as Career's user context: profile, their post as the brief, the current company blocked", () => {
  const context = outreachContext(person, ["(주)데모페이"]);
  assert.equal(context.profile.headline, "Backend Engineer");
  assert.equal(context.profile.bio, "결제 백엔드 5년, Kotlin, Spring");
  assert.deepEqual(context.profile.experiences.map((item) => item.company_name), ["(주)데모페이"]);
  assert.match(context.search_brief[0].label, /2026-11-15/);
  assert.equal(context.search_brief[0].content, person.signalText);
  assert.deepEqual(context.matching_preferences.blocked_companies, ["(주)데모페이"]);
  assert.equal(JSON.stringify(context).includes("지수"), false);
  const bare = outreachContext({ ...person, currentCompany: null, signalText: null }, []);
  assert.deepEqual([bare.profile.experiences, bare.search_brief], [[], []]);
});

test("the planner is Career's plan prompt plus #5's fields; only an explicit false means not looking", () => {
  assert.ok(OUTREACH_PLAN_PROMPT.startsWith(PLAN_PROMPT));
  assert.match(OUTREACH_PLAN_PROMPT, /"jobSeeking"/);
  assert.ok(OUTREACH_REVISE_PROMPT.startsWith(OUTREACH_PLAN_PROMPT));
  assert.match(OUTREACH_REVISE_PROMPT, /"reviseReason"/);
  assert.deepEqual(outreachPlanFields({ jobSeeking: false, jobSeekingReason: " recruiter  account ", language: "en" }),
    { jobSeeking: false, jobSeekingReason: "recruiter account", language: "en", reviseReason: "" });
  assert.equal(outreachPlanFields({}).jobSeeking, true);
  assert.equal(outreachPlanFields(null).language, null);
  assert.equal(outreachPlanFields({ reviseReason: "직함을 넓혔어요" }).reviseReason, "직함을 넓혔어요");
  // Career's envelope parses as it does for members.
  const envelope = planDecisionSchema.parse({ defaultAction: "explore", targetSalaryKrw: null, plan: { role_titles: ["Backend"] }, jobSeeking: true });
  assert.equal(envelope.defaultAction, "explore");
});

test("postings stay within 90 days, also when the planner asks for none or for more", () => {
  assert.deepEqual(withOutreachRecency(plan).postingRecency,
    { maxAgeDays: MAX_POSTING_AGE_DAYS, recentDays: null, recentWeight: null, olderWeight: null });
  assert.equal(withOutreachRecency({ ...plan, postingRecency: { maxAgeDays: 400, recentDays: 7, recentWeight: 5, olderWeight: null } })
    .postingRecency?.maxAgeDays, 90);
  assert.deepEqual(withOutreachRecency({ ...plan, postingRecency: { maxAgeDays: 30, recentDays: 7, recentWeight: 5, olderWeight: 1 } })
    .postingRecency, { maxAgeDays: 30, recentDays: 7, recentWeight: 5, olderWeight: 1 });
});

test("a fit is at least plausible with no blocking conflict; companies count once, excluded ones never", () => {
  assert.equal(fitClears(fit(50)), true);
  assert.equal(fitClears(fit(25)), false);
  assert.equal(fitClears(fit(75, 50)), false);
  assert.equal(shortfall(fit(75)), "fits");
  assert.match(shortfall(fit(25, 30, 20, 20)), /blocking conflict.*weak fit.*employer unlikely.*not attractive/);
  const scored = [
    scoredPosting("a1", "Alpha", fit(75)), scoredPosting("a2", "Alpha", fit(100)), scoredPosting("b1", "Beta", fit(50)),
    scoredPosting("c1", "Gamma", fit(25)), scoredPosting("d1", "데모페이", fit(100)),
  ];
  assert.equal(fittingCompanyCount(scored, ["(주)데모페이"]), 2);
  assert.deepEqual(byRankScore(scored).map((item) => item.roleId).slice(0, 2), ["a2", "d1"]);
});

test("the revise round reads each search, what came back and why the scored postings fell short", () => {
  const step: AgentPlanStep = { plan, reason: "결제 백엔드", revised: false, found: 12, scored: 14, fittingCompanies: 1 };
  const evidence = reviseEvidence([step], [scoredPosting("a1", "Alpha", fit(25, 30)), scoredPosting("b1", "Beta", fit(75))]);
  assert.equal(evidence.length, 1);
  assert.deepEqual([evidence[0].postings_found, evidence[0].candidates_scored, evidence[0].fitting_companies], [12, 14, 1]);
  assert.deepEqual(evidence[0].plan.roleTitles, ["Backend Engineer", "Server Engineer"]);
  assert.equal(evidence[0].plan.seniority, "experienced");
  assert.match(evidence[0].scored_postings![0], /^Backend Engineer · Beta · Seoul \| mutualFit 75.*→ fits$/);
  assert.match(evidence[0].scored_postings![1], /Alpha.*→ a blocking conflict/);
  const two = reviseEvidence([step, { ...step, revised: true }], []);
  assert.equal("scored_postings" in two[0], false);
  assert.ok("scored_postings" in two[1]);
});

test("a GTM Role reads as Harper 고객사(<설명>) with the real company out of everything the models read", () => {
  const item = internalCandidate(gtmSource, cleanPublicDescription)!;
  assert.equal(item.meta.companyName, "Harper 고객사(핀테크 스타트업)");
  assert.equal(item.row.company_name, "Harper 고객사(핀테크 스타트업)");
  assert.equal(item.row.role_name, "Backend Engineer at 핀테크 스타트업");
  assert.equal(JSON.stringify(item.row).includes("Hidden Ledger"), false);
  assert.equal(item.row.summary, null);
  assert.equal(item.row.company_workspace_id, `gtm-company:${companyKey("핀테크 스타트업")}`);
  assert.deepEqual(item.meta.hide, { names: ["Hidden Ledger"], replacement: "핀테크 스타트업" });
  assert.deepEqual(item.meta.companyNames, ["Hidden Ledger"]);
  assert.equal(internalCandidate({ ...gtmSource, public_description: null }, cleanPublicDescription), null);
  const customer = internalCandidate({ ...gtmSource, kind: "customer", name: "Backend Engineer", company_name: "Customer Co", gtm_company: null }, cleanPublicDescription)!;
  assert.deepEqual([customer.meta.kind, customer.meta.companyName, customer.row.company_workspace_id],
    ["customer", "Customer Co", gtmSource.company_workspace_id]);
});

test("the selector's picks: known roles, one per company, never the current company, at least 1 or none", () => {
  const metas = new Map([meta("e1", "Alpha"), meta("e2", "Alpha"), meta("e3", "데모페이"), meta("e4", "Beta"), meta("e5", "Gamma")]
    .map((item) => [item.roleId!, item]));
  const picked = postingsFromSelection([
    { roleId: "e1", note: "결제 경험이 맞아요" }, { roleId: "e2", note: "same company" }, { roleId: "e3", note: "own company" },
    { roleId: "x9", note: "unknown" }, { roleId: "e4", note: "  Kotlin 경험이 맞아요 " }, { roleId: "e5", note: "" },
  ], metas, [person.currentCompany]);
  assert.deepEqual(picked.map((posting) => [posting.companyName, posting.why]), [["Alpha", "결제 경험이 맞아요"], ["Beta", "Kotlin 경험이 맞아요"]]);
  // One fitting posting is enough (Shaun 11/18); none is none.
  assert.equal(postingsFromSelection([{ roleId: "e1", note: "fit" }], metas, []).length, 1);
  assert.deepEqual(postingsFromSelection([{ roleId: "e3", note: "own company" }], metas, [person.currentCompany]), []);
  const four = new Map(["A1", "B2", "C3", "D4"].map((name, index) => [`r${index}`, meta(`r${index}`, name)]));
  assert.equal(postingsFromSelection([0, 1, 2, 3].map((n) => ({ roleId: `r${n}`, note: "fit" })), four, []).length, 3);
});

test("a picked posting keeps the matcher's fit: Career's ranking score and the four metrics, rounded", () => {
  const picked = [{ ...meta("e1", "Alpha"), why: "fit" }, { ...meta("e2", "Beta"), why: "fit" }, { ...meta("e3", "Gamma"), roleId: null, why: "fit" }];
  const fits = new Map<string, Fit>([["e1", fit(80.4, 90, 70.6, 60)], ["e2", fit(70, 40, 70, 70)]]);
  const [first, second, third] = withFitScores(picked, fits);
  // 0.55 × 80.4 + 0.35 × 70.6 + 0.1 × 60 = 74.93
  assert.equal(first.score, 75);
  assert.deepEqual(first.scoreParts, { mutualFit: 80, candidateInterest: 71, companyInterest: 60, constraintPass: 90 });
  // A blocking conflict (constraintPass ≤ 50) pulls the score down hard, as Career ranks it.
  assert.equal(second.score, 9);
  // Not scored (or known by URL alone): no score, the posting as it was.
  assert.equal(third.score, undefined);
  assert.equal("scoreParts" in third, false);
});

test("a GTM Role's real company never reaches the why", () => {
  const gtm = internalCandidate(gtmSource, cleanPublicDescription)!.meta;
  const metas = new Map<string, PostingMeta>([[gtm.roleId!, gtm], ["e4", meta("e4", "Beta")]]);
  const [first, second] = postingsFromSelection([{ roleId: gtm.roleId!, note: "Hidden Ledger의 결제 원장 일이 맞아요" }, { roleId: "e4", note: "fit" }], metas, []);
  assert.equal(first.why, "핀테크 스타트업의 결제 원장 일이 맞아요");
  assert.equal("hide" in first, false);
  assert.equal(second.companyName, "Beta");
});

test("public postings are read while fewer than 10 fit, and stop when the first 30 had none", () => {
  assert.equal(publicBatchWorthReading({ clearing: 0, publicClearing: 0, publicScored: 0 }), true);
  assert.equal(publicBatchWorthReading({ clearing: 9, publicClearing: 4, publicScored: 90 }), true);
  assert.equal(publicBatchWorthReading({ clearing: ENOUGH_FITS, publicClearing: 0, publicScored: 0 }), false);
  // Customer Roles that fit do not stop the public reading early, but nothing among the first 30 public does.
  assert.equal(publicBatchWorthReading({ clearing: 3, publicClearing: 0, publicScored: 20 }), true);
  assert.equal(publicBatchWorthReading({ clearing: 3, publicClearing: 0, publicScored: DRY_PUBLIC_READ }), false);
  assert.equal(PUBLIC_READ_MAX, 100);
});

test("a GTM Role's title without its description", () => {
  assert.equal(gtmRoleTitle("핀테크 스타트업 · Backend Engineer", "핀테크 스타트업"), "Backend Engineer");
  assert.equal(gtmRoleTitle("Backend Engineer", "핀테크 스타트업"), "Backend Engineer");
});

test("a Role without a description of its own is never proposed (a customer's private brief is not job text)", () => {
  const customer = { ...gtmSource, kind: "customer" as const, name: "Backend Engineer", company_name: "Customer Co", gtm_company: null };
  assert.equal(internalCandidate({ ...customer, description: null }, cleanPublicDescription), null);
  assert.equal(internalCandidate({ ...customer, description: "   " }, cleanPublicDescription), null);
  assert.equal(internalCandidate({ ...gtmSource, description: null }, cleanPublicDescription), null);
  assert.equal(internalCandidate({ ...customer, description: "Build the ledger API." }, cleanPublicDescription)?.row.description, "Build the ledger API.");
});

test("a GTM Role's real company and brand names stay out of its title, text and why, however they are written", () => {
  const source: InternalRoleSource = {
    ...gtmSource, gtm_company: "Hidden Ledger Inc.", gtm_ops_name: "Hidden Ledger · Backend Engineer",
    gtm_source_names: ["(주)히든레저", "Hidden Ledger Korea"],
    description: "HiddenLedger builds ledgers. hidden-ledger and 히든레저에서 일해요. Hidden Ledger Korea is hiring.",
  };
  assert.deepEqual(gtmBrandNames(source), ["Hidden Ledger Korea", "Hidden Ledger Inc.", "Hidden Ledger", "(주)히든레저", "히든레저"]);
  const item = internalCandidate(source, cleanPublicDescription)!;
  assert.equal(/hidden|히든/i.test(JSON.stringify(item.row)), false);
  assert.equal(item.row.description, "핀테크 스타트업 builds ledgers. 핀테크 스타트업 and 핀테크 스타트업에서 일해요. 핀테크 스타트업 is hiring.");
  const metas = new Map<string, PostingMeta>([[item.meta.roleId!, item.meta], ["e4", meta("e4", "Beta")]]);
  const [first] = postingsFromSelection([
    { roleId: item.meta.roleId!, note: "HIDDENLEDGER의 원장 일이 (주)히든레저 팀과 맞아요" }, { roleId: "e4", note: "fit" },
  ], metas, []);
  assert.equal(first.why, "핀테크 스타트업의 원장 일이 핀테크 스타트업 팀과 맞아요");
  assert.equal("companyNames" in first, false);
  // Whole words only for Latin names: a longer word that contains one is left alone.
  assert.equal(withoutNames("Kite flies; Kitesurf club; KITE", ["Kite"], "X"), "X flies; Kitesurf club; X");
});

test("not their own company: a GTM Role by its real company, never by its Harper 고객사 label", () => {
  const gtm = internalCandidate(gtmSource, cleanPublicDescription)!.meta;
  assert.equal(postingExcluded(gtm, ["Hidden Ledger Korea"]), true);
  assert.equal(postingExcluded(gtm, ["(주)Hidden Ledger"]), true);
  assert.equal(postingExcluded(gtm, ["Harper"]), false);
  assert.equal(postingExcluded(gtm, ["핀테크 스타트업"]), false);
  // A customer by the name shown and its workspace name.
  const customer = internalCandidate({
    ...gtmSource, kind: "customer", name: "Backend Engineer", company_name: "Shown Name", workspace_name: "Legal Name Corp", gtm_company: null,
  }, cleanPublicDescription)!.meta;
  assert.equal(postingExcluded(customer, ["Legal Name"]), true);
  assert.equal(postingExcluded(customer, ["Shown Name"]), true);
  // The person at the real company of a GTM Role: it is never picked or counted.
  const metas = new Map<string, PostingMeta>([[gtm.roleId!, gtm], ["e4", meta("e4", "Beta")], ["e5", meta("e5", "Gamma")]]);
  const picked = postingsFromSelection([{ roleId: gtm.roleId!, note: "fit" }, { roleId: "e4", note: "fit" }, { roleId: "e5", note: "fit" }], metas, ["Hidden Ledger"]);
  assert.deepEqual(picked.map((posting) => posting.companyName), ["Beta", "Gamma"]);
  const scored: ScoredPosting[] = [
    { ...scoredPosting(gtm.roleId!, gtm.companyName, fit(80)), kind: "gtm", companyNames: gtm.companyNames },
    scoredPosting("e4", "Beta", fit(80)),
  ];
  assert.equal(fittingCompanyCount(scored, ["Hidden Ledger"]), 1);
  assert.equal(fittingCompanyCount(scored, ["Harper"]), 2);
});
