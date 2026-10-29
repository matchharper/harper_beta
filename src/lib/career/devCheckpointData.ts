// Only Career-owned state. Auth, billing, shared job/company data and external
// delivery ledgers are deliberately not rewindable account state.
export const CHECKPOINT_OWNERS: Record<string, string> = {
  talent_users: "user_id",
  talent_setting: "user_id",
  talent_conversations: "user_id",
  talent_messages: "user_id",
  talent_calls: "user_id",
  talent_simulate_application: "user_id",
  talent_experiences: "talent_id",
  talent_educations: "talent_id",
  talent_extras: "talent_id",
  talent_insights: "talent_id",
  talent_contexts: "talent_id",
  talent_context_write_requests: "talent_id",
  talent_conversation_summaries: "talent_id",
  talent_documents: "talent_id",
  talent_activity_events: "talent_id",
  talent_behavior_contexts: "talent_id",
  talent_behavior_context_changes: "talent_id",
  talent_company_follow: "talent_id",
  talent_location_facets: "talent_id",
  talent_profile_chunk_embeddings: "talent_id",
  talent_profile_search_embeddings: "talent_id",
  talent_external_fit: "talent_id",
  talent_opportunity_fit: "talent_id",
  talent_opportunity_recommendation: "talent_id",
  talent_opportunity_tag: "talent_id",
  talent_opportunity_matching_review: "talent_id",
  talent_progress: "talent_id",
  opportunity_discovery_run: "talent_id",
  opportunity_scheduler_state: "talent_id",
  opportunity_scheduler_checks: "talent_id",
  external_recommendation_runs: "talent_id",
  company_first_talent_scores: "talent_id",
  company_role_candidate_evaluations: "talent_id",
  company_intro_candidates: "talent_id",
  company_talent_requests: "talent_id",
  company_talent_followups: "talent_id",
};
export const CHECKPOINT_CHILDREN: Record<
  string,
  { column: string; parent: string; key: string }
> = {
  talent_opportunity_chat_preview: {
    column: "conversation_id",
    parent: "talent_conversations",
    key: "id",
  },
  talent_role_activity: {
    column: "recommendation_id",
    parent: "talent_opportunity_recommendation",
    key: "id",
  },
  company_talent_relays: {
    column: "company_talent_request_id",
    parent: "company_talent_requests",
    key: "id",
  },
};
export const CHECKPOINT_TABLES = [
  ...Object.keys(CHECKPOINT_OWNERS),
  ...Object.keys(CHECKPOINT_CHILDREN),
];
export type CheckpointRow = Record<string, unknown>;
export type CheckpointForeignKey = {
  child: string;
  parent: string;
  parent_schema: string;
  child_columns: string[];
  parent_columns: string[];
};
export type CareerCheckpoint = {
  version: number;
  user: { id: string; email: string; captured_at: string };
  columns: { table_name: string; column_name: string; is_generated: string }[];
  fks: CheckpointForeignKey[];
  tables: Record<string, CheckpointRow[]>;
};
export const quoteIdentifier = (value: string) =>
  `"${value.replaceAll('"', '""')}"`;
export const tableSql = (name: string) => `public.${quoteIdentifier(name)}`;
export function scopeSql(
  table: string,
  alias: string,
  userParam = "$1"
): string {
  const owner = CHECKPOINT_OWNERS[table];
  if (owner) return `${alias}.${quoteIdentifier(owner)}::text = ${userParam}`;
  const child = CHECKPOINT_CHILDREN[table];
  if (!child) throw new Error(`Unsupported checkpoint table: ${table}`);
  return `${alias}.${quoteIdentifier(child.column)} in (select p.${quoteIdentifier(child.key)} from ${tableSql(child.parent)} p where ${scopeSql(child.parent, "p", userParam)})`;
}

// Compare values, not json object insertion order. Also used by local DB tests.
export function canonicalRows(rows: CheckpointRow[]) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)])
          )
        : value;
  return rows.map((row) => JSON.stringify(canonical(row))).sort();
}
