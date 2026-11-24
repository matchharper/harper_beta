import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_MAX_DAYS, EVENT_PAGES_MAX, EVENT_QUERIES_MAX, EVENT_SCHEMA, checkedEvents, eventDay, eventInWindow, eventPageUrl, eventPages,
  eventPrompt, eventQueries, eventSearchFacts, eventTime, eventWindowLabel, eventsNote, storedEvents, titleOnPage, upcomingEvents,
  type EventPage, type EventPick,
} from "./events";

const NOW = new Date("2026-11-23T03:00:00.000Z");

const page = (patch: Partial<EventPage> = {}): EventPage => ({
  id: "r0", url: "https://events.example.com/data-meetup-12", title: "Data Engineering Meetup #12",
  text: "Data Engineering Meetup #12 · Dec 3, 2026 7pm · Example Hall, Riverside City. Talks on streaming pipelines.",
  publishedDate: null, ...patch,
});

const pick = (patch: Partial<EventPick> = {}): Partial<EventPick> => ({
  page: "r0", title: "Data Engineering Meetup #12", startsAt: "2026-12-03T19:00", endsAt: null, place: "Example Hall, Riverside City",
  online: false, organizer: "Example Data Club", why: "Streaming talks close to the pipelines you build.", ...patch,
});

test("event time: ISO with or without a zone, or a date alone; never a day that does not exist", () => {
  assert.equal(eventTime("2026-12-03"), "2026-12-03");
  assert.equal(eventTime("2026-12-03T19:00"), "2026-12-03T19:00");
  assert.equal(eventTime(" 2026-12-03T19:00:00+09:00 "), "2026-12-03T19:00:00+09:00");
  assert.equal(eventTime("2026-12-03T10:00:00Z"), "2026-12-03T10:00:00Z");
  assert.equal(eventTime("2026-02-30"), null);
  assert.equal(eventTime("2026-13-01"), null);
  assert.equal(eventTime("2026-12-03T25:00"), null);
  assert.equal(eventTime("Dec 3, 2026"), null);
  assert.equal(eventTime("next Tuesday"), null);
  assert.equal(eventTime(""), null);
  assert.equal(eventTime(null), null);
});

test("window: after now and within 60 days; a past start or one too far out is not in it", () => {
  assert.equal(EVENT_MAX_DAYS, 60);
  assert.equal(eventInWindow("2026-12-03", NOW), true);
  assert.equal(eventInWindow("2026-11-23T02:59:00Z", NOW), false);
  // A date alone counts from that day's start (UTC): today is already past, as the send step reads it.
  assert.equal(eventInWindow("2026-11-23", NOW), false);
  assert.equal(eventInWindow("2026-11-24", NOW), true);
  assert.equal(eventInWindow("2027-01-22T03:00:00Z", NOW), true);
  assert.equal(eventInWindow("2027-01-22T03:00:01Z", NOW), false);
  assert.equal(eventInWindow("2027-03-01", NOW), false);
  assert.equal(eventInWindow("not a date", NOW), false);
});

test("upcoming: a started event is dropped", () => {
  const events = storedEvents([
    { title: "Past", url: "https://a.example.com/e", startsAt: "2026-11-20", why: "x" },
    { title: "Next", url: "https://b.example.com/e", startsAt: "2026-12-01", why: "y" },
  ]);
  assert.deepEqual(upcomingEvents(events, NOW).map((event) => event.title), ["Next"]);
});

test("page links: http(s) on a public host, no credentials, no fragment", () => {
  assert.equal(eventPageUrl("https://events.example.com/e/1#tickets"), "https://events.example.com/e/1");
  assert.equal(eventPageUrl("http://example.org/meetup?id=3"), "http://example.org/meetup?id=3");
  assert.equal(eventPageUrl("javascript:alert(1)"), null);
  assert.equal(eventPageUrl("ftp://example.org/e"), null);
  assert.equal(eventPageUrl("https://user:pass@example.org/e"), null);
  assert.equal(eventPageUrl("https://localhost/e"), null);
  assert.equal(eventPageUrl("https://127.0.0.1/e"), null);
  assert.equal(eventPageUrl("https://intranet/e"), null);
  assert.equal(eventPageUrl(`https://example.org/${"a".repeat(2_100)}`), null);
  assert.equal(eventPageUrl("not a link"), null);
});

test("search facts: the headline's first part and the location's first part, as written", () => {
  assert.deepEqual(eventSearchFacts({ headline: "Data Engineer at Company A | Spark, Kafka", location: "Riverside City, Some Country" }),
    { field: "Data Engineer", city: "Riverside City" });
  assert.deepEqual(eventSearchFacts({ headline: "UI/UX Designer @ Company B", location: null }), { field: "UI/UX Designer", city: null });
  assert.deepEqual(eventSearchFacts({ headline: "프론트엔드 개발자 · React", location: "강변시 (Riverside)" }), { field: "프론트엔드 개발자", city: "강변시" });
  assert.deepEqual(eventSearchFacts({ headline: null, location: null, signalText: "Looking for ML meetups to join. Any tips?" }),
    { field: "Looking for ML meetups to join.", city: null });
  assert.deepEqual(eventSearchFacts({ headline: " ", location: " ", signalText: null }), { field: null, city: null });
});

test("queries: one round, at most three, in the mail's language, with the months the window covers", () => {
  assert.equal(eventWindowLabel(NOW, "en"), "November 2026 – January 2027");
  assert.equal(eventWindowLabel(NOW, "ko"), "2026년 11월~2027년 1월");
  const en = eventQueries({ field: "Data Engineer", city: "Riverside City" }, { language: "en", now: NOW });
  assert.equal(en.length, EVENT_QUERIES_MAX);
  assert.ok(en.every((query) => query.includes("Data Engineer") && query.includes("November 2026")));
  assert.ok(en[0].includes("in Riverside City"));
  const online = eventQueries({ field: "Data Engineer", city: null }, { language: "en", now: NOW });
  assert.equal(online.length, 2);
  assert.ok(online.every((query) => /online/.test(query)));
  const ko = eventQueries({ field: "백엔드 개발자", city: "강변시" }, { language: "ko", now: NOW });
  assert.ok(ko[0].startsWith("강변시 백엔드 개발자 밋업"));
  assert.deepEqual(eventQueries({ field: null, city: "Riverside City" }, { language: "en", now: NOW }), []);
});

test("pages: each page once, usable links only, ids in order, text collapsed and cut", () => {
  const pages = eventPages([
    { url: "https://events.example.com/a", title: "A", text: "one\n\n two" },
    { url: "https://www.events.example.com/a/#x", title: "A again" },
    { url: "javascript:void(0)", title: "bad" },
    { url: "https://events.example.com/b", title: "B", text: "x".repeat(5_000), publishedDate: "2026-11-01T00:00:00.000Z" },
  ], 100);
  assert.deepEqual(pages.map((item) => [item.id, item.url]), [["r0", "https://events.example.com/a"], ["r1", "https://events.example.com/b"]]);
  assert.equal(pages[0].text, "one two");
  assert.equal(pages[1].text.length, 100);
  const many = eventPages(Array.from({ length: 40 }, (_, index) => ({ url: `https://events.example.com/${index}` })));
  assert.equal(many.length, EVENT_PAGES_MAX);
});

test("title on page: the name's words are on the page; a made-up name is not", () => {
  assert.equal(titleOnPage("Data Engineering Meetup #12", page()), true);
  assert.equal(titleOnPage("data engineering meetup", page()), true);
  assert.equal(titleOnPage("Cloud Summit 2026", page()), false);
  assert.equal(titleOnPage("", page()), false);
  assert.equal(titleOnPage("데이터 엔지니어 밋업", page({ title: "12월 데이터 엔지니어 밋업", text: "" })), true);
});

test("checked events: kept from the result page with its link, in the model's order, up to max", () => {
  const pages = [page(), page({ id: "r1", url: "https://events.example.com/stream-webinar", title: "Streaming Webinar", text: "Streaming Webinar online Dec 10" })];
  const { events, dropped } = checkedEvents([
    pick(),
    pick({ page: "r1", title: "Streaming Webinar", startsAt: "2026-12-10", place: null, online: true, organizer: null }),
  ], pages, { now: NOW, max: 2 });
  assert.deepEqual(dropped, {});
  assert.deepEqual(events, [
    {
      title: "Data Engineering Meetup #12", url: "https://events.example.com/data-meetup-12", startsAt: "2026-12-03T19:00", endsAt: null,
      place: "Example Hall, Riverside City", online: false, organizer: "Example Data Club", why: "Streaming talks close to the pipelines you build.",
    },
    {
      title: "Streaming Webinar", url: "https://events.example.com/stream-webinar", startsAt: "2026-12-10", endsAt: null, place: null, online: true,
      organizer: null, why: "Streaming talks close to the pipelines you build.",
    },
  ]);
  assert.equal(checkedEvents([pick(), pick({ page: "r1", title: "Streaming Webinar", online: true })], pages, { now: NOW, max: 1 }).events.length, 1);
});

test("checked events: never an invented page or name, a past, undated or far event, one without a place or why, or a repeat", () => {
  const { events, dropped } = checkedEvents([
    pick({ page: "r9" }),
    pick({ title: "Cloud Summit 2026" }),
    pick({ startsAt: "December 3" }),
    pick({ startsAt: "2026-11-01" }),
    pick({ startsAt: "2027-02-15" }),
    pick({ place: " ", online: false }),
    pick({ why: "" }),
    pick({ endsAt: "2026-12-01" }),
    pick(),
  ], [page()], { now: NOW, max: 5 });
  assert.equal(events.length, 1);
  // An end before the start is dropped, not the event.
  assert.equal(events[0].endsAt, null);
  assert.deepEqual(dropped, { no_page: 1, not_on_page: 1, no_date: 1, past: 1, too_far: 1, no_place: 1, no_why: 1, duplicate: 1 });
});

test("note: what the search did and what was dropped; none when it found events cleanly", () => {
  assert.equal(eventsNote({ queries: 3, failed: 0, pages: 12, found: 2, dropped: {} }), null);
  assert.equal(eventsNote({ queries: 3, failed: 1, pages: 9, found: 0, dropped: { past: 2 } }),
    "이벤트 검색 3번 (1번 실패), 페이지 9개에서 맞는 행사가 없어요 · 뺀 것: 지난 행사 2개");
  assert.equal(eventsNote({ queries: 2, failed: 0, pages: 5, found: 1, dropped: { too_far: 1 } }),
    "이벤트 검색 2번, 페이지 5개에서 1개 골랐어요 · 뺀 것: 60일 넘게 남은 행사 1개");
});

test("prompt: the window's dates, the person's city or online only, results only, the mail's language for why; no country named", () => {
  const prompt = eventPrompt({
    person: { headline: "Data Engineer at Company A", location: "Riverside City", currentCompany: "Company A", background: null },
    facts: { field: "Data Engineer", city: "Riverside City" }, pages: [page()], language: "ko", now: NOW, max: 2,
  });
  assert.match(prompt.system, /start after 2026-11-23 and on or before 2027-01-22/);
  assert.match(prompt.system, /in or near Riverside City/);
  assert.match(prompt.system, /Use only the RESULTS\. Never invent/);
  assert.match(prompt.system, /one short line in Korean/);
  assert.match(prompt.user, /\[r0\] https:\/\/events\.example\.com\/data-meetup-12/);
  assert.doesNotMatch(prompt.system, /\bKorea\b|United States|Japan/);
  const online = eventPrompt({ person: { headline: null, location: null, currentCompany: null, background: null }, facts: { field: "x", city: null }, pages: [], language: "en", now: NOW, max: 2 });
  assert.match(online.system, /online \(their city is not known\)/);
  assert.match(online.system, /one short line in English/);
  // An English mail: events its reader can follow, the place in English; the name as the page writes it either way.
  assert.match(online.system, /The person reads English: pick an event held in another language only when/);
  assert.match(online.system, /place: the venue and city as an English reader should see them/);
  assert.doesNotMatch(prompt.system, /The person reads English|English reader/);
  assert.match(prompt.system, /place: the venue and city as written/);
  for (const system of [prompt.system, online.system]) assert.match(system, /title: the event's name as the page writes it/);
  assert.deepEqual([...EVENT_SCHEMA.properties.events.items.required].sort(), ["endsAt", "online", "organizer", "page", "place", "startsAt", "title", "why"]);
});

test("stored events: well-formed ones only, at most five", () => {
  assert.deepEqual(storedEvents(null), []);
  assert.deepEqual(storedEvents("x"), []);
  const events = storedEvents([
    { title: "Ok", url: "https://events.example.com/ok", startsAt: "2026-12-03", endsAt: "bad", place: "Hall", online: "yes", organizer: "", why: "Fits." },
    { title: "", url: "https://events.example.com/x", startsAt: "2026-12-03" },
    { title: "No link", url: "javascript:alert(1)", startsAt: "2026-12-03" },
    { title: "No date", url: "https://events.example.com/y", startsAt: "soon" },
  ]);
  assert.deepEqual(events, [{ title: "Ok", url: "https://events.example.com/ok", startsAt: "2026-12-03", endsAt: null, place: "Hall", online: false, organizer: null, why: "Fits." }]);
  assert.equal(storedEvents(Array.from({ length: 8 }, (_, index) => ({ title: `E${index}`, url: `https://e.example.com/${index}`, startsAt: "2026-12-03" }))).length, 5);
});

test("day label: the date part as written, like the mail", () => {
  assert.equal(eventDay("2026-12-03T19:00:00+09:00", "ko"), "12월 3일(목)");
  assert.equal(eventDay("2026-12-03", "en"), "Thu, Dec 3");
  assert.equal(eventDay(null, "en"), "");
});
