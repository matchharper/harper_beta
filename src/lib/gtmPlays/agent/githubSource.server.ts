import "server-only";

import { gtmRead } from "../db.server";
import { gtmStructuredCall } from "../llm.server";
import { measured } from "./compose.server";
import { runDemand } from "./demand.server";
import {
  GITHUB_ACTIVE_DAYS, GITHUB_JUDGE_SCHEMA, GITHUB_SOURCE, activeWithin, byGithubOrder, githubCompany, githubFoundNote, githubHeadline,
  githubJudgePrompt, githubMailAddress, githubPersonKeys, githubPersonName, githubPlaceOf, githubPlaces, githubProfileText,
  githubProfileUrl, githubQueries, githubSignal, githubSiteUrl, githubStopReason, latestActivity, latestEventAt, readGithubJudge,
  readGithubProfile, readGithubRepos, searchLogins, type GithubProfile, type GithubQuery, type GithubRepo, type GithubSignal,
} from "./githubSource";
import { cleanEmail, kstClock } from "./people";
import { personMemoryKeys } from "./signals";
import { newWorkCapUsd } from "./spend";
import { mayAgentSpend, recordAgentSpend } from "./spend.server";
import { addAgentRunCounts, insertAgentPeople, type NewAgentPerson } from "./store.server";
import type { AgentSettings } from "./types";

const GITHUB_API = "https://api.github.com";
const TOKEN_ENV = "GTM_GITHUB_TOKEN";
/** Searches per call (the search API allows 30 a minute, the code search 10; a tick runs every few minutes). */
const SEARCHES_PER_PULL = 3;
const RESULTS_PER_SEARCH = 30;
/** People read per call: each takes up to four calls of the 5,000 an hour (profile, repos, events, README). */
const PROFILES_PER_PULL = 24;
const PARALLEL = 4;
/** A call ends by then, with what it has; one request at most REQUEST_TIMEOUT_MS. */
const PULL_MS = 45_000;
const REQUEST_TIMEOUT_MS = 10_000;
/** Below this many calls left in the hour (or searches in the minute), the call stops early. */
const CORE_RESERVE = 100;
const SEARCH_RESERVE = 1;
/** The judge reads at most this many weak signals per call, in one model call. */
const JUDGE_MAX = 10;
const JUDGE_ESTIMATE_USD = 0.01;
const JUDGE_TIMEOUT_MS = 40_000;
/** Run counts: the day's queries run so far (the run is the day's: it starts at 0 each day). */
const QUERIES_COUNT = "github_queries";
const AGENT = "agent";

let noTokenNoted = false;

type GithubClient = {
  get: (path: string, options?: { params?: Record<string, string | number>; raw?: boolean }) => Promise<unknown>;
  stopped: () => string | null;
  calls: () => number;
};

/**
 * GET on the REST API with the token. null for a missing page (404), an empty repo (409) or a failed request. A used-up
 * rate limit, a secondary limit or a bad token stops the client (stopped()): every later call gives null, so the pull
 * ends with what it has. It also stops before a limit runs out (CORE_RESERVE, SEARCH_RESERVE) and at the deadline.
 */
function githubClient(token: string, deadlineAt: number): GithubClient {
  let stopped: string | null = null;
  let calls = 0;
  return {
    stopped: () => stopped,
    calls: () => calls,
    async get(path, options = {}) {
      if (stopped) return null;
      if (Date.now() > deadlineAt) { stopped = "deadline"; return null; }
      const url = new URL(path, GITHUB_API);
      for (const [key, value] of Object.entries(options.params ?? {})) url.searchParams.set(key, String(value));
      calls += 1;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: options.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gtm-agent",
          },
          signal: AbortSignal.timeout(Math.max(1_000, Math.min(REQUEST_TIMEOUT_MS, deadlineAt - Date.now()))),
          cache: "no-store",
        });
      } catch (error) {
        console.warn("[gtm-agent:github] request failed", url.pathname, error instanceof Error ? error.message : String(error));
        return null;
      }
      const remaining = response.headers.get("x-ratelimit-remaining");
      const resource = response.headers.get("x-ratelimit-resource") ?? "";
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        const reason = githubStopReason(response.status, { remaining, retryAfter: response.headers.get("retry-after") }, message);
        if (reason) {
          stopped = reason;
          console.warn("[gtm-agent:github] stopped", reason, response.status, resource, response.headers.get("x-ratelimit-reset") ?? "");
        }
        return null;
      }
      const left = remaining === null ? Number.NaN : Number(remaining);
      if (Number.isFinite(left) && left <= (resource.includes("search") ? SEARCH_RESERVE : CORE_RESERVE)) stopped = "rate_limit";
      try {
        return options.raw ? await response.text() : await response.json();
      } catch {
        return null;
      }
    },
  };
}

/** How many of the day's queries this run has run (its counts). */
async function queriesRun(runId: string): Promise<number> {
  const [row] = await gtmRead((sql) => sql<Array<{ n: number | null }>>`
    select coalesce((counts ->> ${QUERIES_COUNT})::numeric, 0)::int as n from public.gtm_agent_runs where id = ${runId}::uuid
  `);
  return Number(row?.n ?? 0);
}

/**
 * Every key the agent already has among these (real rows: by key, by an address found later, or by the GitHub profile
 * a row keyed by its address links to).
 */
async function knownKeys(keys: readonly string[], emails: readonly string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const profiles = keys.filter((key) => key.startsWith("url:github.com/")).map((key) => `https://${key.slice("url:".length)}`);
  const rows = await gtmRead((sql) => sql<Array<{ person_key: string; email: string | null; profile_url: string | null; contact_url: string | null }>>`
    select person_key, email, profile_url, contact_url from public.gtm_agent_people
    where not is_test and (person_key = any(${[...keys]}::text[]) or lower(email) = any(${[...emails]}::text[])
      or rtrim(lower(profile_url), '/') = any(${profiles}::text[]) or rtrim(lower(contact_url), '/') = any(${profiles}::text[]))
  `);
  const known = new Set<string>();
  for (const row of rows) {
    for (const key of personMemoryKeys({ personKey: row.person_key, email: row.email, profileUrl: row.profile_url, contactUrl: row.contact_url })) known.add(key);
    const email = cleanEmail(row.email);
    if (email) known.add(`email:${email}`);
  }
  return known;
}

/** Runs `work` over `items`, PARALLEL at a time, in order. */
async function inTurn<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await work(items[index]);
    }
  }));
  return out;
}

type Found = { login: string; query: GithubQuery };
type Reachable = Found & { profile: GithubProfile; email: string | null; contactUrl: string | null; personKey: string; keys: string[] };
type Candidate = Reachable & { repos: GithubRepo[]; readme: string | null; activeAt: string; signal: GithubSignal | null };

/**
 * The GitHub channel (Shaun 11/23, agent/githubSource.ts): developers whose GitHub profile is marked "Available for
 * hire", or whose bio or profile README says they are looking, and who were active in public within the last
 * GITHUB_ACTIVE_DAYS; at the places Harper has postings. Each call runs the next SEARCHES_PER_PULL of the day's
 * queries (their count is kept on the run, so the day goes through them once), reads up to PROFILES_PER_PULL new
 * people, lets the model judge the unclear words, and puts in at most `room` (the channel's daily max less its mails
 * today and its people in work), clearest signal and latest activity first.
 *
 * Only the public profile address (never GitHub's noreply), when the agent may mail it; without one, a person with
 * their own site still goes in (the email lookup starts from it), anyone else is passed over. Without the token the
 * channel does nothing (one note in the log). A used-up rate limit ends the call early with what it has. Returns how
 * many it put in; errors are logged and give 0.
 */
export async function pullGithubPeople(args: { runId: string; settings: AgentSettings; configId: string | null; room: number }): Promise<number> {
  const room = Math.max(0, Math.floor(args.room));
  if (!room) return 0;
  const token = process.env[TOKEN_ENV]?.trim();
  if (!token) {
    if (!noTokenNoted) console.info(`[gtm-agent:github] ${TOKEN_ENV} is not set: the GitHub channel finds no one`);
    noTokenNoted = true;
    return 0;
  }
  const now = new Date();
  const log: Record<string, number | string> = {};
  try {
    const done = await queriesRun(args.runId);
    const places = githubPlaces(await runDemand(args.runId, kstClock(now).day));
    const queries = githubQueries(places).slice(done, done + SEARCHES_PER_PULL);
    if (!queries.length) return 0;
    // Counted before they run: a call cut off at the tick's end does not run them again.
    await addAgentRunCounts(args.runId, { [QUERIES_COUNT]: queries.length });
    const client = githubClient(token, Date.now() + PULL_MS);
    const activeDays = Math.max(1, Math.min(GITHUB_ACTIVE_DAYS, Number(args.settings.signals.tuning.maxAgeDays) || GITHUB_ACTIVE_DAYS));

    // 1. The searches: who they found, each with the query that found them first.
    const found: Found[] = [];
    for (const query of queries) {
      const body = await client.get(query.kind === "users" ? "/search/users" : "/search/code", {
        params: query.kind === "users" ? { q: query.q, per_page: RESULTS_PER_SEARCH } : { q: query.q, per_page: RESULTS_PER_SEARCH, sort: "indexed", order: "desc" },
      });
      for (const login of searchLogins(query.kind, body)) {
        if (!found.some((item) => item.login.toLowerCase() === login.toLowerCase())) found.push({ login, query });
      }
    }
    log.searched = queries.length;
    log.found = found.length;

    // 2. Not someone the agent has (by their GitHub profile) before reading anything.
    const byUrl = await knownKeys(found.map((item) => githubPersonKeys({ login: item.login, email: null, contactUrl: null }).personKey), []);
    const fresh = found.filter((item) => !byUrl.has(githubPersonKeys({ login: item.login, email: null, contactUrl: null }).personKey)).slice(0, PROFILES_PER_PULL);
    log.known = found.length - fresh.length;

    // 3. Their profiles: a person (not an organization) the agent can reach, by an address it may mail or their own site.
    const reachable = (await inTurn(fresh, async (item): Promise<Reachable | null> => {
      const profile = readGithubProfile(await client.get(`/users/${encodeURIComponent(item.login)}`));
      if (!profile || profile.type !== "User") return null;
      const profileUrl = githubProfileUrl(profile.login);
      const contactUrl = githubSiteUrl(profile.blog);
      const email = githubMailAddress(profile.email, { profileUrl, signalUrl: profileUrl, contactUrl });
      if (!email && !contactUrl) return null;
      return { ...item, profile, email, contactUrl, ...githubPersonKeys({ login: profile.login, email, contactUrl }) };
    })).filter((item): item is Reachable => Boolean(item));
    log.reachable = reachable.length;
    const known = await knownKeys(reachable.flatMap((item) => item.keys), reachable.flatMap((item) => (item.email ? [item.email] : [])));
    const unknown = reachable.filter((item) => !item.keys.some((key) => known.has(key)));

    // 4. Active lately (a push to their own repos, else any public event), their README, and what they say.
    const candidates = (await inTurn(unknown, async (item): Promise<Candidate | null> => {
      const login = encodeURIComponent(item.profile.login);
      const repos = readGithubRepos(await client.get(`/users/${login}/repos`, { params: { type: "owner", sort: "pushed", per_page: 30 } }));
      let activeAt = latestActivity(null, repos);
      if (!activeWithin(activeAt, now, activeDays)) {
        activeAt = latestActivity(latestEventAt(await client.get(`/users/${login}/events/public`, { params: { per_page: 30 } })), repos);
      }
      if (!activeAt || !activeWithin(activeAt, now, activeDays)) return null;
      const readmeBody = await client.get(`/repos/${login}/${login}/readme`, { raw: true });
      const readme = typeof readmeBody === "string" ? readmeBody.slice(0, 20_000) : null;
      if (!githubPlaceOf(item.profile, readme, places)) return null;
      return { ...item, repos, readme, activeAt, signal: githubSignal(item.profile, readme) };
    })).filter((item): item is Candidate => Boolean(item?.signal));
    log.active_with_signal = candidates.length;

    // 5. The model reads the unclear words (one call, the day's money allowing; otherwise they wait for another day).
    const weak = candidates.filter((item) => item.signal?.strength === "weak").slice(0, JUDGE_MAX);
    const judged = new Map<string, string>();
    if (weak.length && await mayAgentSpend(newWorkCapUsd(args.settings.dailyCostUsd), JUDGE_ESTIMATE_USD)) {
      const ids = weak.map((_, index) => `p${index}`);
      const prompt = githubJudgePrompt(weak.map((item, index) => ({
        id: ids[index], bio: item.profile.bio, hireable: item.profile.hireable === true, readme: item.readme,
      })));
      try {
        const { value, costUsd } = await measured("github_signal", () => gtmStructuredCall<unknown>({
          label: "gtm-agent:github-signal", schemaName: "gtm_agent_github_signal", schema: GITHUB_JUDGE_SCHEMA as unknown as Record<string, unknown>,
          system: prompt.system, user: prompt.user, maxTokens: 1_500, signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
        }));
        await recordAgentSpend({ step: "search", usd: costUsd, runId: args.runId, source: GITHUB_SOURCE, configId: args.configId, isTest: false });
        for (const [id, line] of readGithubJudge(value, ids)) judged.set(weak[ids.indexOf(id)].login, line);
      } catch (error) {
        console.warn("[gtm-agent:github] judge failed", error instanceof Error ? error.message : String(error));
      }
    }
    log.judged = weak.length;
    log.judged_yes = judged.size;
    const seeking = candidates.flatMap((item): Candidate[] => {
      if (item.signal?.strength === "strong") return [item];
      const line = judged.get(item.login);
      return line === undefined || !item.signal ? [] : [{ ...item, signal: { ...item.signal, strength: "strong", text: line || item.signal.text } }];
    }).sort((a, b) => byGithubOrder({ strength: a.signal!.strength, activeAt: a.activeAt }, { strength: b.signal!.strength, activeAt: b.activeAt }));

    // 6. In, at most the room (the same address twice only once).
    const emails = new Set<string>();
    const people: NewAgentPerson[] = [];
    for (const item of seeking) {
      if (people.length >= room) break;
      if (item.email && emails.has(item.email)) continue;
      if (item.email) emails.add(item.email);
      const signal = item.signal!;
      const profileUrl = githubProfileUrl(item.profile.login);
      people.push({
        runId: args.runId, source: GITHUB_SOURCE, method: "open_to_work_profile", settingsVersion: args.settings.version, configId: args.configId,
        personKey: item.personKey, email: item.email, emailSource: item.email ? "post" : null, isTest: false,
        contactUrl: item.contactUrl, searchGroup: item.query.group, searchQuery: item.query.q,
        name: githubPersonName(item.profile), headline: githubHeadline(item.profile), location: item.profile.location?.slice(0, 200) ?? null,
        currentCompany: githubCompany(item.profile), profileUrl,
        profileText: githubProfileText(item.profile, item.repos, item.readme),
        signalText: signal.text.slice(0, 500), signalUrl: signal.from === "readme" ? `${profileUrl}/${item.profile.login.toLowerCase()}` : profileUrl,
        signalAt: item.activeAt, intent: "job", foundAs: "author", foundNote: githubFoundNote(signal.from),
      });
    }
    const inserted = people.length ? await insertAgentPeople(people, AGENT) : [];
    log.added = inserted.length;
    log.calls = client.calls();
    if (client.stopped()) log.stopped = client.stopped() ?? "";
    console.info("[gtm-agent:github]", JSON.stringify(log));
    return inserted.length;
  } catch (error) {
    // Never stops the tick: the next call goes on with the next queries.
    console.error("[gtm-agent:github] failed", JSON.stringify(log), error instanceof Error ? error.message : String(error));
    return 0;
  }
}
