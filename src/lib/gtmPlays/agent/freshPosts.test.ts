import assert from "node:assert/strict";
import test from "node:test";
import { budgetOptionOf, budgetOptions } from "./budget";
import {
  FRESH_POST_COST_USD, FreshPostSearchError, freshPostAuthor, freshPostCost, freshPostSearchUrl, postedLimit, readFreshPosts,
} from "./freshPosts";
import { personKey } from "./people";
import {
  GOAL_SEARCHES, LINKEDIN_FRESH_SEARCH, candidateSearchPlace, goalSearchesOn, identifyPerson, judgeBatch, planPrompt, resultFitsStage,
  searchWindows, signalWindows,
} from "./signals";
import { DEFAULT_FRESH_POSTS, normalizeSignalSettings } from "./tuning";

const post = (over: Record<string, unknown> = {}) => ({
  linkedinUrl: "https://www.linkedin.com/posts/jane-doe-1a2b_opentowork-backend-activity-7399000000000000000-AbCd",
  content: "After 6 years as a backend engineer I'm looking for my next role. Open to remote. jane@example.dev",
  author: {
    publicIdentifier: "jane-doe-1a2b", linkedinUrl: "https://www.linkedin.com/in/jane-doe-1a2b?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAB",
    name: "Jane Doe", info: "Backend Engineer | Go, Kotlin", type: "profile",
  },
  postedAt: { date: "2026-11-27T01:20:00.000Z", timestamp: 1795743600000 },
  engagement: { comments: 4 },
  ...over,
});

test("the call: the tool with its declared parameters, newest first, the window as LinkedIn's posted-within filter", () => {
  const url = new URL(freshPostSearchUrl("https://treg.to/call/", "looking for my next role backend", 7));
  assert.equal(url.origin + url.pathname, "https://treg.to/call/harvestapi.linkedin.post.search");
  assert.deepEqual(Object.fromEntries(url.searchParams), { search: "looking for my next role backend", sortBy: "date", postedLimit: "week", page: "1" });
  assert.equal(postedLimit(1), "24h");
  assert.equal(postedLimit(7), "week");
  assert.equal(postedLimit(30), "month");
});

test("posts: the author's profile in the web search's form, the post text with whose it is, company pages left out", () => {
  const company = post({ author: { name: "Acme", linkedinUrl: "https://www.linkedin.com/company/acme/", type: "company" } });
  const noText = post({ content: "" });
  const [first, ...rest] = readFreshPosts({ elements: [post(), company, noText] }, 20);
  assert.equal(rest.length, 0);
  assert.equal(first.author, "https://linkedin.com/in/jane-doe-1a2b");
  assert.equal(first.publishedDate, "2026-11-27T01:20:00.000Z");
  assert.equal(first.title, "Jane Doe · Backend Engineer | Go, Kotlin");
  assert.match(first.text, /^Author: Jane Doe, Backend Engineer \| Go, Kotlin \(https:\/\/linkedin\.com\/in\/jane-doe-1a2b\)\n/);
  assert.match(first.text, /looking for my next role/);
  // At most `limit`, in LinkedIn's order (newest first).
  assert.equal(readFreshPosts({ elements: [post(), post(), post()] }, 2).length, 2);
  // An author from the handle alone; a company or a missing profile is nobody's.
  assert.equal(freshPostAuthor({ publicIdentifier: "minsu-kim", type: "profile" }), "https://linkedin.com/in/minsu-kim");
  assert.equal(freshPostAuthor({ universalName: "acme", type: "company" }), null);
  assert.equal(freshPostAuthor({ name: "No Profile" }), null);
});

test("a post without its own link gets the activity's feed page; a failed answer throws; no posts is an empty list", () => {
  const [item] = readFreshPosts({ elements: [post({ linkedinUrl: null, id: "7399000000000000001" })] }, 5);
  assert.equal(item.url, "https://www.linkedin.com/feed/update/urn:li:activity:7399000000000000001/");
  assert.throws(() => readFreshPosts({ status: "error", error: "rate limited" }, 5), FreshPostSearchError);
  assert.deepEqual(readFreshPosts({ elements: [] }, 5), []);
  assert.equal(freshPostCost("2000"), 0.002);
  assert.equal(freshPostCost(null), FRESH_POST_COST_USD);
});

test("the same person as the web search's: one key whether found by Exa or by treg, also from a feed page", () => {
  const exaKey = identifyPerson({ url: "https://kr.linkedin.com/in/jane-doe-1a2b/", text: "Open to work", email: null, contactUrl: null }).key;
  const [viaPost] = readFreshPosts({ elements: [post()] }, 1);
  const fromPost = identifyPerson({ url: viaPost.url, text: viaPost.text, email: null, contactUrl: null, author: viaPost.author });
  const [viaFeed] = readFreshPosts({ elements: [post({ linkedinUrl: null, id: "7399000000000000001" })] }, 1);
  const fromFeed = identifyPerson({ url: viaFeed.url, text: viaFeed.text, email: null, contactUrl: null, author: viaFeed.author });
  assert.ok(exaKey);
  assert.equal(fromPost.key, exaKey);
  assert.equal(fromFeed.key, exaKey);
  assert.equal(fromFeed.profileUrl, "https://linkedin.com/in/jane-doe-1a2b");
  assert.equal(personKey({ profileUrl: fromFeed.profileUrl }), personKey({ profileUrl: "https://www.linkedin.com/in/jane-doe-1a2b?miniProfileUrn=x" }));
  // The URL's own author wins; a given author that is no LinkedIn profile is ignored.
  const named = identifyPerson({ url: viaPost.url, text: "", email: null, contactUrl: null, author: "https://linkedin.com/in/someone-else" });
  assert.equal(named.profileUrl, "https://linkedin.com/in/jane-doe-1a2b");
  const ignored = identifyPerson({ url: viaFeed.url, text: "", email: null, contactUrl: null, author: "https://x.com/jane" });
  assert.equal(ignored.profileUrl, null);
  // The judge batch carries the author through.
  assert.equal(judgeBatch([viaFeed], 1_500)[0].author, viaFeed.author);
});

test("the search: on with the 구직 글 channel only while its switch and the key are, a LinkedIn search on /ops, posts only", () => {
  const fresh = GOAL_SEARCHES.find((item) => item.id === LINKEDIN_FRESH_SEARCH)!;
  assert.equal(fresh.engine, "treg");
  assert.equal(fresh.aim, "job");
  assert.equal(DEFAULT_FRESH_POSTS, true);
  assert.equal(normalizeSignalSettings({}).settings.freshPosts, true);
  assert.equal(normalizeSignalSettings({ freshPosts: false }).settings.freshPosts, false);
  const channels = { job: { enabled: true }, coaching_post: { enabled: false } };
  assert.deepEqual(goalSearchesOn(channels, { vendorSearch: true }), [LINKEDIN_FRESH_SEARCH]);
  assert.deepEqual(goalSearchesOn(channels, { vendorSearch: false }), []);
  assert.deepEqual(goalSearchesOn({ job: { enabled: false } }, { vendorSearch: true }), []);
  assert.deepEqual(goalSearchesOn({ coaching_post: { enabled: true } }), ["linkedin_coaching"]);
  assert.equal(candidateSearchPlace(LINKEDIN_FRESH_SEARCH), "linkedin");
  assert.ok(resultFitsStage("https://www.linkedin.com/feed/update/urn:li:activity:7399000000000000001/", LINKEDIN_FRESH_SEARCH, "signal"));
  assert.ok(!resultFitsStage("https://www.linkedin.com/in/jane-doe-1a2b", LINKEDIN_FRESH_SEARCH, "signal"));
  assert.deepEqual(searchWindows(LINKEDIN_FRESH_SEARCH, 30), [{ label: "0-7d", newestDays: 0, oldestDays: 7 }]);
  assert.deepEqual(searchWindows(LINKEDIN_FRESH_SEARCH, 3), [{ label: "0-3d", newestDays: 0, oldestDays: 3 }]);
  assert.deepEqual(searchWindows("linkedin", 30), signalWindows(30));
  const options = budgetOptions({ turnedOn: ["linkedin"], layoffSearch: false, goalSearches: [LINKEDIN_FRESH_SEARCH] });
  assert.ok(options.some((option) => option.id === LINKEDIN_FRESH_SEARCH && option.search === LINKEDIN_FRESH_SEARCH));
});

test("the plan asks for LinkedIn keyword phrases, the web search's plan stays as it was", () => {
  const args = { previous: null, yields: [], keptSamples: [], rejectedSamples: [], budgetLeftUsd: 0.5 };
  const fresh = planPrompt({ ...args, source: LINKEDIN_FRESH_SEARCH }).system;
  const web = planPrompt({ ...args, source: "linkedin" }).system;
  assert.match(fresh, /LinkedIn's own keyword search, newest posts first/);
  assert.match(fresh, /keyword phrases \(2 to 6 words\)/);
  assert.match(fresh, /last 7 days \(window 0-7d\)/);
  assert.doesNotMatch(fresh, /Exa neural search/);
  assert.match(web, /Exa neural search/);
  assert.doesNotMatch(web, /keyword phrases/);
});

test("the day's split: a seeker counts for 링크드인 최신 글 only when the web search did not log the same query", () => {
  const person = { source: "linkedin", method: "signal_post", searchQuery: "looking for my next role backend", intent: "job", hasFit: true };
  const searched = new Set(["linkedin", LINKEDIN_FRESH_SEARCH]);
  const own = new Map([["looking for my next role backend", [LINKEDIN_FRESH_SEARCH]]]);
  const shared = new Map([["looking for my next role backend", ["linkedin", LINKEDIN_FRESH_SEARCH]]]);
  const webOnly = new Map([["looking for my next role backend", ["linkedin"]]]);
  assert.equal(budgetOptionOf(person, searched, own), LINKEDIN_FRESH_SEARCH);
  assert.equal(budgetOptionOf(person, searched, shared), "linkedin");
  assert.equal(budgetOptionOf(person, searched, webOnly), "linkedin");
  // The career-help search keeps its people as before.
  const coaching = { ...person, intent: "coaching" };
  const mixed = new Map([["looking for my next role backend", ["linkedin", "linkedin_coaching"]]]);
  assert.equal(budgetOptionOf(coaching, new Set(["linkedin", "linkedin_coaching"]), mixed), "linkedin_coaching");
});
