import assert from "node:assert/strict";
import test from "node:test";
import { ashleyCostUsd, cappedCostBy, cappedCostPerContact, cappedCostUsd } from "./daily";
import { columnCount, FUNNEL_COLUMNS, inFunnelColumn } from "./funnel";
import {
  agentNumbersRows, allTimeFrom, channelOfPerson, costPerSignup, dayLines, isQuietDay, NO_QUERY, noSearchRecord, NUMBERS_ROWS, numbersKeyOf,
  numbersPick, numbersRunOf, signupsPerDay, yieldsOfSignalLog,
  type NumbersPerson, type NumbersPick, type NumbersRows, type NumbersRun,
} from "./numbers";
import { periodLength, resolveAgentPeriod } from "./period";
import { filtersForColumn, logFiltersMatch } from "./stage";

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

/**
 * What the log keeps for a pick (views.server.ts listAgentPeopleLog: source, the day as the period, search_query in its
 * SQL; the channel by channelOfPerson).
 */
const inPick = (pick: NumbersPick, row: Person) => (!pick.source || row.source === pick.source)
  && (!pick.day || row.foundDay === pick.day) && row.foundDay >= FROM && row.foundDay <= TO
  && (pick.query === null || (pick.query === NO_QUERY ? row.searchQuery == null : row.searchQuery === pick.query))
  && (!pick.channel || channelOfPerson(row) === pick.channel);

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
    assert.equal(rows.reduce((n, row) => n + row.lookupFound, 0), total.lookupFound, `${kind} lookups`);
    assert.equal(rows.reduce((n, row) => n + row.search.found, 0), total.search.found, `${kind} search`);
    assert.deepEqual([total.numbers.lookupTried, total.lookupFound, total.numbers.withAddress], [2, 1, 3], kind);
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
          const shown = people.filter((item) => inPick(pick, item) && logFiltersMatch(filtersForColumn(column), item));
          assert.equal(shown.length, columnCount(row.numbers, column), `${kind} ${row.key} ${column}`);
          assert.ok(shown.every((item) => inFunnelColumn(column, item)), `${kind} ${row.key} ${column}`);
        }
      }
    }
  }
});

test("a number click carries the row's key in its own field and the panel's filters", () => {
  const filters = { source: "hn", config: "aaaaaaaaaaaa" };
  const none = { source: null, day: null, query: null, config: null, channel: null };
  assert.deepEqual(numbersPick("day", "2026-11-18", filters), { ...none, source: "hn", day: "2026-11-18", config: filters.config });
  assert.deepEqual(numbersPick("query", NO_QUERY, filters), { ...none, source: "hn", query: "", config: filters.config });
  // 찾은 곳 rows: the row is the source, the 합계 every source.
  assert.deepEqual(numbersPick("source", "linkedin", filters), { ...none, source: "linkedin", config: filters.config });
  assert.deepEqual(numbersPick("source", null, filters), { ...none, config: filters.config });
  assert.deepEqual(numbersPick("query", null, { source: null, config: null }), none);
  // 채널 rows: the channel with the panel's 찾은 곳; the 합계 every channel.
  assert.deepEqual(numbersPick("channel", "comment", filters), { ...none, source: "hn", config: filters.config, channel: "comment" });
  assert.deepEqual(numbersPick("channel", null, filters), { ...none, source: "hn", config: filters.config });
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
  assert.deepEqual([by[NO_QUERY].numbers.withAddress, by[NO_QUERY].search.contactable], [2, 0]);
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

test("하루 평균 가입: 가입 ÷ the send days (월~금 by default) from the first day to today, both ends in", () => {
  // 11/18 Wed - 11/23 Mon: Wed, Thu, Fri, Mon (the screen's 18명 ÷ 6일 on 11/23 becomes ÷ 4일).
  assert.deepEqual(signupsPerDay({ from: "2026-11-18", to: "2026-11-23", signedUp: 18 }), { days: 4, perDay: 4.5 });
  assert.deepEqual(signupsPerDay({ from: "2026-11-18", to: "2026-11-22", signedUp: 16 }), { days: 3, perDay: 5.3 });
  // Only weekend days so far: one day, not zero.
  assert.deepEqual(signupsPerDay({ from: "2026-11-21", to: "2026-11-22", signedUp: 1 }), { days: 1, perDay: 1 });
  // The send days chosen in 설정.
  assert.deepEqual(signupsPerDay({ from: "2026-11-18", to: "2026-11-24", signedUp: 14 }, [0, 1, 2, 3, 4, 5, 6]), { days: 7, perDay: 2 });
  assert.deepEqual(signupsPerDay({ from: "2026-11-28", to: "2026-12-02", signedUp: 1 }), { days: 3, perDay: 0.3 });
});

test("검색 안 함: a company's applicant list (a 사이트 row, or the 찾은 곳 filter) and the no-query row have no searches to open", () => {
  const filters = { source: null };
  const bySource = Object.fromEntries(rowsOf("source").rows.map((row) => [row.key, row]));
  // Uploaded, never searched: no 0번 / $0.00 that opens an empty 검색 기록.
  assert.equal(noSearchRecord("source", bySource["applicants-acme"], filters), "not_searched");
  assert.equal(bySource["applicants-acme"].run.searches, 0);
  // Searched sites (and an empty turned-on one, whose log is just empty for the period) keep their figures.
  for (const source of ["linkedin", "hn", "threads"]) assert.equal(noSearchRecord("source", bySource[source], filters), null, source);
  assert.equal(noSearchRecord("source", rowsOf("source").total, filters), null);
  const byQuery = Object.fromEntries(rowsOf("query").rows.map((row) => [row.key, row]));
  assert.equal(noSearchRecord("query", byQuery[NO_QUERY], filters), "not_searched");
  assert.equal(noSearchRecord("query", byQuery["open to work backend"], filters), null);
  // People under a wording with no search record of it (a cut-off search run again later).
  assert.equal(noSearchRecord("query", byQuery["AI 엔지니어 구직 중"], filters), "no_record");
  // 날짜 rows: a day's 검색 기록 lists its runs and files, so only an applicant-list 찾은 곳 filter makes them 검색 안 함
  // (every day and the 합계: that list is never searched).
  const days = rowsOf("day");
  for (const row of [days.total, ...days.rows]) {
    assert.equal(noSearchRecord("day", row, filters), null, String(row.key));
    const underList = { ...row, run: { ...row.run, searches: 0 } };
    assert.equal(noSearchRecord("day", underList, { source: "applicants-acme" }), "not_searched", String(row.key));
    assert.equal(noSearchRecord("query", underList, { source: "applicants-acme" }), "not_searched", String(row.key));
  }
  // A row that has searches always shows them.
  assert.equal(noSearchRecord("source", { ...bySource["applicants-acme"], run: { ...bySource["applicants-acme"].run, searches: 1 } }, filters), null);
});

test("지금까지 starts on the first day, cut to 365 days back as the log's period is, so 누적 가입 opens exactly its people", () => {
  const today = "2026-11-22";
  assert.equal(allTimeFrom("2026-11-17", today), "2026-11-17");
  assert.equal(allTimeFrom(null, today), today);
  assert.equal(allTimeFrom("2026-12-01", today), today);
  assert.equal(allTimeFrom("not a day", today), today);
  for (const first of ["2024-01-01", "2025-11-23", "2025-11-22"]) {
    const from = allTimeFrom(first, today);
    assert.equal(from, "2025-11-23", first);
    assert.equal(periodLength(from, today), 365, first);
    // The log resolves { from, to } to the same days, so its people are the ones counted.
    const logPeriod = resolveAgentPeriod({ from, to: today }, today);
    assert.deepEqual([logPeriod.from, logPeriod.to], [from, today], first);
    // Every day of those 365 when mails go out every day; the weekdays among them by default.
    assert.equal(signupsPerDay({ from, to: today, signedUp: 365 }, [0, 1, 2, 3, 4, 5, 6]).days, 365, first);
    assert.equal(signupsPerDay({ from, to: today, signedUp: 365 }).days, 260, first);
  }
});

test("채널 rows: where × why each person wrote, in the queue's order; each number opens exactly its people; givers apart", () => {
  const day = "2026-11-18";
  const found: Person[] = [
    mailed(day, { source: "linkedin", method: "signal_post", intent: "job", clickedAt: `${day}T03:00:00Z` }),
    mailed(day, { source: "linkedin", method: "signal_post", intent: "coaching", signedUpAt: `${day}T04:00:00Z` }),
    person(day, { source: "linkedin", method: "signal_post", intent: "event", status: "excluded", excludeReason: "no_email" }),
    replied(day, { source: "linkedin", method: "signal_post", intent: "job", foundAs: "commenter" }),
    // A Hacker News thread's commenters stay job seekers (that thread is a job-seeking list).
    mailed(day, { source: "hn", method: "signal_post", foundAs: "commenter" }),
    person(day, { source: "github", method: "open_to_work_profile", status: "approved" }),
    mailed(day, { source: "harper", method: "db", searchQuery: null }),
    person(day, { source: "applicants-acme", method: "applicant", searchQuery: null, status: "excluded", excludeReason: "member" }),
    person(day, { source: "linkedin", method: "layoff_company" }),
    // Givers: in no row (a commenter recruiter would make a 댓글 row of zeros), counted apart on the 합계.
    person(day, { source: "linkedin", method: "signal_post", foundAs: "commenter", status: "excluded", excludeReason: "giver", giverKind: "recruiter" }),
    person(day, { source: "linkedin", method: "signal_post", intent: "event", status: "excluded", excludeReason: "giver", giverKind: "event_host" }),
  ];
  const giverSpend = [{ personId: found[9].personId, step: "lookup" as const, usd: 0.12 }];
  const { total, rows } = agentNumbersRows({ kind: "channel", from: FROM, to: TO, people: found, spend: giverSpend, runs, searchPeople });
  assert.deepEqual(rows.map((row) => row.key), ["job", "layoff", "applicant", "coaching_post", "event_post", "comment", "github", "db"]);
  const by = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.deepEqual([by.job.numbers.found, by.comment.numbers.found, by.coaching_post.numbers.signedUp], [2, 1, 1]);
  assert.equal(total.numbers.found, 9);
  assert.equal(total.numbers.givers, 2);
  assert.ok(rows.every((row) => row.numbers.givers === 0));
  // No searches and no search cost on a channel row; the givers' own spend is no row's.
  assert.ok([total, ...rows].every((row) => !row.run.searches && !row.costBy.search && !row.search.found));
  assert.equal(total.numbers.costUsd, 0);
  // The row's key is the log's channel filter: every number is exactly its people.
  for (const row of [total, ...rows]) {
    const pick = numbersPick("channel", row.key, { source: null, config: null });
    for (const column of FUNNEL_COLUMNS) {
      const shown = found.filter((item) => inPick(pick, item) && logFiltersMatch(filtersForColumn(column), item));
      assert.equal(shown.length, columnCount(row.numbers, column), `${row.key} ${column}`);
    }
  }
  assert.ok(found.every((item) => numbersKeyOf("channel", item) === channelOfPerson(item)));
  // The 돕는 쪽 line opens exactly the givers it counts.
  assert.equal(found.filter((item) => inPick(numbersPick("channel", null, { source: null, config: null }), item)
    && logFiltersMatch({ side: "givers" }, item)).length, total.numbers.givers);
});

test("givers are no row's in any row kind, and the 합계 counts them apart the same", () => {
  const withGivers = [
    ...people,
    person("2026-11-18", { status: "excluded", excludeReason: "giver", giverKind: "hiring_leader", searchQuery: "hiring backend" }),
  ];
  for (const kind of NUMBERS_ROWS) {
    const plain = rowsOf(kind);
    const view = agentNumbersRows({ kind, from: FROM, to: TO, people: withGivers, spend, runs, searchPeople, always: ["linkedin", "threads"] });
    assert.equal(view.total.numbers.givers, 1, kind);
    assert.deepEqual(view.rows.map((row) => row.key), plain.rows.map((row) => row.key), kind);
    for (const column of FUNNEL_COLUMNS) assert.equal(columnCount(view.total.numbers, column), columnCount(plain.total.numbers, column), `${kind} ${column}`);
  }
});
