import { formatPromptTable } from "@/lib/org/agent/promptFormat";
import { humanizeOrgStage } from "@/lib/org/pipelineStage";
import { conversationCompatibilityText, type OrgAgentConversationInput } from "./conversationInput";

// Leave room for the expanded recent-conversation section alongside the
// company, Role, and current workflow context that the model also needs.
export const ORG_AGENT_CONTEXT_MAX_CHARS = 96_000;

type RecentRecommendationRows = Array<{
  candidate: {
    headline: string | null;
    name: string;
    talentId: string;
  };
  role: { name: string | null; roleId: string };
  stage: unknown;
  capabilities?: Record<string, boolean>;
  criteriaEvaluations?: Array<{ name: string; fitness: string }>;
  companyIntroStatus?: string | null;
  recommendationId?: string | null;
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
  accessText?: string;
  companyText: string;
  contextNotesText: string;
  conversationText: string;
  conversationMessages?: OrgAgentConversationInput[];
  conversationHistoryInfo?: { hasMore: boolean; threadId: string | null; returnedItems: number };
  inProgressRoleCreationsText?: string;
  pendingUpdateText?: string;
  recentToolContextText?: string;
  recentContactsText: string;
  recentRecommendationsText: string;
  retainedDataText?: string;
  retainedMoreData?: RetainedMoreDataState | null;
  rolesText: string;
  summariesText: string;
};

export function formatRecentRecommendations(rows: RecentRecommendationRows) {
  // Keep the identity and current relationship index even when optional detail
  // is large. Professional profiles and criterion explanations belong to reads.
  const table = formatPromptTable(
    ["talent_id", "name", "role_id", "role", "stage", "proposal_status", "capabilities"],
    rows.map((row) => [
      row.candidate.talentId,
      row.candidate.name,
      row.role.roleId,
      row.role.name,
      humanizeOrgStage(row.stage, row.stageLabel),
      row.companyIntroStatus,
      row.capabilities,
    ]),
    [Number.MAX_SAFE_INTEGER, 140, Number.MAX_SAFE_INTEGER, 160, 100, 100, 300]
  );
  return [
    `returned_items=${rows.returnedItems} recent_complete=${rows.recentComplete}`,
    "아래 후보는 이미 회사의 추천·진행 목록에 등록되어 있다. 현재 목록 상태이며, 이 대화에서 소개했거나 외부 메시지를 전달했다는 증거는 아니다. 새로 추가된 인원은 해당 실행의 추가·제외 기록으로 확인한다.",
    table,
    "개별 경력·평가·진행은 read_talent, 전체 Role 목록은 read_role 또는 get_talents로 조회한다. 최근 목록의 완전성은 recent_complete를 따른다.",
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
      mutable.accessText,
      mutable.companyText,
      mutable.recentContactsText,
      mutable.rolesText,
      mutable.recentRecommendationsText,
      mutable.summariesText,
      mutable.conversationText,
      mutable.inProgressRoleCreationsText,
      mutable.pendingUpdateText,
      mutable.recentToolContextText,
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
    const firstLine = source.split("\n", 1)[0] ?? "";
    const preservedMetadata =
      key === "conversationText" &&
      firstLine.startsWith("scope=current_thread ")
        ? firstLine
        : "";
    const prefix = [marker, preservedMetadata].filter(Boolean).join("\n");
    const body = preservedMetadata
      ? source.slice(Math.min(source.length, firstLine.length + 1))
      : source;
    const keep = Math.max(0, source.length - excess - prefix.length - 1);
    mutable[key] = keep > 0 ? `${prefix}\n${body.slice(-keep)}` : prefix;
  };
  trimOldest("summariesText", "older_summaries_truncated=true");
  if (mutable.conversationMessages) {
    while (size() > ORG_AGENT_CONTEXT_MAX_CHARS && mutable.conversationMessages.length > 0) {
      mutable.conversationMessages = mutable.conversationMessages.slice(1);
      mutable.conversationHistoryInfo = { hasMore: true, threadId: mutable.conversationHistoryInfo?.threadId ?? null, returnedItems: mutable.conversationMessages.length };
      mutable.conversationText = "older_conversation_truncated=true\n" + conversationCompatibilityText(mutable.conversationMessages);
    }
  } else {
    // Compatibility for older callers; production uses complete message units.
    trimOldest("conversationText", "older_conversation_truncated=true");
  }
  // Preserve the compact current-pair index. Dropping it would erase known
  // recommendations while retaining older conversational interpretations.
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
