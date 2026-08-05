import { formatPromptTable } from "@/lib/org/agent/promptFormat";
import { humanizeOrgStage } from "@/lib/org/pipelineStage";

export const DEFAULT_RECENT_PIPELINE_MAX_CHARS = 6_000;
export const ORG_AGENT_CONTEXT_MAX_CHARS = 48_000;

type RecentRecommendationRows = Array<{
  candidate: {
    headline: string | null;
    name: string;
    talentId: string;
  };
  role: { name: string | null; roleId: string };
  stage: unknown;
  stageLabel?: string | null;
}> & {
  recentComplete: boolean;
  returnedItems: number;
};

type RetainedMoreDataState = {
  companyDetails?: {
    complete: boolean;
    fields: Record<
      string,
      { complete: boolean; oversized: boolean; truncated: boolean }
    >;
  };
  members?: { complete: boolean };
  workspaceMemory?: { complete: boolean; truncated: boolean };
};

type OrgAgentContextBudgetShape = {
  companyText: string;
  contextNotesText: string;
  conversationText: string;
  pendingUpdateText?: string;
  recentRecommendationsText: string;
  retainedDataText?: string;
  retainedMoreData?: RetainedMoreDataState | null;
  rolesText: string;
  summariesText: string;
};

export function formatRecentRecommendations(rows: RecentRecommendationRows) {
  const table = formatPromptTable(
    ["talent_id", "name", "role_id", "role", "stage", "headline"],
    rows.map((row) => [
      row.candidate.talentId,
      row.candidate.name,
      row.role.roleId,
      row.role.name,
      humanizeOrgStage(row.stage, row.stageLabel),
      row.candidate.headline,
    ]),
    [100, 140, 100, 160, 100, 160]
  );
  if (table.length > DEFAULT_RECENT_PIPELINE_MAX_CHARS) {
    return [
      "recent_complete=false",
      "status=truncated",
      "message=Recent pipeline rows exceeded the context budget; read the relevant role pipeline before reporting exact results.",
    ].join("\n");
  }
  return [
    `returned_items=${rows.returnedItems} recent_complete=${rows.recentComplete}`,
    table,
  ].join("\n");
}

function markRetainedDataPartial(value: RetainedMoreDataState | null) {
  if (!value) return;
  if (value.companyDetails) {
    value.companyDetails.complete = false;
    for (const state of Object.values(value.companyDetails.fields)) {
      state.complete = false;
      state.truncated = true;
    }
  }
  if (value.workspaceMemory) {
    value.workspaceMemory.complete = false;
    value.workspaceMemory.truncated = true;
  }
  if (value.members) value.members.complete = false;
}

export function enforceOrgAgentContextBudget<
  TContext extends OrgAgentContextBudgetShape,
>(context: TContext): TContext {
  const mutable = context;
  const size = () =>
    [
      mutable.companyText,
      mutable.rolesText,
      mutable.recentRecommendationsText,
      mutable.summariesText,
      mutable.conversationText,
      mutable.pendingUpdateText,
      mutable.retainedDataText,
      mutable.contextNotesText,
    ].reduce((sum, value) => sum + String(value ?? "").length, 0);
  const trimOldest = (
    key: "conversationText" | "summariesText",
    marker: string
  ) => {
    const excess = size() - ORG_AGENT_CONTEXT_MAX_CHARS;
    if (excess <= 0) return;
    const source = mutable[key];
    const keep = Math.max(0, source.length - excess - marker.length - 1);
    mutable[key] = keep > 0 ? `${marker}\n${source.slice(-keep)}` : marker;
  };
  trimOldest("summariesText", "older_summaries_truncated=true");
  trimOldest("conversationText", "older_conversation_truncated=true");
  if (size() > ORG_AGENT_CONTEXT_MAX_CHARS) {
    mutable.recentRecommendationsText = [
      "recent_complete=false",
      "status=truncated",
      "message=Recent pipeline data exceeded the total context budget; read the relevant role pipeline before reporting exact results.",
    ].join("\n");
  }
  if (size() > ORG_AGENT_CONTEXT_MAX_CHARS) {
    markRetainedDataPartial(mutable.retainedMoreData ?? null);
    // Never preserve a serialized `complete=true` prefix after cutting away
    // the corresponding value. A fixed marker revokes rewrite visibility.
    mutable.retainedDataText = [
      "serialization_complete=false",
      "status=truncated",
      "message=Retained optional data exceeded the context budget; reload the needed field before treating it as complete.",
    ].join("\n");
  }
  return mutable;
}
