import assert from "node:assert/strict";
import test from "node:test";
import { parseExternalSearchPlan } from "./searchPlan";
import { countryQuotas } from "@/lib/externalRecommendationsV2/countries";
import { buildFilterFirstRoleSql } from "@/lib/externalRecommendationsV2/filterFirstSql";

function searchBuckets(input: unknown) {
  const sql = buildFilterFirstRoleSql({
    plan: parseExternalSearchPlan(input),
    userId: "00000000-0000-4000-8000-000000000001",
    blockedCompanies: [],
    vector: Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0),
  });
  return [...new Set([...sql.matchAll(/company_roles_search_([a-z]+)_b(\d+)_hnsw_idx/g)]
    .map((match) => `${match[1]}:${match[2]}`))].sort();
}

test("omitted employment and remote filters search full-time roles across onsite and remote buckets", () => {
  const input = { roleTitles: ["Engineer"], countries: { KR: { weight: 1 } } };
  const original = structuredClone(input);
  const plan = parseExternalSearchPlan(input);
  assert.equal(plan.includeContract, false);
  assert.equal(plan.includeParttime, false);
  assert.equal(plan.includeIntern, false);
  assert.equal(plan.includeRemote, true);
  assert.equal(plan.remoteOnly, false);
  assert.deepEqual(plan.countries, [{ countryCode: "KR", weight: 1, remoteOnly: false }]);
  assert.deepEqual(searchBuckets(input), ["kr:0", "kr:8"]);
  assert.deepEqual(input, original);
});

test("explicit employment and remote restrictions still reach the retrieval buckets", () => {
  const input = { roleTitles: ["Engineer"], countries: { KR: { weight: 1 } } };
  assert.deepEqual(searchBuckets({ ...input, includeRemote: false }), ["kr:0"]);
  assert.deepEqual(searchBuckets({ ...input, remoteOnly: true }), ["kr:8"]);
  assert.deepEqual(searchBuckets({ ...input, includeContract: true }), ["kr:0", "kr:12", "kr:4", "kr:8"]);
  assert.deepEqual(searchBuckets({ ...input, includeParttime: true }), ["kr:0", "kr:10", "kr:2", "kr:8"]);
  assert.deepEqual(searchBuckets({ ...input, includeIntern: true }), ["kr:0", "kr:1", "kr:8", "kr:9"]);
  assert.deepEqual(searchBuckets({ ...input, countries: { KR: { weight: 1 }, US: { weight: 1, remoteOnly: true } } }),
    ["kr:0", "kr:8", "us:8"]);
  assert.throws(() => searchBuckets({ ...input, includeRemote: false, remoteOnly: true }), /Conflicting remote/);
});

test("legacy array plans may omit remote and employment flags without accepting malformed filters", () => {
  const input = { roleTitles: ["Engineer"], countries: [{ countryCode: "KR", weight: 1 }] };
  assert.deepEqual(searchBuckets(input), ["kr:0", "kr:8"]);
  assert.throws(() => parseExternalSearchPlan({ ...input, includeRemote: "false" }), /must be boolean/);
  assert.throws(() => parseExternalSearchPlan({ roleTitles: ["Engineer"] }), /required property 'countries'/);
});

test("a broad country search keeps all countries and has no invented recency or lexical filter", () => {
  const codes = "GB BR CN HK TH VN SG ES PT ZA MX CL CO AR NL DK SE NO JP KR BE FR PH AU CA DE IE AE IN".split(" ");
  const plan = parseExternalSearchPlan({
    roleTitles: ["Engineering Manager"],
    countries: Object.fromEntries(codes.map(code => [code, { weight: 1000, remoteOnly: code === "US" }])),
    includeContract: false, includeParttime: false, includeIntern: false,
    includeRemote: true, remoteOnly: false,
  });
  assert.deepEqual(plan.countries.map(row => row.countryCode), codes);
  assert.equal(countryQuotas(plan.countries, 3000).reduce((n, row) => n + row.quota, 0), 3000);
  const sql = buildFilterFirstRoleSql({ plan, userId: "00000000-0000-4000-8000-000000000001", blockedCompanies: [], vector: Array.from({length: 1536}, (_, i) => i === 0 ? 1 : 0) });
  for (const code of codes) assert.ok(sql.includes(`'${code}'`));
  assert.doesNotMatch(sql, /INTERVAL '1 day'/);
  assert.equal(plan.postingRecency, null);
  assert.deepEqual(plan.ftsKeywords, []);
});

test("legacy plans preserve exact country conditions, while conflicting duplicates remain explicit", () => {
  const plan = { roleTitles: ["Engineer"], countries: [{countryCode: "KR", weight: 1, remoteOnly: false}], includeContract: false, includeParttime: false, includeIntern: false, includeRemote: true, remoteOnly: false, postingRecency: {recentDays: 30, recentWeight: 1} };
  const parsed = parseExternalSearchPlan(plan);
  assert.deepEqual(parsed.countries, plan.countries);
  assert.equal(parsed.postingRecency?.maxAgeDays, null);
  assert.throws(() => parseExternalSearchPlan({...plan, countries: [...plan.countries, {countryCode: "KR", weight: 0.5, remoteOnly: true}]}), /Countries must be unique/);
  assert.throws(() => parseExternalSearchPlan(JSON.stringify(plan)), /plan must be object/);
});
