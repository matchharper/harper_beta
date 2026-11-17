import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateId, companyKey, detectLanguage, gtmRoleTitle, isExcludedCompany, pickPrompt, plannerPrompt, postingsFromPick,
  rankInternalRoles, searchPlanFrom, type CandidatePosting, type PlannerOutput,
} from "./match";
import type { AgentPersonInput } from "./types";

const person: AgentPersonInput = {
  name: "지수", headline: "Backend Engineer", location: "Seoul", currentCompany: "(주)데모페이", profileUrl: null,
  profileText: "결제 백엔드 5년, Kotlin, Spring", signalText: "이직 준비 중입니다. 백엔드 포지션 찾고 있어요.", signalUrl: null,
  signalAt: "2026-11-15T00:00:00Z",
};

const planner: PlannerOutput = {
  language: "ko", jobSeeking: true, jobSeekingReason: "open to work", searchIntentSummary: "Backend payments",
  roleTitles: ["Backend Engineer", " Backend Engineer ", "Server Engineer"], keywords: ["Kotlin", "Spring", "payments"],
  countryCode: "kr", includeRemote: true, seniority: "experienced",
};

const candidate = (id: string, companyName: string, title = "Backend Engineer"): CandidatePosting => ({
  id, kind: "external", roleId: `00000000-0000-4000-8000-00000000000${id.slice(1)}`, url: null, companyName, title, location: "Seoul", snippet: "Kotlin payments",
});

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

test("the planner's answer becomes a valid shared search plan", () => {
  const plan = searchPlanFrom(planner);
  assert.deepEqual(plan.roleTitles, ["Backend Engineer", "Server Engineer"]);
  assert.equal(plan.countries[0].countryCode, "KR");
  assert.equal(plan.isPreferEntry, -1);
  assert.equal(plan.ftsKeywords[0].terms.length, 3);
  assert.equal(searchPlanFrom({ ...planner, countryCode: "ZZ" }).countries[0].countryCode, "KR");
  assert.throws(() => searchPlanFrom({ ...planner, roleTitles: [] }));
  assert.match(plannerPrompt(person).user, /Current company: \(주\)데모페이/);
});

test("the pick: known ids, one per company, never the current company, at least 2 or none", () => {
  const candidates = [candidate("e1", "Alpha"), candidate("e2", "Alpha"), candidate("e3", "데모페이"), candidate("e4", "Beta"), candidate("e5", "Gamma")];
  const picked = postingsFromPick({
    reason: "fit",
    picks: [{ id: "e1", why: "결제 경험이 맞아요" }, { id: "e2", why: "same company" }, { id: "e3", why: "own company" },
      { id: "x9", why: "unknown" }, { id: "e4", why: "  Kotlin 경험이 맞아요 " }, { id: "e5", why: "" }],
  }, candidates, [person.currentCompany]);
  assert.deepEqual(picked.map((posting) => [posting.companyName, posting.why]), [["Alpha", "결제 경험이 맞아요"], ["Beta", "Kotlin 경험이 맞아요"]]);
  assert.equal("id" in picked[0], false);
  assert.deepEqual(postingsFromPick({ reason: "", picks: [{ id: "e1", why: "fit" }] }, candidates, []), []);
  assert.equal(postingsFromPick({ reason: "", picks: [1, 2, 3, 4].map((n) => ({ id: `e${n}`, why: "fit" })) }, [
    candidate("e1", "A1"), candidate("e2", "B2"), candidate("e3", "C3"), candidate("e4", "D4")], []).length, 3);
});

test("internal Roles the plan's words meet, best first", () => {
  const plan = searchPlanFrom(planner);
  const ranked = rankInternalRoles([
    { title: "Designer", snippet: "Figma" },
    { title: "Backend Engineer", snippet: "Kotlin Spring payments" },
    { title: "Server developer", snippet: "Kotlin" },
  ], plan, 5);
  assert.deepEqual(ranked.map((role) => role.title), ["Backend Engineer", "Server developer"]);
});

test("a GTM Role shows its title without the description; ids by kind", () => {
  assert.equal(gtmRoleTitle("핀테크 스타트업 · Backend Engineer", "핀테크 스타트업"), "Backend Engineer");
  assert.equal(gtmRoleTitle("Backend Engineer", "핀테크 스타트업"), "Backend Engineer");
  assert.deepEqual([candidateId("external", 0), candidateId("customer", 1), candidateId("gtm", 2)], ["e1", "c2", "g3"]);
  assert.match(pickPrompt(person, [candidate("e1", "Alpha")], "ko").system, /Korean/);
});

test("a GTM Role's real company never reaches the why", () => {
  const gtm: CandidatePosting = {
    ...candidate("g1", "Harper 고객사(핀테크 스타트업)"), kind: "gtm", hide: { name: "Hidden Ledger", replacement: "핀테크 스타트업" },
  };
  const [first] = postingsFromPick({ reason: "", picks: [{ id: "g1", why: "Hidden Ledger의 결제 원장 일이 맞아요" }, { id: "e4", why: "fit" }] },
    [gtm, candidate("e4", "Beta")], []);
  assert.equal(first.why, "핀테크 스타트업의 결제 원장 일이 맞아요");
  assert.equal("hide" in first, false);
});
