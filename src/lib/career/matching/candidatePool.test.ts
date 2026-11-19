import assert from "node:assert/strict";
import test from "node:test";
import { formatLedger, formatRouteHistory } from "./candidatePool";
import { formatCompanyFacts } from "../companies/discovery";

test("the ledger says what a search added and how high the best of it ranks, with no fixed number of leaders", () => {
  const base = { evaluated: 612, postings: 418, companies: 194, fresh: 233, angles: ["postings", "about"] };
  assert.equal(formatLedger({ ...base, search: 1, bestNew: { number: 3, rank: 1, of: 600 } }),
    "Search 1 · 612 evaluated (postings 418 · companies 194), 233 new to this matching\nBest new option: [3], ranked #1 of 600 available options in this matching by score");
  assert.match(formatLedger({ ...base, search: 3, bestNew: { number: 41, rank: 57, of: 1072 } }), /\[41\], ranked #57 of 1072/);
  assert.equal(formatLedger({ ...base, fresh: 0, search: 4, bestNew: null }),
    "Search 4 · 612 evaluated (postings 418 · companies 194), 0 new to this matching");
  // A ledger saved before ranks were recorded gives no rank line rather than a wrong one.
  assert.doesNotMatch(formatLedger({ ...base, search: 2, topBefore: [3], topAfter: [3] }), /Best new|Top 3|score yet/);
  const routes = new Map([
    ["postings", { searches: 3, best: { search: 1, rank: 1 }, latest: { search: 3, rank: 57 } }],
    ["about", { searches: 1, best: null, latest: { search: 2, rank: null } }],
  ]);
  assert.equal(formatRouteHistory(routes),
    "Routes so far (best new option's rank when found): postings 3× (#1 in search 1, latest search 3: #57) · companies by description 1× (nothing new ranked)");
  assert.doesNotMatch(formatRouteHistory(routes), /top 3/i);
});

test("company facts fit on one line and leave out what is not on record", () => {
  const line = formatCompanyFacts({
    team: { asOf: "2026-04-08", staff: 14, joined12m: 12, left12m: 7, cameFrom: [{ company: "HAECHI LABS", n: 2 }] },
    leaders: [{ title: "Co-Founder and CEO", school: "Stanford University" }],
    hiring: { openRoles: 3, relatedTitles: ["Backend Engineer, Applied Agents (Seoul)"] },
    reach: { sameSchool: 0, sameCompany: 2 },
    profile: { size: { start: 11, end: 50 }, founded: 2025 },
  });
  assert.equal(line, "team 14 (12 months +12/−7; came from HAECHI LABS 2; as of 2026-04-08) · leaders: Co-Founder and CEO (Stanford University) · "
    + "open roles 3 (closest: Backend Engineer, Applied Agents (Seoul)) · staff from the candidate's schools 0, from their past companies 2 · 11–50 employees, founded 2025");
  assert.equal(formatCompanyFacts({ hiring: { openRoles: 0, careersUrl: "https://jobs.ashbyhq.com/x" } }),
    "no open role indexed; careers page https://jobs.ashbyhq.com/x");
  assert.equal(formatCompanyFacts(undefined), "");
});
