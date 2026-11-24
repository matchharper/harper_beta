/**
 * Where-they-can-work replay (GTM #5, 11/23): the first-mail posting pick (match.server.ts pickAgentPostings, the code
 * the tick runs) and the grader after it (review.server.ts), for people already mailed, twice per person:
 *   BEFORE: without the where-they-can-work rule (match.ts WORK_LOCATION_RULE), as the pick ran before 11/23;
 *   AFTER:  with it.
 * Each is compared with the postings their first mail really carried (gtm_agent_people.postings).
 *
 * NOTHING is written or sent:
 *   - a fetch guard installed before any client exists: a request that is not a read (GET/HEAD/OPTIONS) leaves this
 *     process only to the model APIs or to one of the read-only RPCs below; any other RPC is refused, a table write is
 *     answered locally, Resend, Slack and Gmail are refused. A self-test checks the guard catches test writes on both
 *     admin clients before anything else runs (exit 2 otherwise);
 *   - every model call runs with previewUsage, so llm_logs gets nothing;
 *   - the pick runs with DRY_RUN_SOURCES (role summaries stay in memory);
 *   - people are read through gtmRead (read-only transactions).
 * The output (results.json, report.md, run.log) holds real names and postings: keep it on the machine.
 *
 * Run (from a worktree at this commit, the main checkout's .env.local):
 *   GTM_REPLAY_ENV_FILE=<main checkout>/.env.local GTM_REPLAY_OUT_DIR=<out dir> \
 *     npx tsx --tsconfig scripts/tsconfig.json scripts/gtm-agent/match-location-replay.ts <person id> [<person id> …]
 *   or GTM_REPLAY_IDS_FILE=<file with one gtm_agent_people id per line> instead of the ids.
 * Options (env): GTM_REPLAY_PARALLEL (people at once, default 3), GTM_REPLAY_MAX_USD (no new person after the model
 * spend reaches it, default 6), GTM_REPLAY_SELFTEST=1 (only the guard self-test).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const envFile = process.env.GTM_REPLAY_ENV_FILE || ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);
const OUT = process.env.GTM_REPLAY_OUT_DIR || `./output/match-location-replay/${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(OUT, { recursive: true });
const PARALLEL = Math.max(1, Number(process.env.GTM_REPLAY_PARALLEL || 3));
const MAX_USD = Number(process.env.GTM_REPLAY_MAX_USD || 6);

function log(...parts: unknown[]) {
  const line = `[${new Date().toISOString()}] ${parts.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")}`;
  console.log(line);
  appendFileSync(`${OUT}/run.log`, `${line}\n`);
}

// ---------------------------------------------------------------- write guard (before any module is loaded)
const READ_RPCS = new Set(["search_external_roles_v2", "search_external_roles_filter_first", "set_timeout_and_execute_raw_sql"]);
const WRITE_OK_HOSTS = new Set(["api.openai.com", "openrouter.ai", "api.anthropic.com"]);
const REFUSED_HOSTS = /(^|\.)(resend\.com|slack\.com|gmail\.googleapis\.com|oauth2\.googleapis\.com)$/i;
const blockedCalls: Array<{ at: string; method: string; target: string }> = [];
const realFetch = globalThis.fetch.bind(globalThis);
let guardCalls = 0;

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  guardCalls += 1;
  const url = new URL(requestUrl(input));
  const method = String(init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const target = `${url.hostname}${url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")}`;
  const block = (status: number, body: string | null) => {
    blockedCalls.push({ at: new Date().toISOString(), method, target });
    return new Response(body, { status, headers: body ? { "content-type": "application/json" } : {} });
  };
  if (REFUSED_HOSTS.test(url.hostname)) {
    blockedCalls.push({ at: new Date().toISOString(), method, target });
    throw new Error(`match-location-replay: ${url.hostname} is blocked`);
  }
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return realFetch(input, init);
  if (WRITE_OK_HOSTS.has(url.hostname.toLowerCase())) return realFetch(input, init);
  const rpc = /\/rest\/v1\/rpc\/([^/?]+)/.exec(url.pathname)?.[1] ?? null;
  if (rpc && READ_RPCS.has(rpc)) {
    if (rpc === "set_timeout_and_execute_raw_sql") {
      let sqlText = "";
      try { sqlText = String(JSON.parse(String(init?.body ?? "{}")).sql_query ?? ""); } catch { sqlText = ""; }
      if (!/^\s*(select|with)\b/i.test(sqlText) || /\b(insert|update|delete|truncate|alter|drop|create|grant)\b/i.test(sqlText.replace(/'[^']*'/g, ""))) {
        return block(400, JSON.stringify({ message: "match-location-replay: raw sql is not a read", code: "GTM5" }));
      }
    }
    return realFetch(input, init);
  }
  // A table write: answered as done (nothing leaves this process). Any other RPC or host: refused.
  return rpc || !url.pathname.includes("/rest/v1/")
    ? block(400, JSON.stringify({ message: "match-location-replay: write blocked", code: "GTM5" }))
    : block(201, null);
}) as typeof fetch;

/** A table insert on both admin clients and a write RPC must be answered by the guard; otherwise nothing runs. */
async function selftest(): Promise<boolean> {
  const { getTalentSupabaseAdmin } = await import("@/lib/talentOnboarding/admin");
  const { getSupabaseAdmin } = await import("@/lib/server/candidateAccess");
  type Client = {
    from: (t: string) => { insert: (v: unknown) => Promise<{ error: { code?: string } | null; status: number }> };
    rpc: (n: string, a: unknown) => Promise<{ error: { code?: string } | null }>;
  };
  const before = guardCalls;
  const insert = await (getTalentSupabaseAdmin() as unknown as Client).from("llm_logs").insert({ source: "gtm_location_replay_selftest" });
  const rpc = await (getTalentSupabaseAdmin() as unknown as Client).rpc("save_external_fit_v2", {});
  const other = await (getSupabaseAdmin() as unknown as Client).from("gtm_agent_people").insert({});
  const passed = guardCalls - before === 3 && blockedCalls.length === 3 && insert.status === 201 && !insert.error
    && rpc.error?.code === "GTM5" && other.status === 201 && !other.error;
  log("selftest", { passed, guardCalls: guardCalls - before, insertStatus: insert.status, rpcError: rpc.error, otherStatus: other.status, blockedCalls });
  blockedCalls.length = 0;
  return passed;
}

// ---------------------------------------------------------------- the replay

type PostingLine = { company: string; title: string; location: string | null; grade?: string | null };
type Side = {
  outcome: "mail" | "no_fit" | "not_job_seeking" | "grader_failed" | "error";
  reason: string;
  /** The planner's countries (code, weight, remote only) for each plan step. */
  plans: Array<{ revised: boolean; countries: unknown; found: number; scored: number; fittingCompanies: number }>;
  picked: PostingLine[];
  mailed: PostingLine[];
  costUsd: number;
  error?: string;
};
type PersonResult = {
  id: string; name: string | null; location: string | null; firstMail: PostingLine[];
  before: Side | null; after: Side | null; skipped?: string;
};

function ids(): string[] {
  const fromFile = process.env.GTM_REPLAY_IDS_FILE ? readFileSync(process.env.GTM_REPLAY_IDS_FILE, "utf8").split(/\s+/) : [];
  const all = [...process.argv.slice(2), ...fromFile].map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return [...new Set(all)];
}

async function main() {
  const list = ids();
  if (!(await selftest())) {
    log("SELFTEST FAILED: the write guard did not catch the test writes. Nothing else runs.");
    process.exit(2);
  }
  if (process.env.GTM_REPLAY_SELFTEST) return;
  if (!list.length) {
    log("no person ids (pass them as arguments or GTM_REPLAY_IDS_FILE)");
    process.exit(1);
  }
  const { withLlmUsageContext } = await import("@/lib/llm/usageContext");
  const preview: Parameters<typeof withLlmUsageContext>[0]["previewUsage"] = [];
  await withLlmUsageContext({ requestId: `gtm-location-replay-${randomUUID()}`, previewUsage: preview }, () => replay(list));
  log("done", { modelCallsPreviewed: preview?.length ?? 0, blockedCalls });
}

async function replay(list: string[]) {
  const { readAgentPerson } = await import("@/lib/gtmPlays/agent/store.server");
  const { pickAgentPostings, DRY_RUN_SOURCES } = await import("@/lib/gtmPlays/agent/match.server");
  const { MAX_FITS, MIN_FITS } = await import("@/lib/gtmPlays/agent/match");
  const { reviewAgentPostings } = await import("@/lib/gtmPlays/agent/review.server");
  const { withReviews, postingsToMail } = await import("@/lib/gtmPlays/agent/review");
  const { applicantListCompany } = await import("@/lib/gtmPlays/agent/applicantList");
  type AgentPerson = import("@/lib/gtmPlays/agent/types").AgentPerson;
  type AgentPosting = import("@/lib/gtmPlays/agent/types").AgentPosting;

  const line = (posting: AgentPosting): PostingLine => ({
    company: posting.companyName, title: posting.title, location: posting.location ?? null, grade: posting.review?.grade ?? null,
  });
  let spent = 0;

  // One side: the pick as run.server.ts handleFound runs it (same excluded companies), then the grader.
  const side = async (person: AgentPerson, workLocationRule: boolean): Promise<Side> => {
    let costUsd = 0;
    try {
      const excludeCompanyNames = [person.currentCompany, applicantListCompany(person.source)].filter((name): name is string => Boolean(name));
      const match = await pickAgentPostings(person, { excludeCompanyNames, workLocationRule }, DRY_RUN_SOURCES);
      costUsd += match.costUsd;
      const plans = match.plans.map((step) => ({
        revised: step.revised, countries: (step.plan as { countries?: unknown }).countries ?? null,
        found: step.found, scored: step.scored, fittingCompanies: step.fittingCompanies,
      }));
      const picked = match.postings.map(line);
      if (match.notJobSeeking) return { outcome: "not_job_seeking", reason: match.reason, plans, picked, mailed: [], costUsd };
      if (match.postings.length < MIN_FITS) return { outcome: "no_fit", reason: match.reason, plans, picked, mailed: [], costUsd };
      const review = await reviewAgentPostings({ person, postings: match.postings, texts: match.postingTexts });
      costUsd += review.costUsd;
      if (review.failed) return { outcome: "grader_failed", reason: review.failed, plans, picked, mailed: [], costUsd };
      const graded = withReviews(match.postings, review.reviews);
      const { kept } = postingsToMail(graded, MAX_FITS);
      const gradedLines = graded.map(line);
      if (kept.length < MIN_FITS) {
        return { outcome: "no_fit", reason: "grader kept no posting", plans, picked: gradedLines, mailed: [], costUsd };
      }
      return { outcome: "mail", reason: match.reason, plans, picked: gradedLines, mailed: kept.map(line), costUsd };
    } catch (error) {
      return { outcome: "error", reason: "", plans: [], picked: [], mailed: [], costUsd, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const results: PersonResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const id = list[next++];
      if (spent >= MAX_USD) {
        results.push({ id, name: null, location: null, firstMail: [], before: null, after: null, skipped: `spend reached $${MAX_USD}` });
        continue;
      }
      const person = await readAgentPerson(id);
      if (!person) {
        results.push({ id, name: null, location: null, firstMail: [], before: null, after: null, skipped: "no such person" });
        continue;
      }
      log("person start", { id, location: person.location });
      const [before, after] = await Promise.all([side(person, false), side(person, true)]);
      spent += before.costUsd + after.costUsd;
      results.push({ id, name: person.name ?? null, location: person.location ?? null, firstMail: person.postings.map(line), before, after });
      log("person done", { id, before: before.outcome, after: after.outcome, usd: Number((before.costUsd + after.costUsd).toFixed(4)), spent: Number(spent.toFixed(4)) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));

  const order = new Map(list.map((id, index) => [id, index]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}/report.md`, report(results, spent));
  log("written", { out: OUT, people: results.length, spentUsd: Number(spent.toFixed(4)) });
}

// ---------------------------------------------------------------- report

const cell = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const postings = (lines: PostingLine[]) => lines.length
  ? lines.map((posting) => `${posting.company} · ${posting.title}${posting.location ? ` (${posting.location})` : ""}${posting.grade ? ` [${posting.grade}]` : ""}`).join("<br>")
  : "—";
const countries = (side: Side | null) => side?.plans.map((plan) => `${plan.revised ? "revised " : ""}${JSON.stringify(plan.countries)}`).join("<br>") || "—";
const sideCell = (side: Side | null) => {
  if (!side) return "—";
  if (side.outcome === "mail") return `**mail**<br>${postings(side.mailed)}`;
  return `**${side.outcome}** ${cell(side.error ?? side.reason)}`;
};

function report(results: PersonResult[], spent: number): string {
  const ran = results.filter((result) => result.before && result.after);
  const count = (pick: (result: PersonResult) => boolean) => ran.filter(pick).length;
  const lines = [
    "# Where-they-can-work replay (first-mail pick + grader, nothing written or sent)",
    "",
    `People: ${results.length} (ran ${ran.length}) · model spend $${spent.toFixed(2)}`,
    "",
    `- BEFORE (no rule) gets a mail: ${count((result) => result.before?.outcome === "mail")}`,
    `- AFTER (rule) gets a mail: ${count((result) => result.after?.outcome === "mail")}`,
    `- mail before, no mail after: ${count((result) => result.before?.outcome === "mail" && result.after?.outcome !== "mail")}`,
    `- no mail before, mail after: ${count((result) => result.before?.outcome !== "mail" && result.after?.outcome === "mail")}`,
    "",
    "| Person | Location | First mail (sent) | BEFORE | AFTER | Plan countries BEFORE | Plan countries AFTER | $ |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((result) => [
      `${cell(result.name ?? "")} \`${result.id.slice(0, 8)}\``,
      cell(result.location ?? "—"),
      postings(result.firstMail),
      result.skipped ? `skipped: ${result.skipped}` : sideCell(result.before),
      result.skipped ? "" : sideCell(result.after),
      countries(result.before),
      countries(result.after),
      ((result.before?.costUsd ?? 0) + (result.after?.costUsd ?? 0)).toFixed(3),
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "Check each AFTER mail by hand: every posting outside where they are based must say it hires from their country or region.",
    "",
  ];
  return lines.join("\n");
}

main().catch((error) => {
  log("FAILED", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
