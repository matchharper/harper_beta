import assert from "node:assert/strict";
import test from "node:test";
import { parseExternalSearchPlan } from "./searchPlan";
import { countryQuotas } from "@/lib/externalRecommendationsV2/countries";
import { buildFilterFirstRoleSql } from "@/lib/externalRecommendationsV2/filterFirstSql";

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
