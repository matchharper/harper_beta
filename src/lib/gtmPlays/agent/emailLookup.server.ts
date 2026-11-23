import "server-only";

import { getExaClient } from "@/lib/tools/exaClient";
import {
  EMAIL_LOOKUP_EFFORT, EMAIL_LOOKUP_PAGE_CHARS, EMAIL_LOOKUP_PAGE_USD, EMAIL_LOOKUP_SCHEMA, EMAIL_LOOKUP_SYSTEM_PROMPT,
  emailLookupQuery, emptyLookup, lookupRunCostUsd, lookupSourceProblem, parseLookupOutput, verifyLookup,
  type EmailLookupCheck, type EmailLookupPerson,
} from "./emailLookup";
import {
  COMPANY_CONTACT_SCHEMA, COMPANY_CONTACT_SYSTEM_PROMPT, companyContactProblem, companyContactQuery,
  type CompanyContactQueryInput,
} from "./companyMail";

/**
 * #5 email lookup against Exa (agent/emailLookup.ts has the rules). A run takes minutes and a dispatcher tick has a
 * time limit, so it is started on one tick (startEmailLookup: one POST, no waiting) and looked at once on each later
 * tick (checkEmailLookup: one GET; when it has ended, its source page is read and the address checked).
 */

/** Starts one Exa Agent run for the person. Throws when Exa refuses it. */
export async function startEmailLookup(person: EmailLookupPerson): Promise<{ runId: string }> {
  const run = await getExaClient().agent.runs.create({
    query: emailLookupQuery(person),
    systemPrompt: EMAIL_LOOKUP_SYSTEM_PROMPT,
    effort: EMAIL_LOOKUP_EFFORT,
    outputSchema: EMAIL_LOOKUP_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!run?.id) throw new Error("Exa Agent run has no id");
  return { runId: run.id };
}

/** Reads the source page's text (null when it cannot be read) and what the read cost. */
async function readSourcePage(url: string): Promise<{ text: string | null; costUsd: number }> {
  try {
    const response = await getExaClient().getContents([url], { text: { maxCharacters: EMAIL_LOOKUP_PAGE_CHARS } });
    const text = String(response.results?.[0]?.text ?? "").trim();
    const reported = response.costDollars?.total;
    return { text: text || null, costUsd: typeof reported === "number" && Number.isFinite(reported) ? reported : EMAIL_LOOKUP_PAGE_USD };
  } catch {
    // The page could not be read: the address stays unconfirmed (not used).
    return { text: null, costUsd: 0 };
  }
}

/**
 * One look at a run: still running, or done with the address (or none), whether it passed the checks, why not, and
 * what it cost (the run and the page read). Throws when Exa cannot be reached (the caller tries again next tick).
 */
export async function checkEmailLookup(runId: string, person: EmailLookupPerson): Promise<EmailLookupCheck> {
  const run = await getExaClient().agent.runs.get(runId);
  if (run.status === "queued" || run.status === "running") return { state: "running" };
  const runUsd = lookupRunCostUsd(run);
  if (run.status !== "completed") return emptyLookup("failed", runUsd);
  const found = parseLookupOutput(run.output?.structured);
  const base = { state: "done" as const, email: found.email, emailKind: found.emailKind, sourceUrl: found.sourceUrl };
  const problem = lookupSourceProblem(found);
  if (problem) return { ...base, verified: false, costUsd: runUsd, reason: problem };
  const page = await readSourcePage(found.sourceUrl as string);
  const checked = verifyLookup(person, found, page.text);
  return { ...base, verified: checked.verified, costUsd: runUsd + page.costUsd, reason: checked.reason, failedCheck: checked.failedCheck };
}

/** Stops a run that took too long (best effort: a run that already ended or cannot be reached is left alone). */
export async function cancelEmailLookup(runId: string): Promise<void> {
  try {
    await getExaClient().agent.runs.cancel(runId);
  } catch {
    // Nothing to do: the lookup is given up either way.
  }
}

/**
 * #5 company mail: the paid lookup of a posting's hiring contact (agent/companyMail.ts has the question and the
 * checks), the same Exa Agent run as a person's: started on one tick, looked at on later ones.
 */
export async function startCompanyContactLookup(posting: CompanyContactQueryInput): Promise<{ runId: string }> {
  const run = await getExaClient().agent.runs.create({
    query: companyContactQuery(posting),
    systemPrompt: COMPANY_CONTACT_SYSTEM_PROMPT,
    effort: EMAIL_LOOKUP_EFFORT,
    outputSchema: COMPANY_CONTACT_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!run?.id) throw new Error("Exa Agent run has no id");
  return { runId: run.id };
}

export type CompanyContactCheck =
  | { state: "running" }
  | { state: "done"; email: string | null; sourceUrl: string | null; costUsd: number; reason: string | null };

/** One look at a company contact run: still running, or done with a usable address (or why none), and its cost. */
export async function checkCompanyContactLookup(
  runId: string, company: { companyName: string; companyDomain: string | null },
): Promise<CompanyContactCheck> {
  const run = await getExaClient().agent.runs.get(runId);
  if (run.status === "queued" || run.status === "running") return { state: "running" };
  const runUsd = lookupRunCostUsd(run);
  if (run.status !== "completed") return { state: "done", email: null, sourceUrl: null, costUsd: runUsd, reason: "failed" };
  const found = parseLookupOutput(run.output?.structured);
  const early = lookupSourceProblem(found);
  if (early) return { state: "done", email: null, sourceUrl: found.sourceUrl, costUsd: runUsd, reason: early };
  const page = await readSourcePage(found.sourceUrl as string);
  const problem = companyContactProblem(found, page.text, company);
  return {
    state: "done", email: problem ? null : found.email, sourceUrl: found.sourceUrl, costUsd: runUsd + page.costUsd, reason: problem,
  };
}
