import assert from "node:assert/strict";
import test from "node:test";
import { ashleyCostUsd, cappedCostBy, cappedCostPerContact, cappedCostUsd } from "./daily";
import { columnCount, FUNNEL_COLUMNS, inFunnelColumn } from "./funnel";
import {
  agentNumbersRows, costPerSignup, dayLines, isQuietDay, NO_QUERY, NUMBERS_ROWS, numbersPick, numbersRunOf, signupsPerDay, yieldsOfSignalLog,
  type NumbersPerson, type NumbersPick, type NumbersRows, type NumbersRun,
} from "./numbers";
import { afterMatches, filtersForColumn, inStage } from "./stage";

type Person = NumbersPerson & { eventKinds: string[] };

let next = 0;
const person = (foundDay: string, patch: Partial<Person> = {}): Person => ({
  personId: `p${(next += 1)}`, foundDay, source: "linkedin", status: "found", excludeReason: null, channel: null, sentAt: null,
  signalAt: null, clickedAt: null, signedUpAt: null, repliedAt: null, interested: false, connected: false, costUsd: 0,
  searchQuery: "open to work backend", eventKinds: [], ...patch,
});
const mailed = (foundDay: string, patch: Partial<Person> = {}) => person(foundDay, {
  status: "sent", channel: "email", sentAt: `${foundDay}T02:00:00Z`, eventKinds: ["sent"], ...patch,
});
const replied = (foundDay: string, patch: Partial<Person> = {}) => mailed(foundDay, {
  status: "replied", repliedAt: `${foundDay}T05:00:00Z`, eventKinds: ["sent", "replied"], ...patch,
});

const FROM = "2026-11-15";
const TO = "2026-11-18";

const people: Person[] = [
  mailed("2026-11-18", { clickedAt: "2026-11-18T03:00:00Z", postings: [{ score: 80 }, { score: 60 }], hasEmail: true }),
  replied("2026-11-18", { ashleyRepliedAt: "2026-11-18T06:00:00Z", signedUpAt: "2026-11-18T07:00:00Z", interested: true }),
  replied("2026-11-18", { source: "hn", searchQuery: "Ask HN: Who wants to be hired?", handedOffAt: "2026-11-18T06:00:00Z" }),
  replied("2026-11-17", {
    source: "hn", searchQuery: "Ask HN: Who wants to be hired?", unsubscribed: true, noReplyReason: "연락 그만",
  }),
  person("2026-11-17", { status: "excluded", excludeReason: "no_email", lookupTried: true }),
  person("2026-11-17", { status: "no_fit", source: "fishbowlapp.com", searchQuery: "open to work backend" }),
  // The uploaded-file people: no query.
  person("2026-11-15", { source: "applicants-acme", searchQuery: null, status: "excluded", excludeReason: "member", hasEmail: true }),
  mailed("2026-11-15", {
    source: "applicants-acme", searchQuery: null, connected: true, deliveryStatus: "bounced", lookupTried: true, lookupFound: true, hasEmail: true,
  }),
  person("2026-11-15", { status: "approved", searchQuery: "AI 엔지니어 구직 중" }),
  // Outside the period: counted nowhere.
  mailed("2026-11-10", { source: "hn" }),
];

const runs: NumbersRun[] = [
  {
    day: "2026-11-18", kind: "daily", searchCostUsd: 0.7,
    counts: {
      found: 3, search_attempts_linkedin: 1, searches_linkedin: 3, signal_found_linkedin: 2, signal_known_linkedin: 1, signal_cost_linkedin: 0.4,
      search_attempts_hn: 1, searches_hn: 1, signal_found_hn: 1, signal_cost_hn: 0.1, search_attempts_explore: 1, searches_explore: 1,
      signal_cost_explore: 0.2, "new_domain:fishbowlapp.com": 1,
    },
    yields: [
      { source: "linkedin", query: "open to work backend", kept: 2, known: 1 },
      { source: "linkedin", query: "open to work backend", kept: 0, known: 0 },
      { source: "linkedin", query: "react developer looking", kept: 0, known: 0 },
      { source: "hn", query: "Ask HN: Who wants to be hired?", kept: 1, known: 0 },
      { source: "explore", query: "open to work backend", kept: 1, known: 0 },
    ],
  },
  { day: "2026-11-15", kind: "import", searchCostUsd: 0, counts: { found: 2 }, yields: [] },
  { day: "2026-11-09", kind: "daily", searchCostUsd: 9, counts: { search_attempts_hn: 1, signal_cost_hn: 9 }, yields: [{ source: "hn", query: "old", kept: 5, known: 0 }] },
];

const spend = [
  { personId: "p1", step: "compose" as const, usd: 0.01 },
  { personId: "p1", step: "match" as const, usd: 0.02 },
  { personId: "p3", step: "compose" as const, usd: 0.01 },
  { personId: "p5", step: "lookup" as const, usd: 0.1 },
  { personId: "p10", step: "compose" as const, usd: 5 }, // outside the period
];

const searchPeople = [
  { day: "2026-11-18", source: "linkedin", query: "open to work backend", found: 2, contactable: 2 },
  { day: "2026-11-18", source: "hn", query: "Ask HN: Who wants to be hired?", found: 1, contactable: 1 },
  { day: "2026-11-17", source: "fishbowlapp.com", query: "open to work backend", found: 1, contactable: 0 },
];

const rowsOf = (kind: NumbersRows) => agentNumbersRows({
  kind, from: FROM, to: TO, people, spend, runs, searchPeople, always: ["linkedin", "threads"],
  configStarts: [{ day: "2026-11-17", id: "aaaaaaaaaaaa" }],
});

/** What the log keeps for a pick (views.server.ts listAgentPeopleLog's SQL: source, the day as the period, search_query). */
const inPick = (pick: NumbersPick, row: Person) => (!pick.source || row.source === pick.source)
  && (!pick.day || row.foundDay === pick.day) && row.foundDay >= FROM && row.foundDay <= TO
  && (pick.query === null || (pick.query === NO_QUERY ? row.searchQuery == null : row.searchQuery === pick.query));

test("every row kind adds up to the same 합계, for every people column", () => {
  const totals = NUMBERS_ROWS.map((kind) => rowsOf(kind).total.numbers);
  for (const kind of NUMBERS_ROWS) {
    const { total, rows } = rowsOf(kind);
    for (const column of FUNNEL_COLUMNS) {
      const sum = rows.reduce((n, row) => n + columnCount(row.numbers, column), 0);
      assert.equal(sum, columnCount(total.numbers, column), `${kind} ${column}`);
      assert.equal(columnCount(total.numbers, column), columnCount(totals[0], column), `${kind} ${column} 합계`);
    }
    for (const field of ["bounced", "complained", "unsubscribed"] as const) {
      assert.equal(rows.reduce((n, row) => n + row.numbers[field], 0), total.numbers[field], `${kind} ${field}`);
    }
    assert.equal(rows.reduce((n, row) => n + row.quality.postings, 0), total.quality.postings, `${kind} postings`);
    assert.equal(rows.reduce((n, row) => n + row.lookups.tried, 0), total.lookups.tried, `${kind} lookups`);
    assert.equal(rows.reduce((n, row) => n + row.search.found, 0), total.search.found, `${kind} search`);
    assert.equal(rows.reduce((n, row) => n + row.withAddress, 0), total.withAddress, `${kind} 연락 가능`);
    assert.equal(total.withAddress, 3, kind);
  }
  assert.equal(totals[0].found, 9);
  assert.equal(totals[0].contacted, 5);
  assert.deepEqual([totals[0].handedOff, totals[0].noReply, totals[0].unsubscribed, totals[0].ashleyReplied], [1, 1, 1, 1]);
});

test("a number's people in the log are exactly the people it counts, in every row kind (합계 too)", () => {
  for (const kind of NUMBERS_ROWS) {
    for (const filters of [{ source: null, config: null }, { source: "hn", config: null }]) {
      const view = agentNumbersRows({
        kind, from: FROM, to: TO, spend, runs, searchPeople,
        // The server reads only the filter's source's people (on 찾은 곳 rows the row is the source).
        people: people.filter((row) => kind === "source" || !filters.source || row.source === filters.source),
      });
      for (const row of [view.total, ...view.rows]) {
        const pick = numbersPick(kind, row.key, filters);
        for (const column of FUNNEL_COLUMNS) {
          const { stage, after } = filtersForColumn(column);
          const shown = people.filter((item) => inPick(pick, item) && (!stage || inStage(stage, item)) && (!after || afterMatches(after, item)));
          assert.equal(shown.length, columnCount(row.numbers, column), `${kind} ${row.key} ${column}`);
          assert.ok(shown.every((item) => inFunnelColumn(column, item)), `${kind} ${row.key} ${column}`);
        }
      }
    }
  }
});

test("a number click carries the row's key in its own field and the panel's filters", () => {
  const filters = { source: "hn", config: "aaaaaaaaaaaa" };
  assert.deepEqual(numbersPick("day", "2026-11-18", filters), { source: "hn", day: "2026-11-18", query: null, config: filters.config });
  assert.deepEqual(numbersPick("query", NO_QUERY, filters), { source: "hn", day: null, query: "", config: filters.config });
  // 찾은 곳 rows: the row is the source, the 합계 every source.
  assert.deepEqual(numbersPick("source", "linkedin", filters), { source: "linkedin", day: null, query: null, config: filters.config });
  assert.deepEqual(numbersPick("source", null, filters), { source: null, day: null, query: null, config: filters.config });
  assert.deepEqual(numbersPick("query", null, { source: null, config: null }), { source: null, day: null, query: null, config: null });
});

test("찾은 곳 rows: turned-on sources first (even empty), then the rest by people; each source's own searches and cost", () => {
  const { total, rows } = rowsOf("source");
  assert.deepEqual(rows.map((row) => row.key), ["linkedin", "threads", "hn", "applicants-acme", "fishbowlapp.com", "explore"]);
  const by = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(by.threads.numbers.found, 0);
  assert.deepEqual(by.linkedin.run, { searchedSources: 1, skippedBudget: 0, files: 0, searches: 3, newPeople: 2, knownPeople: 1 });
  assert.deepEqual(by.linkedin.costBy, { search: 0.4, compose: 0.01, match: 0.02, lookup: 0.1 });
  assert.equal(by.linkedin.numbers.costUsd, 0.53);
  assert.deepEqual(by.linkedin.search, { found: 2, contactable: 2 });
  // hn and the file people found 2 each: the one that cost more first.
  // The open web's search is its own row (its people are on the sites they wrote on).
  assert.deepEqual([by.explore.numbers.found, by.explore.costBy.search, by.explore.run.searches], [0, 0.2, 1]);
  assert.deepEqual(by["fishbowlapp.com"].search, { found: 1, contactable: 0 });
  assert.deepEqual(by.hn.sources, ["hn"]);
  // The 합계's searches are the day's: the same as on 날짜 rows.
  const days = rowsOf("day").total;
  assert.deepEqual(total.costBy, days.costBy);
  assert.equal(total.numbers.costUsd, 0.84);
  assert.deepEqual({ ...total.run, searchedSources: 0, files: 0 }, { ...days.run, searchedSources: 0, files: 0 });
});

test("날짜 rows: every day, newest first, the run's day for searches, a new 설정 묶음 marked; quiet days fold into one line", () => {
  const { total, rows } = rowsOf("day");
  assert.deepEqual(rows.map((row) => row.key), ["2026-11-18", "2026-11-17", "2026-11-16", "2026-11-15"]);
  const [d18, d17, d16, d15] = rows;
  assert.deepEqual(d18.run, { searchedSources: 3, skippedBudget: 0, files: 0, searches: 5, newPeople: 3, knownPeople: 1 });
  assert.equal(d18.costBy.search, 0.7);
  assert.deepEqual(d17.configsStarted, ["aaaaaaaaaaaa"]);
  assert.equal(d15.run.files, 1);
  assert.deepEqual(total.configsStarted, []);
  assert.equal(isQuietDay(d16), true);
  assert.equal(isQuietDay(d15), false);
  const day = (row: { key: string | null }) => row.key as string;
  assert.deepEqual(dayLines(rows, day).map((line) => line.kind), ["day", "day", "quiet", "day"]);
  // A stretch of quiet days is one line, newest to oldest.
  const quiet = agentNumbersRows({ kind: "day", from: "2026-11-11", to: "2026-11-18", people, spend: [], runs: [] }).rows;
  const lines = dayLines(quiet, day);
  assert.deepEqual(lines.map((line) => (line.kind === "quiet" ? `${line.oldest}~${line.newest}·${line.count}` : day(line.row))), [
    "2026-11-18", "2026-11-17", "2026-11-16~2026-11-16·1", "2026-11-15", "2026-11-11~2026-11-14·4",
  ]);
});

test("검색어 rows: the runs' queries and the people they found, most people first, the file people one row", () => {
  const { total, rows } = rowsOf("query");
  assert.deepEqual(rows.map((row) => row.key), [
    "open to work backend", "Ask HN: Who wants to be hired?", NO_QUERY, "AI 엔지니어 구직 중", "react developer looking",
  ]);
  const by = Object.fromEntries(rows.map((row) => [row.key, row]));
  const backend = by["open to work backend"];
  assert.equal(backend.numbers.found, 4);
  // Three searches of the wording (two on LinkedIn, one on the open web): kept + found again.
  assert.deepEqual([backend.run.searches, backend.run.newPeople + backend.run.knownPeople], [3, 4]);
  assert.deepEqual(backend.search, { found: 3, contactable: 2 });
  // Where its people were found first, then where it was searched.
  assert.deepEqual(backend.sources, ["linkedin", "fishbowlapp.com", "explore"]);
  // No search cost on a query row: a search's cost is the whole search's.
  assert.equal(backend.costBy.search, undefined);
  assert.deepEqual(by[NO_QUERY].sources, ["applicants-acme"]);
  assert.equal(by[NO_QUERY].numbers.found, 2);
  // 연락 가능 is of the row's 찾음: the file people with an address count (the search's 연락 가능 1명당 reads search.contactable).
  assert.deepEqual([by[NO_QUERY].withAddress, by[NO_QUERY].search.contactable], [2, 0]);
  assert.equal(by[NO_QUERY].run.searches, 0);
  // A wording that found nobody new still shows its searches.
  assert.deepEqual([by["react developer looking"].numbers.found, by["react developer looking"].run.searches], [0, 1]);
  // Outside the period (the 11/09 run): not counted.
  assert.equal(total.run.searches, 5);
});

test("a run's search records: tolerant of stored JSON, without the layoff news searches", () => {
  assert.deepEqual(yieldsOfSignalLog({
    linkedin: [
      { query: "a", kept: 2, known: 1, results: 9 }, { query: "", kept: 1 }, { query: "news", stage: "layoff_news", kept: 3 },
      { query: "b", kept: -1, known: "x" }, null, "bad",
    ],
    hn: "not a list",
  }), [{ source: "linkedin", query: "a", kept: 2, known: 1 }, { source: "linkedin", query: "b", kept: 0, known: 0 }]);
  assert.deepEqual(yieldsOfSignalLog(null), []);
});

test("a run under the filters: one site's searches and queries, one 설정 묶음's", () => {
  const A = "aaaaaaaaaaaa";
  const B = "bbbbbbbbbbbb";
  const run = {
    day: "2026-11-18", kind: "daily", configIds: [A, B], searchConfigs: { linkedin: A, naver_blog: B },
    counts: { found: 2, searches_linkedin: 2, signal_cost_linkedin: 0.4, searches_naver_blog: 1, signal_cost_naver_blog: 0.1, signal_cost_blog: 0.05 },
    yields: { linkedin: [{ query: "x", kept: 1 }], naver_blog: [{ query: "y", kept: 2 }] },
  };
  // A site's own keys only ("…_naver_blog" is not the source "blog").
  const blog = numbersRunOf(run, { source: "blog", configId: null });
  assert.deepEqual(blog?.counts, { signal_cost_blog: 0.05 });
  assert.equal(blog?.searchCostUsd, 0.05);
  const naver = numbersRunOf(run, { source: "naver_blog", configId: null });
  assert.deepEqual(naver?.yields, [{ source: "naver_blog", query: "y", kept: 2, known: 0 }]);
  const underA = numbersRunOf(run, { source: null, configId: A });
  assert.deepEqual(underA?.counts, { searches_linkedin: 2, signal_cost_linkedin: 0.4 });
  assert.deepEqual(underA?.yields?.map((item) => item.query), ["x"]);
  assert.equal(underA?.searchCostUsd, 0.4);
  // A file: under its 설정 묶음 only, and a site filter keeps it only for LinkedIn.
  const file = { day: "2026-11-18", kind: "import", configIds: [B], searchConfigs: {}, counts: {} };
  assert.equal(numbersRunOf(file, { source: null, configId: A }), null);
  assert.equal(numbersRunOf(file, { source: null, configId: B })?.kind, "import");
  assert.equal(numbersRunOf(file, { source: "hn", configId: null }), null);
});

test("costs by step: 메일's 비용 is what the daily cap counts, Ashley 비용 the replies (no cap), and together all of it", () => {
  // p2 is the person Ashley answered.
  const withReply = [...spend, { personId: "p2", step: "reply" as const, usd: 0.05 }];
  for (const kind of NUMBERS_ROWS) {
    const { total, rows } = agentNumbersRows({ kind, from: FROM, to: TO, people, spend: withReply, runs, searchPeople, always: ["linkedin"] });
    // Per person, so on every kind (검색어 rows too) the rows add up to the 합계's.
    assert.equal(ashleyCostUsd(total), 0.05, kind);
    assert.equal(Math.round(rows.reduce((n, row) => n + ashleyCostUsd(row), 0) * 10_000) / 10_000, 0.05, kind);
    assert.equal(total.numbers.costUsd, Math.round((cappedCostUsd(total) + ashleyCostUsd(total)) * 10_000) / 10_000, kind);
    assert.equal(cappedCostBy(total.costBy).reply, undefined, kind);
  }
  const { total } = agentNumbersRows({ kind: "day", from: FROM, to: TO, people, spend: withReply, runs, searchPeople });
  // The same as without the reply: the cap's figure does not move when Ashley answers.
  assert.equal(cappedCostUsd(total), 0.84);
  assert.equal(total.numbers.costUsd, 0.89);
  assert.equal(cappedCostPerContact(total), 0.168);
  assert.equal(cappedCostPerContact({ costBy: { compose: 1 }, numbers: { ...total.numbers, contacted: 0 } }), null);
});

test("지금까지's 가입 1명당: 비용 ÷ 가입 to the cent, none without a signup", () => {
  assert.equal(costPerSignup({ signedUp: 16, costUsd: 33.389441 }), 2.09);
  assert.equal(costPerSignup({ signedUp: 0, costUsd: 33.39 }), null);
});

test("하루 평균 가입: 가입 ÷ days from the first day to today, both ends in", () => {
  assert.deepEqual(signupsPerDay({ from: "2026-11-18", to: "2026-11-22", signedUp: 16 }), { days: 5, perDay: 3.2 });
  assert.deepEqual(signupsPerDay({ from: "2026-11-22", to: "2026-11-22", signedUp: 0 }), { days: 1, perDay: 0 });
  assert.deepEqual(signupsPerDay({ from: "2026-11-28", to: "2026-12-02", signedUp: 1 }), { days: 5, perDay: 0.2 });
});
