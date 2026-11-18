import assert from "node:assert/strict";
import test from "node:test";
import { identifyPerson, judgeBatch, judgePrompt, readPage, signalSourceInfo } from "./signals";
import { HN_MAX_THREADS, hnCommentText, hnJudgeInput, hnKoreaComments, hnPageUrl, hnThreads, mentionsKorea } from "./signals.hn";
import { defaultSignalSourceSetting } from "./tuning";

const NOW = new Date("2026-11-17T03:00:00Z");

test("the threads: 'Who wants to be hired?' only, at most this month's and last month's, newest first", () => {
  const response = {
    hits: [
      { objectID: "300", title: "Ask HN: Who is hiring? (November 2026)", created_at: "2026-11-02T16:00:00Z" },
      { objectID: "301", title: "Ask HN: Who wants to be hired? (November 2026)", created_at: "2026-11-02T16:00:00Z" },
      { objectID: "302", title: "Ask HN: Freelancer? Seeking freelancer? (November 2026)", created_at: "2026-11-02T16:00:00Z" },
      { objectID: "201", title: "Ask HN: Who wants to be hired? (October 2026)", created_at: "2026-10-01T15:00:00Z" },
      { objectID: "101", title: "Ask HN: Who wants to be hired? (September 2026)", created_at: "2026-09-01T15:00:00Z" },
      { objectID: "x", title: "Ask HN: Who wants to be hired? (bad id)", created_at: "2026-11-01T00:00:00Z" },
    ],
  };
  // On 11/17 last month's thread is older than 14 + 31 days; a week earlier it is still read (late comments).
  assert.deepEqual(hnThreads(response, NOW, 14).map((thread) => thread.id), ["301"]);
  assert.deepEqual(hnThreads(response, new Date("2026-11-10T00:00:00Z"), 14).map((thread) => thread.id), ["301", "201"]);
  assert.equal(HN_MAX_THREADS, 2);
  assert.deepEqual(hnThreads(null, NOW), []);
  assert.deepEqual(hnThreads({ hits: "nope" }, NOW), []);
});

test("a comment as plain text: paragraphs, full link addresses, entities", () => {
  const html = "Location: Seoul, South Korea<p>Remote: Yes<p>Résumé: <a href=\"https:&#x2F;&#x2F;example.com&#x2F;jdoe&#x2F;resume.pdf\" rel=\"nofollow\">https:&#x2F;&#x2F;example.com&#x2F;jdoe&#x2F;r...</a><p>Email: jdoe [at] example.com &amp; I&#x27;m &quot;open&quot;";
  assert.equal(hnCommentText(html), "Location: Seoul, South Korea\n\nRemote: Yes\n\nRésumé: https://example.com/jdoe/resume.pdf\n\nEmail: jdoe [at] example.com & I'm \"open\"");
  assert.equal(hnCommentText(null), "");
});

test("Korea in a comment: the country, its cities, its time zone; not look-alike words", () => {
  for (const yes of ["Location: Seoul", "Busan, KR", "South Korea", "Korean speaker", "Timezone: KST", "UTC+9", "GMT +09:00", "한국 거주", "판교"]) {
    assert.equal(mentionsKorea(yes), true, yes);
  }
  for (const no of ["Location: Berlin", "Koreatown is not a place I live", "kstream", "UTC+10"]) {
    assert.equal(mentionsKorea(no), false, no);
  }
});

test("the comments judged: top-level, about Korea, within the window, newest first", () => {
  const item = {
    id: 301, title: "Ask HN: Who wants to be hired? (November 2026)",
    children: [
      { id: 1, type: "comment", created_at: "2026-11-10T00:00:00Z", text: "Location: Seoul<p>Email: jdoe@example.com", children: [{ id: 9, text: "Seoul reply" }] },
      { id: 2, type: "comment", created_at: "2026-11-02T17:00:00Z", text: "Location: Busan" },
      { id: 3, type: "comment", created_at: "2026-11-12T00:00:00Z", text: "Location: Berlin" },
      { id: 4, type: "comment", created_at: "2026-11-15T00:00:00Z", text: null },
      { id: 5, type: "comment", created_at: "2026-11-16T00:00:00Z", text: "Remote, KST hours" },
    ],
  };
  const comments = hnKoreaComments(item, NOW, 14, true);
  assert.equal(comments.topLevel, 4);
  assert.equal(comments.korea, 3);
  // Korea only: the Busan comment is older than 14 days; replies are not read.
  assert.deepEqual(comments.fresh.map((comment) => comment.id), ["5", "1"]);
  // Every country (the default since 11/18): Korea ones first, then the rest newest first.
  assert.deepEqual(hnKoreaComments(item, NOW, 14).fresh.map((comment) => comment.id), ["5", "1", "3"]);
  assert.deepEqual(hnKoreaComments({}, NOW), { topLevel: 0, korea: 0, fresh: [] });
});

test("each comment is its own page; who it is comes from what they wrote", () => {
  const thread = { id: "301", title: "Ask HN: Who wants to be hired? (November 2026)", createdAt: "2026-11-02T16:00:00Z" };
  const input = hnJudgeInput(thread, { id: "1", createdAt: "2026-11-10T00:00:00Z", text: "Location: Seoul\n\nSite: https://jdoe.example.dev" });
  assert.equal(input.url, hnPageUrl("1"));
  assert.deepEqual(readPage(input.url), { source: "hn", kind: "post", author: null });
  const [page] = judgeBatch([input], signalSourceInfo("hn").textChars);
  assert.equal(page.id, "r0");
  assert.match(page.text, /^Ask HN: Who wants to be hired\? \(November 2026\) Location: Seoul Site: https:\/\/jdoe\.example\.dev$/);
  assert.match(judgePrompt([page], { source: "hn", now: NOW }).user, /^\[r0\] https:\/\/news\.ycombinator\.com\/item\?id=1 \(published 2026-11-10/);
  // The comment page never stands for the person: their own site does; without one (or an email) nobody is kept.
  assert.equal(identifyPerson({ url: page.url, text: page.text, email: "", contactUrl: "https://jdoe.example.dev" }).key, "url:jdoe.example.dev");
  assert.equal(identifyPerson({ url: page.url, text: page.text, email: "", contactUrl: "" }).key, null);
  // On by default: it costs only the judging of a few comments.
  assert.equal(defaultSignalSourceSetting("hn").enabled, true);
});
