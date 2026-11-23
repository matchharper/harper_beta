import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_CHANNELS, CANDIDATE_CHANNELS, byQueueOrder, channelOf, channelRoomLeft, defaultChannelSettings, hasDailyMax, isCompanyChannel,
  isFillChannel, normalizeChannelSettings, offerOf, queueRank, searchedIntents, storedOffer,
} from "./channels";

test("a person's channel: where they were found × why they wrote", () => {
  assert.equal(channelOf({ source: "linkedin", method: "db" }), "db");
  assert.equal(channelOf({ source: "linkedin", method: "applicant" }), "applicant");
  assert.equal(channelOf({ source: "news", method: "layoff_company" }), "layoff");
  assert.equal(channelOf({ source: "github", method: "open_to_work_profile", intent: "job" }), "github");
  assert.equal(channelOf({ source: "linkedin", method: "signal_post", intent: "coaching", foundAs: "commenter" }), "comment");
  // A Hacker News thread's commenters stay where they were (that thread is a job-seeking list).
  assert.equal(channelOf({ source: "hn", method: "signal_post", intent: "job", foundAs: "commenter" }), "job");
  assert.equal(channelOf({ source: "linkedin", method: "signal_post", intent: "coaching" }), "coaching_post");
  assert.equal(channelOf({ source: "threads", method: "signal_post", intent: "event" }), "event_post");
  assert.equal(channelOf({ source: "linkedin", method: "signal_post", intent: null }), "job");
});

test("the offer the intent picks; mails stored before offers existed read as posting mails", () => {
  assert.equal(offerOf({ method: "db", intent: null }), "general");
  assert.equal(offerOf({ method: "signal_post", intent: "coaching" }), "coaching");
  assert.equal(offerOf({ method: "signal_post", intent: "event" }), "general");
  assert.equal(offerOf({ method: "signal_post", intent: "job" }), "posting");
  assert.equal(offerOf({ method: "applicant", intent: null }), "posting");
  assert.equal(storedOffer(null), "posting");
  assert.equal(storedOffer("posting_post"), "posting");
  assert.equal(storedOffer("coaching"), "coaching");
});

test("the queue: existing dated → new dated → existing undated → new undated, then newest signal, then longest waiting", () => {
  const at = "2026-11-23T01:00:00Z";
  assert.deepEqual(
    [{ channel: "db" as const, signalAt: null }, { channel: "applicant" as const, signalAt: null }, { channel: "coaching_post" as const, signalAt: at }, { channel: "job" as const, signalAt: at }]
      .map(queueRank),
    [3, 2, 1, 0],
  );
  const people = [
    { channel: "job" as const, signalAt: "2026-11-22T01:00:00Z", updatedAt: "2026-11-22T02:00:00Z", name: "older post" },
    { channel: "applicant" as const, signalAt: null, updatedAt: "2026-11-01T00:00:00Z", name: "applicant" },
    { channel: "job" as const, signalAt: "2026-11-23T01:00:00Z", updatedAt: "2026-11-23T02:00:00Z", name: "newer post" },
    { channel: "github" as const, signalAt: "2026-11-23T05:00:00Z", updatedAt: "2026-11-23T05:00:00Z", name: "github" },
  ];
  assert.deepEqual([...people].sort(byQueueOrder).map((person) => person.name), ["newer post", "older post", "github", "applicant"]);
});

test("settings: every channel switchable; a daily max only for the new candidate channels and the company side", () => {
  const defaults = defaultChannelSettings();
  assert.deepEqual(Object.keys(defaults).sort(), [...AGENT_CHANNELS].sort());
  assert.equal(defaults.job.dailyMax, null);
  assert.equal(defaults.db.dailyMax, 20);
  assert.equal(defaults.company_post.dailyMax, 20);
  assert.ok(isCompanyChannel("company_post") && !isFillChannel("company_post") && hasDailyMax("company_post"));
  assert.ok(!CANDIDATE_CHANNELS.includes("company_post" as never));
  const { settings, issues } = normalizeChannelSettings({
    job: { enabled: false, dailyMax: 5 }, db: { dailyMax: "150" }, github: { dailyMax: "abc" }, comment: { enabled: "yes" },
  });
  assert.equal(settings.job.enabled, false);
  assert.equal(settings.job.dailyMax, null); // an existing channel's saved max is ignored
  assert.equal(settings.db.dailyMax, 100); // clamped
  assert.equal(settings.github.dailyMax, 20); // not a number: the default
  assert.equal(settings.comment.enabled, true);
  assert.equal(issues.length, 3);
});

test("room today: none while off, the max less what is used, no limit without a max", () => {
  assert.equal(channelRoomLeft({ enabled: false, dailyMax: 20 }, 0), 0);
  assert.equal(channelRoomLeft({ enabled: true, dailyMax: 20 }, 18), 2);
  assert.equal(channelRoomLeft({ enabled: true, dailyMax: 20 }, 25), 0);
  assert.equal(channelRoomLeft({ enabled: true, dailyMax: null }, 500), Number.POSITIVE_INFINITY);
  assert.equal(channelRoomLeft(undefined, 0), 0);
});

test("the search looks for job seekers always, career help and events only while their post channel is on", () => {
  const settings = defaultChannelSettings();
  assert.deepEqual(searchedIntents(settings), ["job", "coaching", "event"]);
  settings.coaching_post.enabled = false;
  assert.deepEqual(searchedIntents(settings), ["job", "event"]);
});
