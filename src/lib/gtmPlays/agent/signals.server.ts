import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { getExaClient } from "@/lib/tools/exaClient";
import { gtmStructuredCall } from "../llm.server";
import { cleanEmail, personKey, SIGNAL_MAX_AGE_DAYS } from "./people";
import {
  JUDGE_SCHEMA, PLAN_SCHEMA, TARGET_DOMAINS, authorProfileUrl, exaSearchCost, judgePrompt, planPrompt, resultKind,
  type SignalJudgement, type SignalPlan, type SignalQuery, type SignalSource,
} from "./signals";

/**
 * #5 사람 찾기 for one source: plan → search → judge every result → look at what each query family yielded → revise
 * (at most MAX_ROUNDS), inside `budgetUsd` (Exa and the model together). Returns the kept people (one per person) and
 * the plan versions with their reasons, which the run keeps on its counts for /ops #5.
 */

const MAX_ROUNDS = 3;
const RESULTS_PER_SEARCH = 10;
const TEXT_CHARS = 1_500;
const MIN_SCORE = 60;

export type SignalPerson = {
  personKey: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  email: string | null;
  signalText: string;
  signalUrl: string;
  signalAt: string | null;
  language: "ko" | "en";
  score: number;
};

export type SignalSearchResult = {
  people: SignalPerson[];
  costUsd: number;
  plans: SignalPlan[];
  yields: Array<{ group: string; query: string; results: number; kept: number }>;
};

type ExaResult = { url: string; title?: string | null; text?: string | null; publishedDate?: string | null };

export async function searchSignalPeople(args: {
  source: SignalSource;
  budgetUsd: number;
  maxPeople: number;
  /** Person keys the agent already knows (any status): never returned again. */
  known: ReadonlySet<string>;
  now?: Date;
}): Promise<SignalSearchResult> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - SIGNAL_MAX_AGE_DAYS * 86_400_000).toISOString();
  const totals = createCompanyRunUsage();
  let exaUsd = 0;
  const spent = () => exaUsd + totals.costUsd;
  const exa = getExaClient();
  const seenUrls = new Set<string>();
  const people = new Map<string, SignalPerson>();
  const plans: SignalPlan[] = [];
  const yields: SignalSearchResult["yields"] = [];
  const keptSamples: string[] = [];
  const rejectedSamples: string[] = [];

  await withLlmUsageContext(
    { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: `signals_${args.source}` }, companyRunUsage: totals },
    async () => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (people.size >= args.maxPeople || spent() >= args.budgetUsd) break;
        const prompt = planPrompt({
          source: args.source, previous: plans.at(-1) ?? null, yields, keptSamples: keptSamples.slice(-6),
          rejectedSamples: rejectedSamples.slice(-6), budgetLeftUsd: Math.max(0, args.budgetUsd - spent()),
        });
        const plan = await gtmStructuredCall<SignalPlan>({
          label: "gtm-agent:signals-plan", schemaName: "gtm_agent_signal_plan", schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
          system: prompt.system, user: prompt.user, maxTokens: 1_500,
        });
        const queries = (plan.queries ?? []).filter((item) => item.query?.trim() && TARGET_DOMAINS[item.target])
          .filter((item) => args.source === "threads" ? item.target === "threads_post" : item.target !== "threads_post");
        plans.push({ plan: plan.plan, reason: plan.reason ?? null, queries });
        if (!queries.length) break;

        for (const query of queries) {
          if (people.size >= args.maxPeople || spent() >= args.budgetUsd) break;
          const found = await runSearch(exa, query, since).catch((error) => {
            console.warn("[gtm-agent:signals] search", query.group, error instanceof Error ? error.message : String(error));
            return { results: [] as ExaResult[], costUsd: 0 };
          });
          exaUsd += found.costUsd;
          const fresh = found.results.filter((item) => item.url && !seenUrls.has(item.url) && resultKind(item.url) !== "other");
          fresh.forEach((item) => seenUrls.add(item.url));
          let kept = 0;
          if (fresh.length && spent() < args.budgetUsd) {
            const batch = fresh.map((item, index) => ({
              id: String(index), url: item.url, publishedDate: item.publishedDate ?? null,
              text: `${item.title ?? ""}\n${item.text ?? ""}`.replace(/\s+/g, " ").slice(0, TEXT_CHARS),
            }));
            const judged = await gtmStructuredCall<{ results: SignalJudgement[] }>({
              label: "gtm-agent:signals-judge", schemaName: "gtm_agent_signal_judge", schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
              ...judgePrompt(batch), maxTokens: 4_000,
            });
            for (const verdict of judged.results ?? []) {
              const item = batch[Number(verdict.id)];
              if (!item) continue;
              const sample = `- ${verdict.kind} · ${verdict.headline || verdict.name} · ${verdict.signal}`.slice(0, 200);
              if (!verdict.keep || verdict.score < MIN_SCORE || verdict.kind !== "seeking_individual") {
                rejectedSamples.push(sample);
                continue;
              }
              const profileUrl = authorProfileUrl(item.url);
              const email = cleanEmail(verdict.email);
              const key = personKey({ email, profileUrl });
              if (!key || args.known.has(key) || people.has(key)) continue;
              people.set(key, {
                personKey: key, name: verdict.name || null, headline: verdict.headline || null, location: verdict.location || null,
                currentCompany: verdict.currentCompany || null, profileUrl, email, signalText: verdict.signal.slice(0, 600),
                signalUrl: item.url, signalAt: item.publishedDate ? new Date(item.publishedDate).toISOString() : null,
                language: verdict.language === "en" ? "en" : "ko", score: verdict.score,
              });
              keptSamples.push(sample);
              kept += 1;
              if (people.size >= args.maxPeople) break;
            }
          }
          yields.push({ group: query.group, query: query.query, results: fresh.length, kept });
        }
      }
    },
  );
  return { people: [...people.values()], costUsd: Number(spent().toFixed(6)), plans, yields };
}

async function runSearch(exa: ReturnType<typeof getExaClient>, query: SignalQuery, since: string) {
  const response = await (exa as unknown as {
    search: (query: string, options: Record<string, unknown>) => Promise<{ results?: ExaResult[]; costDollars?: { total?: number } }>;
  }).search(query.query, {
    numResults: RESULTS_PER_SEARCH,
    includeDomains: TARGET_DOMAINS[query.target],
    // Posts by when they were written; profiles (the signal in their headline) by when they were last read.
    startPublishedDate: since,
    type: "auto",
    contents: { text: { maxCharacters: TEXT_CHARS } },
  });
  const results = response.results ?? [];
  return { results, costUsd: exaSearchCost(response.costDollars?.total, results.length) };
}
