import assert from "node:assert/strict";
import test from "node:test";
import {
  demandAllocation, demandBlock, demandFamilies, industriesOf, levelOf, placeOf, readDemandSummary, roleFamiliesOf, summarizeDemand,
  thinFamilies, type DemandPosting,
} from "./demand";

const posting = (patch: Partial<DemandPosting> & Pick<DemandPosting, "title" | "companies">): DemandPosting => ({
  kind: "external", seniorityLevel: null, countryCode: "KR", workMode: "hybrid", locationText: "서울", ...patch,
});

test("a title's family, level and place", () => {
  assert.deepEqual(roleFamiliesOf("MLOps 엔지니어"), ["data/ML/AI"]);
  assert.deepEqual(roleFamiliesOf("풀스택 엔지니어"), ["frontend", "backend"]);
  assert.deepEqual(roleFamiliesOf("서버 개발자 (대용량 트래픽)"), ["backend"]);
  assert.deepEqual(roleFamiliesOf("백엔드 엔지니어 (결제 플랫폼)"), ["backend"]);
  assert.deepEqual(roleFamiliesOf("플랫폼 엔지니어 (SRE)"), ["infra/DevOps/SRE"]);
  assert.deepEqual(roleFamiliesOf("Account Executive"), []);
  assert.deepEqual(roleFamiliesOf("시니어 프론트엔드 엔지니어 (디자인 시스템)"), ["frontend"]);
  assert.deepEqual(roleFamiliesOf("프로덕트 디자이너 (B2B SaaS)"), ["design"]);
  assert.deepEqual(industriesOf("머신러닝 엔지니어 (추천·랭킹)"), ["추천·검색"]);
  assert.equal(levelOf("mid_senior", "백엔드 엔지니어"), "mid");
  assert.equal(levelOf("mid", "시니어 프론트엔드 엔지니어"), "senior");
  assert.equal(levelOf(null, "신입 백엔드 개발자"), "entry");
  assert.equal(levelOf("Entry level", "Engineer"), "entry");
  assert.equal(levelOf(null, "Backend Engineer"), "any");
  assert.equal(placeOf("KR", "hybrid", "서울 강남구"), "korea");
  assert.equal(placeOf("US", "remote", null), "remote");
  assert.equal(placeOf("JP", "onsite", "Tokyo"), "JP");
  assert.equal(placeOf(null, null, "경기 성남시"), "korea");
  assert.equal(placeOf(null, null, null), "unknown");
  assert.deepEqual(industriesOf("백엔드 엔지니어 (결제 플랫폼)", "a B2B SaaS company"), ["결제·핀테크", "B2B SaaS"]);
});

const POOL: DemandPosting[] = [
  posting({ title: "백엔드 엔지니어 (결제 플랫폼)", count: 2, companies: ["a", "b"], seniorityLevel: "mid_senior" }),
  posting({ title: "서버 개발자 (대용량 트래픽)", count: 3, companies: ["a", "c", "d"], seniorityLevel: "mid_senior" }),
  posting({ title: "풀스택 엔지니어", companies: ["e"], seniorityLevel: "mid" }),
  posting({ kind: "customer", title: "Data Engineer", companies: ["j"], countryCode: null, workMode: null, locationText: null }),
  posting({ title: "데이터 엔지니어", count: 2, companies: ["f", "g"], seniorityLevel: "mid" }),
  posting({ title: "Product Designer", companies: ["h"], countryCode: "US", workMode: "remote", locationText: null }),
  posting({ title: "Account Executive", companies: ["i"] }),
];

test("the demand by family: companies (a fit needs 2 at different ones), levels and places, industries, examples", () => {
  const summary = summarizeDemand(POOL, "2026-11-18", new Map([["j", "a logistics startup"], ["f", "물류 스타트업"]]));
  assert.equal(summary.postings, 11);
  assert.equal(summary.companies, 10);
  assert.equal(summary.internal, 1);
  assert.deepEqual(summary.other, { postings: 1, examples: ["Account Executive"] });
  const [backend, data] = summary.families;
  // Full-stack counts for both ends; a company with two backend titles counts once.
  assert.deepEqual([backend.family, backend.postings, backend.companies], ["backend", 6, 5]);
  assert.deepEqual(backend.segments[0], { level: "mid", place: "korea", postings: 6, companies: 5 });
  assert.deepEqual(backend.examples.slice(0, 2), ["서버 개발자 (대용량 트래픽)", "백엔드 엔지니어 (결제 플랫폼)"]);
  assert.deepEqual(backend.industries, [{ industry: "결제·핀테크", companies: 2 }]);
  assert.deepEqual([data.family, data.postings, data.companies, data.internal], ["data/ML/AI", 3, 3, 1]);
  assert.deepEqual(data.industries, [{ industry: "물류", companies: 2 }]);
  assert.deepEqual(data.segments.map((item) => item.place), ["korea", "unknown"]);
  assert.deepEqual(demandFamilies(summary).map((item) => item.family), ["backend", "data/ML/AI"]);
  // Frontend (1 company) and design (1 company, remote) are too thin to aim at; families with nothing open too.
  assert.deepEqual(thinFamilies(summary), ["infra/DevOps/SRE", "QA/security", "product/PM", "design", "mobile", "frontend"]);
  // Stored on the run and read back the same.
  assert.deepEqual(readDemandSummary(JSON.parse(JSON.stringify(summary))), summary);
  assert.equal(readDemandSummary({ day: "yesterday" }), null);
});

test("a round's queries split by companies hiring (largest remainder), none for thin families", () => {
  const summary = summarizeDemand(POOL, "2026-11-18");
  assert.deepEqual(demandAllocation(summary, 6), [{ family: "backend", queries: 4 }, { family: "data/ML/AI", queries: 2 }]);
  const wide = summarizeDemand([
    posting({ title: "Backend Engineer", count: 10, companies: Array.from({ length: 10 }, (_, index) => `b${index}`) }),
    posting({ title: "Frontend Engineer", count: 5, companies: ["f1", "f2", "f3", "f4", "f5"] }),
    posting({ title: "Data Engineer", count: 3, companies: ["d1", "d2", "d3"] }),
    posting({ title: "iOS Engineer", count: 2, companies: ["m1", "m2"] }),
  ], "2026-11-18");
  // 10/5/3/2 of 20 companies over 6 queries: 3, 1.5, 0.9, 0.6 → 3, 1, 1, 1.
  assert.deepEqual(demandAllocation(wide, 6), [
    { family: "backend", queries: 3 }, { family: "frontend", queries: 1 }, { family: "data/ML/AI", queries: 1 }, { family: "mobile", queries: 1 },
  ]);
  assert.deepEqual(demandAllocation(null, 6), []);
  assert.equal(demandAllocation(wide, 6).reduce((sum, item) => sum + item.queries, 0), 6);
});

test("the demand as the planner and the judge read it", () => {
  const block = demandBlock(summarizeDemand(POOL, "2026-11-18"));
  assert.match(block, /^Harper's open postings now \(what the posting matcher can propose; read 2026-11-18\): 11 postings at 10 companies \(1 from Harper's customers, 10 public\)\. By place: Korea 9, place not stated 1, remote 1\./);
  assert.match(block, /- backend: 6 postings at 5 companies \(mid in Korea 6; industries named: 결제·핀테크 at 2\); e\.g\. "서버 개발자 \(대용량 트래픽\)"/);
  assert.match(block, /- No or too few companies hiring \(fewer than 2\): infra\/DevOps\/SRE, QA\/security, product\/PM, design, mobile, frontend/);
  assert.match(block, /- Outside these families \(not searched for\): 1 posting\b/);
  assert.equal(demandBlock(null), "");
  assert.equal(demandBlock(summarizeDemand([], "2026-11-18")), "");
});
