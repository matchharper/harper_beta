import "server-only";

import { PROMPT_VERSION as CAREER_FIT_PROMPT_VERSION } from "@/lib/externalRecommendationsV2/contract";
import { v2CompletionRequest } from "@/lib/externalRecommendationsV2/engine";
import { rerankPrompt, summaryPrompt } from "@/lib/externalRecommendationsV2/prompts";
import { gtmRead, gtmWrite } from "../db.server";
import { GTM_STRUCTURED_MODEL, capturePrompts } from "../llm.server";
import { composeAgentMail } from "./compose.server";
import {
  agentConfigId, buildAgentConfigSnapshot, promptVersion, type AgentConfig, type AgentConfigRules,
  type AgentConfigSnapshot, type AgentPromptVersions,
} from "./config";
import { summarizeDemand, type DemandPosting } from "./demand";
import { EMAIL_LOOKUP_SYSTEM_PROMPT, LOOKUP_MIN_SIGNAL_SCORE, emailLookupQuery } from "./emailLookup";
import { MAX_FITS, MIN_FITS, OUTREACH_PLAN_PROMPT, OUTREACH_REVISE_PROMPT, personFacts } from "./match";
import { RECENT_CONTACT_DAYS } from "./people";
import { writePostingFrames } from "./postingFrame.server";
import { READ_SEARCHED_PAGES, profilePagesPrompt } from "./profileRead";
import { REVIEW_SYSTEM_PROMPT, postingsToMail, reviewUserPrompt } from "./review";
import {
  EXPLORE_SOURCE, RECENT_MEMORY_DAYS, SIGNAL_SOURCES, judgePrompt, layoffPrompt, planPrompt, type SignalStage,
} from "./signals";
import { FOLLOWUP_RESERVE_USD } from "./spend";
import {
  BRAKE_BOUNCE_RATE, BRAKE_COMPLAINTS, DRAFT_MAX_AGE_DAYS, FOLLOWUP_MAX_LATE_DAYS, HN_BUDGET_USD, QUEUE_DAYS, SIGNAL_BUDGET_MAX,
  SIGNAL_BUDGET_SHARE, SIGNAL_MAX_PEOPLE,
} from "./tickRules";
import type { AgentPerson, AgentPosting, AgentSettings } from "./types";

/**
 * #5 설정 묶음 (agent/config.ts) on the server: the instruction versions, the fixed rules and the model ids read from the
 * code, the 설정 묶음 of the current settings (stored once per distinct content in gtm_agent_configs), and the reads
 * for /ops.
 */

// ---------------------------------------------------------------------------------------------------------------
// Instruction versions: each instruction's text for fixed sample inputs (no real person or company), hashed. A change
// to a template, or to a rule or label it includes, changes its version; the inputs never do (they are fixed here).

const SAMPLE_NOW = new Date("2026-01-05T03:00:00.000Z");
const SAMPLE_DAY = "2026-01-05";

const SAMPLE_PERSON: Pick<AgentPerson,
  "method" | "source" | "name" | "headline" | "location" | "currentCompany" | "profileUrl" | "contactUrl" | "signalUrl"
  | "signalText" | "signalAt" | "profileText" | "email" | "emailSource" | "events"
> = {
  method: "signal_post", source: "linkedin", name: "Sample Person", headline: "Backend engineer", location: "Seoul",
  currentCompany: "Example Co", profileUrl: "https://www.linkedin.com/in/sample-person", contactUrl: "https://example.dev",
  signalUrl: "https://www.linkedin.com/posts/sample-person-1", signalText: "Looking for my next backend role.",
  signalAt: "2026-01-04T00:00:00.000Z", profileText: "Built a payments backend for five years.", email: null,
  emailSource: null, events: [],
};

const SAMPLE_POSTINGS: AgentPosting[] = [
  { kind: "external", roleId: null, url: "https://example.com/jobs/1", companyName: "Example A", title: "Backend Engineer", location: "Seoul", why: "Payments backend." },
  { kind: "customer", roleId: null, url: null, companyName: "Example B", title: "Platform Engineer", location: "Remote", why: "Platform work." },
];

const SAMPLE_DEMAND_POSTINGS: DemandPosting[] = [
  { kind: "external", title: "Backend Engineer", companies: ["a"], seniorityLevel: "senior", countryCode: "KR", workMode: "onsite", locationText: "Seoul" },
  { kind: "customer", title: "Frontend Engineer", companies: ["b"], seniorityLevel: "mid", countryCode: null, workMode: "remote", locationText: null },
  { kind: "gtm", title: "Data Scientist", companies: ["c"], seniorityLevel: null, countryCode: "US", workMode: "hybrid", locationText: "New York" },
];

const SAMPLE_PAGE = { id: "r0", url: "https://example.com/post/1", publishedDate: "2026-01-04T00:00:00.000Z", text: "Sample page text." };
const SAMPLE_LAYOFFS = [{ company: "Example Co", summary: "Cut 10% of staff.", url: "https://example.com/news/1", publishedAt: "2026-01-03" }];

/** A render that throws still gives a stable text (its error), so the version stays a function of the code. */
const rendered = (render: () => { system: string; user: string } | string): string[] => {
  try {
    const value = render();
    return typeof value === "string" ? [value] : [value.system, value.user];
  } catch (error) {
    return [`render failed: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const capturedTexts = async (work: () => Promise<unknown>) =>
  (await capturePrompts(work)).flatMap((call) => [call.label, call.system, call.user]);

/** The stages a source's search goes through (signals.server.ts): the open web explores; LinkedIn also reads layoffs. */
const stagesOf = (source: string): SignalStage[] =>
  source === EXPLORE_SOURCE ? ["explore"] : source === "linkedin" ? ["signal", "layoff_news", "layoff_people"] : ["signal"];

async function computePromptVersions(): Promise<AgentPromptVersions> {
  const demand = summarizeDemand(SAMPLE_DEMAND_POSTINGS, SAMPLE_DAY);
  const sources = [...SIGNAL_SOURCES, EXPLORE_SOURCE];
  const planner: string[] = [];
  const judge: string[] = [];
  for (const source of sources) {
    for (const stage of stagesOf(source)) {
      for (const withDemand of [false, true]) {
        const base = {
          source, stage, yields: [], keptSamples: [], rejectedSamples: [], budgetLeftUsd: 1, tuning: null, layoffs: SAMPLE_LAYOFFS,
          history: [], demand: withDemand ? demand : null, now: SAMPLE_NOW,
        };
        planner.push(...rendered(() => planPrompt({ ...base, previous: null })));
        planner.push(...rendered(() => planPrompt({
          ...base, previous: { plan: "Sample plan.", reason: null, queries: [{ query: "open to work backend", group: "sample" }], stage },
          yields: [{ stage, group: "sample", query: "open to work backend", results: 10, kept: 1, withContact: 0 }],
          keptSamples: ["Backend engineer · open to work"], rejectedSamples: ["Recruiter · hiring"],
        })));
        judge.push(...rendered(() => judgePrompt([SAMPLE_PAGE], { source, stage, tuning: null, layoffs: SAMPLE_LAYOFFS, now: SAMPLE_NOW, demand: withDemand ? demand : null })));
      }
    }
  }
  planner.push(...rendered(() => layoffPrompt([{ id: "a0", url: SAMPLE_PAGE.url, publishedDate: SAMPLE_PAGE.publishedDate, text: SAMPLE_PAGE.text }])));
  const facts = personFacts(SAMPLE_PERSON);
  const matcher = [
    OUTREACH_PLAN_PROMPT, OUTREACH_REVISE_PROMPT, CAREER_FIT_PROMPT_VERSION, summaryPrompt("ko"), summaryPrompt("en"),
    ...(["web", "worker", "daily"] as const).flatMap((surface) => [rerankPrompt("ko", surface), rerankPrompt("en", surface)]),
  ];
  const postingFrame: string[] = [];
  const mailWriter: string[] = [];
  for (const language of ["ko", "en"] as const) {
    postingFrame.push(...await capturedTexts(() => writePostingFrames({
      language, personFacts: facts, personName: SAMPLE_PERSON.name,
      postings: SAMPLE_POSTINGS.map((posting) => ({ ...posting, description: "Sample posting text." })),
    })));
    for (const followup of [false, true]) {
      mailWriter.push(...await capturedTexts(() => composeAgentMail({
        person: SAMPLE_PERSON, postings: SAMPLE_POSTINGS, language, senderName: "Sender", followup, previousSubject: followup ? "Sample subject" : null,
      })));
    }
  }
  return {
    planner: promptVersion(planner),
    judge: promptVersion(judge),
    matcher: promptVersion(matcher),
    postingFrame: promptVersion(postingFrame),
    grader: promptVersion([REVIEW_SYSTEM_PROMPT, reviewUserPrompt(facts, SAMPLE_POSTINGS.map((posting) => ({ ...posting, text: "Sample posting text." })))]),
    mailWriter: promptVersion(mailWriter),
    lookup: promptVersion([EMAIL_LOOKUP_SYSTEM_PROMPT, emailLookupQuery(SAMPLE_PERSON)]),
    profile: promptVersion([
      ...rendered(() => profilePagesPrompt(SAMPLE_PERSON, [{ id: "p0", url: SAMPLE_PAGE.url, text: SAMPLE_PAGE.text }])),
      ...rendered(() => profilePagesPrompt({ ...SAMPLE_PERSON, method: "applicant" }, [{ id: "p0", url: SAMPLE_PAGE.url, text: SAMPLE_PAGE.text }])),
    ]),
  };
}

let promptVersions: Promise<AgentPromptVersions> | null = null;

/** The instruction versions of the running code (computed once per process: they change only with a deploy). */
export function agentPromptVersions(): Promise<AgentPromptVersions> {
  promptVersions ??= computePromptVersions().catch((error) => {
    promptVersions = null;
    throw error;
  });
  return promptVersions;
}

/** The fixed rules in code a 설정 묶음 keeps (each read from its own constant). */
export function agentConfigRules(): AgentConfigRules {
  // The grader's gate, read from the rule itself: does a posting graded 안 맞음 leave the mail?
  const gate = postingsToMail([{ ...SAMPLE_POSTINGS[0], review: { grade: "poor", reason: "", at: SAMPLE_NOW.toISOString() } }], MAX_FITS);
  const unsure = postingsToMail([{ ...SAMPLE_POSTINGS[0], review: { grade: "unsure", reason: "", at: SAMPLE_NOW.toISOString() } }], MAX_FITS);
  return {
    minFits: MIN_FITS, maxFits: MAX_FITS, lookupMinSignalScore: LOOKUP_MIN_SIGNAL_SCORE, graderDropsPoor: gate.dropped.length > 0,
    graderKeepsOnlyGood: unsure.kept.length === 0,
    hnBudgetUsd: HN_BUDGET_USD, searchBudgetShare: SIGNAL_BUDGET_SHARE, searchBudgetMaxUsd: SIGNAL_BUDGET_MAX,
    searchMaxPeople: SIGNAL_MAX_PEOPLE, readSearchedPages: READ_SEARCHED_PAGES, recentMemoryDays: RECENT_MEMORY_DAYS,
    recentContactDays: RECENT_CONTACT_DAYS, draftMaxAgeDays: DRAFT_MAX_AGE_DAYS, queueDays: QUEUE_DAYS,
    followupReserveUsd: FOLLOWUP_RESERVE_USD, followupMaxLateDays: FOLLOWUP_MAX_LATE_DAYS, brakeBounceRate: BRAKE_BOUNCE_RATE,
    brakeComplaints: BRAKE_COMPLAINTS,
  };
}

function agentConfigModels() {
  const plan = v2CompletionRequest("", "", "plan");
  const rerank = v2CompletionRequest("", "", "rerank");
  return {
    agent: `${GTM_STRUCTURED_MODEL.model} · ${GTM_STRUCTURED_MODEL.reasoningEffort}`,
    matcher: `${plan.primaryModel} · ${plan.openAIResponsesReasoningEffort ?? "default"}/${rerank.openAIResponsesReasoningEffort ?? "default"}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Storage

/** Ids written in this process (a tick reuses the id without another write). */
const stored = new Set<string>();

/**
 * The 설정 묶음 these settings run with now, stored once (gtm_agent_configs: the first use's time stays). Every tick
 * calls it; an upload too, for the people it adds.
 */
export async function ensureAgentConfig(settings: AgentSettings): Promise<{ id: string; snapshot: AgentConfigSnapshot }> {
  const snapshot = buildAgentConfigSnapshot({
    settings, rules: agentConfigRules(), prompts: await agentPromptVersions(), models: agentConfigModels(),
  });
  const id = agentConfigId(snapshot);
  if (!stored.has(id)) {
    await gtmWrite((sql) => sql`
      insert into public.gtm_agent_configs (id, snapshot) values (${id}, ${sql.json(snapshot as never)})
      on conflict (id) do nothing
    `);
    stored.add(id);
  }
  return { id, snapshot };
}

type ConfigRow = { id: string; snapshot: AgentConfigSnapshot; first_used_at: string | Date };

const mapConfig = (row: ConfigRow): AgentConfig => ({
  id: row.id, snapshot: row.snapshot, firstUsedAt: new Date(row.first_used_at).toISOString(),
});

/** Every 설정 묶음, the first used first (at most the latest `limit`); none before the table is there. */
export async function listAgentConfigs(limit = 300): Promise<AgentConfig[]> {
  try {
    const rows = await gtmRead((sql) => sql<ConfigRow[]>`
      select * from (
        select id, snapshot, first_used_at from public.gtm_agent_configs order by first_used_at desc limit ${limit}::int
      ) latest order by first_used_at
    `);
    return rows.map(mapConfig);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}
