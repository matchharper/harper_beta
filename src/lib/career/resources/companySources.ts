import {
  databaseError,
  record,
  resourceDb,
  rows,
  type ResourceContext,
} from "./types";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

export async function readCompanyObservations(
  admin: ResourceContext["admin"],
  id: string,
  evidenceQuery?: string
) {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 100) {
    const pageArgs = { p_company: id, p_offset: offset, p_limit: 100 };
    const db = resourceDb(admin);
    const result = evidenceQuery === undefined
      ? await db.rpc("career_company_observations_v1", pageArgs)
      : await db.rpc("career_company_evidence_v1", { ...pageArgs, p_query: evidenceQuery });
    databaseError(result.error);
    const page = rows(result.data);
    all.push(...page);
    if (page.length < 100) return all;
  }
}
export function companyObservationBody(source: Record<string, unknown>) {
  return [
    `Public source ${source.source_url}; observation ${source.id}; observed ${source.observed_at}; published ${source.published_at ?? "unknown"}.`,
    record(source.provenance).coverage,
    String(source.content ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatCompanyEvidence(source: Record<string, unknown>) {
  const timestamp = (value: unknown) => value ? formatLlmDateTime(String(value)) : "unknown";
  return [
    `${source.title || source.source_url} — ${source.source_url} (observation:${source.id})`,
    `Published: ${timestamp(source.published_at)}; observed: ${timestamp(source.observed_at)}; source fetched: ${timestamp(source.source_fetched_at)}.`,
    source.coverage,
    source.content,
  ].filter(Boolean).join("\n");
}
