/**
 * #5 사람 찾기 (pilot 2·3): finding people who say they are looking for a job, from recent LinkedIn profiles and
 * posts (#OpenToWork, "구직 중") and Threads posts. Pure: the prompts, schemas and URL rules the search loop
 * (signals.server.ts) uses, so tests can read them.
 *
 * The loop follows the company-side external sourcing agent (harper_worker opp/external_sourcing): plan first, start
 * broad, judge every result, look at what each query family yields, and revise the plan (each revision kept with
 * its reason) inside a hard budget.
 */
import { cleanProfileUrl } from "./people";

export type SignalSource = "opentowork" | "threads";

/** One search the plan asks for. */
export type SignalQuery = { query: string; group: string; target: "linkedin_profile" | "linkedin_post" | "threads_post" };

export type SignalPlan = { plan: string; reason: string | null; queries: SignalQuery[] };

/** What the judge says about one search result. */
export type SignalJudgement = {
  id: string;
  keep: boolean;
  kind: "seeking_individual" | "recruiter" | "coach_or_influencer" | "company_or_school" | "not_seeking" | "not_korea" | "not_tech" | "unclear";
  name: string;
  headline: string;
  location: string;
  currentCompany: string;
  email: string;
  signal: string;
  language: "ko" | "en";
  score: number;
};

/** The kind of page a result is, from its URL alone. */
export function resultKind(url: string): "linkedin_profile" | "linkedin_post" | "threads_post" | "threads_profile" | "other" {
  const path = url.trim().toLowerCase().replace(/^https?:\/\/([a-z]{2,3}\.)?(www\.)?/, "").split(/[?#]/)[0];
  if (/^linkedin\.com\/in\/[^/]+/.test(path)) return "linkedin_profile";
  if (/^linkedin\.com\/(posts|feed\/update)\//.test(path)) return "linkedin_post";
  if (/^threads\.(net|com)\/@[^/]+\/post\//.test(path)) return "threads_post";
  if (/^threads\.(net|com)\/@[^/]+\/?$/.test(path)) return "threads_profile";
  return "other";
}

/**
 * The page that stands for the person: a LinkedIn profile as is; a LinkedIn post's author profile when the post
 * URL carries the author's handle (linkedin.com/posts/<handle>_...); a Threads post's account page.
 */
export function authorProfileUrl(url: string): string | null {
  const clean = url.trim().replace(/[?#].*$/, "");
  const kind = resultKind(clean);
  if (kind === "linkedin_profile") return cleanProfileUrl(clean) ? `https://${cleanProfileUrl(clean)}` : null;
  const post = clean.match(/linkedin\.com\/posts\/([a-z0-9-]+?)_/i);
  if (kind === "linkedin_post" && post) return `https://linkedin.com/in/${post[1].toLowerCase()}`;
  const thread = clean.match(/threads\.(?:net|com)\/@([^/]+)/i);
  if ((kind === "threads_post" || kind === "threads_profile") && thread) return `https://threads.net/@${thread[1].toLowerCase()}`;
  return null;
}

/** Where each target searches (Exa include_domains). */
export const TARGET_DOMAINS: Record<SignalQuery["target"], string[]> = {
  linkedin_profile: ["linkedin.com"],
  linkedin_post: ["linkedin.com"],
  threads_post: ["threads.net", "threads.com"],
};

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plan", "reason", "queries"],
  properties: {
    plan: { type: "string" },
    reason: { type: ["string", "null"] },
    queries: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query", "group", "target"],
        properties: {
          query: { type: "string" },
          group: { type: "string" },
          target: { type: "string", enum: ["linkedin_profile", "linkedin_post", "threads_post"] },
        },
      },
    },
  },
} as const;

export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "keep", "kind", "name", "headline", "location", "currentCompany", "email", "signal", "language", "score"],
        properties: {
          id: { type: "string" },
          keep: { type: "boolean" },
          kind: { type: "string", enum: ["seeking_individual", "recruiter", "coach_or_influencer", "company_or_school", "not_seeking", "not_korea", "not_tech", "unclear"] },
          name: { type: "string" },
          headline: { type: "string" },
          location: { type: "string" },
          currentCompany: { type: "string" },
          email: { type: "string" },
          signal: { type: "string" },
          language: { type: "string", enum: ["ko", "en"] },
          score: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const;

const SOURCE_GOAL: Record<SignalSource, string> = {
  opentowork: "LinkedIn: people working in Korea in software, data, product or design who say they are looking for a job: a profile headline or about with 'Open to work', 'Job seeking', '구직 중', '이직 준비 중', or a post announcing it (#OpenToWork, 새로운 기회를 찾고 있습니다). Profiles first (they carry the signal in the headline), then posts.",
  threads: "Threads: posts in which a person working in Korea in software, data, product or design says they are looking for a job (구직 중, 이직 준비, 퇴사하고 다음 회사 찾는 중). Many Threads accounts are career coaches or influencers; they are not targets.",
};

/** The first plan, or a revision after looking at what each query family yielded. */
export function planPrompt(args: {
  source: SignalSource;
  previous: SignalPlan | null;
  yields: Array<{ group: string; query: string; results: number; kept: number }>;
  keptSamples: string[];
  rejectedSamples: string[];
  budgetLeftUsd: number;
}) {
  const system = [
    "You plan web searches (Exa neural search) that find individual people who are currently looking for a job, for Harper, a Korean career agent.",
    `Goal: ${SOURCE_GOAL[args.source]}`,
    "Write short natural-language queries that read like the page you want to find (a profile headline, a post's first line), in Korean or English. Each query has a group label (its family) and a target: linkedin_profile, linkedin_post or threads_post.",
    "Start broad (role families: backend, frontend, mobile, data/ML, product, design), then narrow toward what yields kept people. Never name a specific person.",
    "On a revision: drop families that yield few kept people, add families like the kept ones, and say why in reason. If everything yields nothing, return no queries.",
    "Return at most 6 queries per round.",
  ].join("\n");
  const user = args.previous
    ? [
      `Previous plan: ${args.previous.plan}`,
      "What each query yielded (results / kept):",
      ...args.yields.map((item) => `- [${item.group}] ${item.query}: ${item.results} / ${item.kept}`),
      args.keptSamples.length ? `Kept examples:\n${args.keptSamples.join("\n")}` : "Kept examples: none",
      args.rejectedSamples.length ? `Rejected examples:\n${args.rejectedSamples.join("\n")}` : "",
      `Budget left: $${args.budgetLeftUsd.toFixed(2)} (a search costs about $0.01).`,
      "Revise the plan for the next round.",
    ].filter(Boolean).join("\n")
    : `Budget: $${args.budgetLeftUsd.toFixed(2)} (a search costs about $0.01). Write the first plan.`;
  return { system, user };
}

/** Judging one batch of results. */
export function judgePrompt(results: Array<{ id: string; url: string; publishedDate: string | null; text: string }>) {
  const system = [
    "You read search results (LinkedIn profiles and posts, Threads posts) and decide which are individual people currently looking for a job whom Harper may contact about roles in Korea.",
    "keep only when ALL hold: it is one individual's own page or post (not a recruiter, a headhunter, a career coach or influencer, a company, a school or a bootcamp); the person works or wants to work in Korea (location, language or companies); the role family is software, data/ML, product or design; and the page itself says they are looking (open to work, job seeking, 구직 중, 이직 준비, 새로운 기회, recently left and looking).",
    "Never guess: missing information is not a fact. Do not infer nationality, age, gender or other protected traits. Do not keep someone only because they are a good engineer.",
    "name, headline, location, currentCompany: as written on the page (empty when not there). email: only an address written on the page by the person, else empty. signal: a short quote or paraphrase of the sentence that shows they are looking (in the page's language). language: the language to write to them in (ko when the page is mostly Korean, else en). score: 0-100 how clear and recent the job-seeking signal is.",
  ].join("\n");
  const user = results.map((item) => `[${item.id}] ${item.url} (${item.publishedDate ?? "date unknown"})\n${item.text}`).join("\n\n");
  return { system, user };
}

/** The search and LLM spend so far against the budget (Exa: about $0.007 a search with up to 10 texts). */
export function exaSearchCost(reported: number | null | undefined, results: number): number {
  return typeof reported === "number" && Number.isFinite(reported) ? reported : 0.007 + 0.001 * Math.max(0, results - 10);
}
