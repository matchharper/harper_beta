import {
  getChatClientForModel,
  supportsResponseFormatForModel,
} from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { isTestOnlyInternalRole } from "@/lib/internalRoleSafety";
import type { TalentAdminClient } from "./admin";
import {
  groupInternalFitHoldQuestionCandidates,
  hasExplicitInternalFitReevaluationTopic,
  normalizeInternalFitReevaluationTopic,
  type InternalFitReevaluationTopic,
} from "./internalFitQuestionTopics";

export type ActiveInternalFitHoldQuestion = {
  fitId: string;
  fitIds: string[];
  summary: string;
  topic: InternalFitReevaluationTopic;
};

const ACTIVE_HOLD_CANDIDATE_LIMIT = 20;
const NEW_INFORMATION_MAX_CHARS = 700;
const PROPAGATION_MODEL = GPT_56_LUNA_MODEL;
const PROPAGATION_TEMPERATURE = 0.3;
const PROPAGATION_METHOD = "llm_criteria_match_v1";

type InternalFitHoldQuestionCandidate = {
  criteria: unknown;
  fitId: string;
  roleId: string;
  summary: string;
  topic: InternalFitReevaluationTopic;
};

function cleanText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasSavedNewInformation(criteria: unknown) {
  const record = asRecord(criteria);
  if (!record) return false;
  return Boolean(cleanText(record.new_information, NEW_INFORMATION_MAX_CHARS));
}

function extractHoldQuestionSummary(criteria: unknown) {
  const record = asRecord(criteria);
  if (record) {
    for (const key of ["summary", "question", "wouldChangeIf", "reason"]) {
      const text = cleanText(record[key], 1000);
      if (text) return text;
    }
  }
  const text = cleanText(criteria, 1000);
  return text || null;
}

function normalizeRoleId(value: unknown) {
  return cleanText(value, 120);
}

export function normalizeInternalFitReevaluationInformation(value: unknown) {
  return cleanText(value, NEW_INFORMATION_MAX_CHARS);
}

async function fetchUnansweredInternalFitHoldQuestionCandidates(args: {
  admin: TalentAdminClient;
  limit?: number;
  userId: string;
}): Promise<InternalFitHoldQuestionCandidate[]> {
  const { data, error } = await (
    args.admin.from("talent_opportunity_fit" as any) as any
  )
    .select(
      "id, opportunity_id, score, reevaluation_criteria, last_evaluated_at, created_at"
    )
    .eq("talent_id", args.userId)
    .eq("label", "hold")
    .is("human_label", null)
    .order("score", { ascending: false })
    .order("last_evaluated_at", { ascending: true })
    .limit(args.limit ?? ACTIVE_HOLD_CANDIDATE_LIMIT);

  if (error) {
    console.error("[InternalFitHoldQuestion] Failed to load hold fits", {
      error: error.message,
      userId: args.userId,
    });
    return [];
  }

  const candidates = Array.isArray(data)
    ? data
        .map((row: Record<string, unknown>) => {
          const fitId = cleanText(row.id, 120);
          const roleId = normalizeRoleId(row.opportunity_id);
          const summary = extractHoldQuestionSummary(row.reevaluation_criteria);
          if (
            !fitId ||
            !roleId ||
            !summary ||
            hasSavedNewInformation(row.reevaluation_criteria)
          ) {
            return null;
          }
          return {
            criteria: row.reevaluation_criteria,
            fitId,
            roleId,
            summary,
            topic: normalizeInternalFitReevaluationTopic(
              row.reevaluation_criteria,
              summary
            ),
          };
        })
        .filter((row): row is InternalFitHoldQuestionCandidate => Boolean(row))
    : [];

  if (candidates.length === 0) return [];

  const roleIds = candidates.map((row) => row.roleId);
  const [rolesResponse, recommendationResponse] = await Promise.all([
    (args.admin.from("company_roles" as any) as any)
      .select(
        "role_id, company_workspace_id, source_type, source_provider, source_job_id, name, information, status, is_expired"
      )
      .in("role_id", roleIds),
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select(
        "role_id, company_role:company_roles!inner(company_workspace_id)"
      )
      .eq("talent_id", args.userId),
  ]);

  if (rolesResponse.error || recommendationResponse.error) {
    console.error("[InternalFitHoldQuestion] Failed to filter hold fits", {
      recommendationError: recommendationResponse.error?.message,
      roleError: rolesResponse.error?.message,
      userId: args.userId,
    });
    return [];
  }

  const recommendedCompanyWorkspaceIds = new Set(
    (Array.isArray(recommendationResponse.data)
      ? recommendationResponse.data
      : []
    )
      .map((row: Record<string, unknown>) => {
        const companyRole = asRecord(row.company_role);
        return cleanText(companyRole?.company_workspace_id, 120);
      })
      .filter(Boolean)
  );
  const activeInternalRoleIds = new Set(
    (Array.isArray(rolesResponse.data) ? rolesResponse.data : [])
      .filter((row: Record<string, unknown>) => {
        const sourceType = cleanText(row.source_type, 80).toLowerCase();
        const status = cleanText(row.status, 80).toLowerCase();
        const companyWorkspaceId = cleanText(row.company_workspace_id, 120);
        return (
          sourceType === "internal" &&
          status === "active" &&
          row.is_expired !== true &&
          !isTestOnlyInternalRole(row) &&
          !recommendedCompanyWorkspaceIds.has(companyWorkspaceId)
        );
      })
      .map((row: Record<string, unknown>) => normalizeRoleId(row.role_id))
  );

  return candidates.filter(
    (candidate) => activeInternalRoleIds.has(candidate.roleId)
  );
}

export async function fetchActiveInternalFitHoldQuestion(args: {
  admin: TalentAdminClient;
  locale?: string | null;
  userId: string;
}): Promise<ActiveInternalFitHoldQuestion | null> {
  const candidates = await fetchUnansweredInternalFitHoldQuestionCandidates(args);
  const explicitTopicCandidates = candidates.filter((candidate) =>
    hasExplicitInternalFitReevaluationTopic(candidate.criteria)
  );
  return (
    groupInternalFitHoldQuestionCandidates(explicitTopicCandidates, args.locale).find(
      (group) => group.fitIds.length > 1
    ) ?? null
  );
}

function extractPropagationFitIds(
  payload: unknown,
  candidateFitIds: Set<string>
) {
  const record = asRecord(payload);
  if (!record) return [];

  const rawFitIds = Array.isArray(record.fitIds)
    ? record.fitIds
    : Array.isArray(record.propagations)
      ? record.propagations
          .filter((item) => {
            const itemRecord = asRecord(item);
            const confidence = cleanText(
              itemRecord?.confidence,
              40
            ).toLowerCase();
            return (
              itemRecord?.applies === true &&
              (!confidence || confidence === "high")
            );
          })
          .map((item) => asRecord(item)?.fitId)
      : [];

  const seen = new Set<string>();
  return rawFitIds
    .map((fitId) => cleanText(fitId, 120))
    .filter((fitId) => {
      if (!fitId || !candidateFitIds.has(fitId) || seen.has(fitId))
        return false;
      seen.add(fitId);
      return true;
    });
}

async function fetchRecentConversationMessages(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  userId: string;
}) {
  if (!args.conversationId) return [];

  const { data, error } = await (
    args.admin.from("talent_messages" as any) as any
  )
    .select("id, role, content, created_at")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .order("id", { ascending: false })
    .limit(4);

  if (error) {
    console.error("[InternalFitHoldQuestion] Failed to load recent messages", {
      conversationId: args.conversationId,
      error: error.message,
      userId: args.userId,
    });
    return [];
  }

  return (Array.isArray(data) ? data : [])
    .reverse()
    .map((row: Record<string, unknown>) => ({
      content: cleanText(row.content, 1000),
      role: cleanText(row.role, 40),
    }))
    .filter((row) => row.content);
}

async function selectInternalFitPropagationTargets(args: {
  candidates: InternalFitHoldQuestionCandidate[];
  changedFitId: string;
  changedSummary: string;
  newInformation: string;
  recentConversation: Array<{ content: string; role: string }>;
}) {
  if (args.candidates.length === 0) return [];

  const candidateFitIds = new Set(
    args.candidates.map((candidate) => candidate.fitId)
  );
  const systemPrompt = [
    "You are a conservative classifier for hidden internal opportunity follow-up questions.",
    "Decide whether the user's newly saved answer directly and fully answers any other hidden clarification criteria.",
    'Return JSON only with this exact shape: {"fitIds":["..."]}.',
    "Include a fitId only when the answer clearly resolves the same missing candidate-side fact.",
    "Do not include related, inferred, partial, or broader/narrower cases.",
    "Different countries, locations, companies, compensation constraints, engagement types, functions, or ability checks are not the same criterion unless the user's answer explicitly covers them.",
  ].join("\n");
  const userPayload = {
    candidates: args.candidates.map((candidate) => ({
      fitId: candidate.fitId,
      summary: candidate.summary,
    })),
    changed: {
      fitId: args.changedFitId,
      newInformation: args.newInformation,
      summary: args.changedSummary,
    },
    recentConversation: args.recentConversation,
  };

  try {
    const llmClient = getChatClientForModel(PROPAGATION_MODEL);
    const response = await llmClient.chat.completions.create({
      model: PROPAGATION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      ...(supportsResponseFormatForModel(PROPAGATION_MODEL) && {
        response_format: { type: "json_object" as const },
      }),
      temperature: PROPAGATION_TEMPERATURE,
    } as any);
    const content = response.choices[0]?.message?.content ?? "{}";
    return extractPropagationFitIds(JSON.parse(content), candidateFitIds);
  } catch (error) {
    console.error("[InternalFitHoldQuestion] Propagation classifier failed", {
      error,
    });
    return [];
  }
}

async function propagateInternalFitReevaluationInformation(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  changedFitId: string;
  changedSummary: string;
  newInformation: string;
  userId: string;
}) {
  const candidates = (
    await fetchUnansweredInternalFitHoldQuestionCandidates({
      admin: args.admin,
      limit: ACTIVE_HOLD_CANDIDATE_LIMIT,
      userId: args.userId,
    })
  ).filter((candidate) => candidate.fitId !== args.changedFitId);
  if (candidates.length === 0) return [];

  const recentConversation = await fetchRecentConversationMessages({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const selectedFitIds = await selectInternalFitPropagationTargets({
    candidates,
    changedFitId: args.changedFitId,
    changedSummary: args.changedSummary,
    newInformation: args.newInformation,
    recentConversation,
  });
  if (selectedFitIds.length === 0) return [];

  const selectedCandidates = candidates.filter((candidate) =>
    selectedFitIds.includes(candidate.fitId)
  );
  const propagatedAt = new Date().toISOString();
  const updatedFitIds: string[] = [];
  for (const candidate of selectedCandidates) {
    const previousCriteria = asRecord(candidate.criteria);
    const nextCriteria = {
      ...(previousCriteria ?? {}),
      answered_at: propagatedAt,
      new_information: args.newInformation,
      propagated_from_fit_id: args.changedFitId,
      propagation_method: PROPAGATION_METHOD,
      summary:
        cleanText(previousCriteria?.summary, 1000) ||
        extractHoldQuestionSummary(candidate.criteria) ||
        candidate.summary,
    };
    const { error } = await (
      args.admin.from("talent_opportunity_fit" as any) as any
    )
      .update({
        reevaluation_checked_at: null,
        reevaluation_criteria: nextCriteria,
      })
      .eq("id", candidate.fitId)
      .eq("talent_id", args.userId)
      .eq("label", "hold")
      .is("human_label", null);

    if (error) {
      console.error("[InternalFitHoldQuestion] Failed to propagate answer", {
        error: error.message,
        fitId: candidate.fitId,
        userId: args.userId,
      });
      continue;
    }
    updatedFitIds.push(candidate.fitId);
  }

  return updatedFitIds;
}

export async function recordInternalFitReevaluationInformation(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  fitId: string;
  newInformation: string;
  source: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const newInformation = normalizeInternalFitReevaluationInformation(
    args.newInformation
  );
  if (!args.fitId || !newInformation) {
    return {
      ok: false,
      reason: "missing_required_fields",
    };
  }

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: args.admin,
    userId: args.userId,
  });
  if (!active || active.fitId !== args.fitId) {
    return {
      ok: false,
      reason: "not_active_hidden_hold_question",
    };
  }

  const { data: rows, error: fetchError } = await (
    args.admin.from("talent_opportunity_fit" as any) as any
  )
    .select("id, reevaluation_criteria")
    .in("id", active.fitIds)
    .eq("talent_id", args.userId)
    .eq("label", "hold")
    .is("human_label", null);

  if (fetchError) {
    throw new Error(
      fetchError.message ?? "Failed to load internal fit hold question."
    );
  }
  const activeRows = Array.isArray(rows)
    ? rows.filter((row: Record<string, unknown>) =>
        active.fitIds.includes(cleanText(row.id, 120))
      )
    : [];
  if (!activeRows.some((row: Record<string, unknown>) => row.id === args.fitId)) {
    return {
      ok: false,
      reason: "fit_not_found",
    };
  }

  const answeredAt = new Date().toISOString();
  const updatedFitIds: string[] = [];
  for (const row of activeRows as Record<string, unknown>[]) {
    const rowFitId = cleanText(row.id, 120);
    const previousCriteria = asRecord(row.reevaluation_criteria);
    const nextCriteria = {
      ...(previousCriteria ?? {}),
      topic: active.topic,
      summary:
        cleanText(previousCriteria?.summary, 1000) ||
        extractHoldQuestionSummary(row.reevaluation_criteria) ||
        active.summary,
      new_information: newInformation,
      answered_at: answeredAt,
      ...(rowFitId === args.fitId
        ? {}
        : {
            propagated_from_fit_id: args.fitId,
            propagation_method: "same_topic_group_v1",
          }),
    };

    const { error: updateError } = await (
      args.admin.from("talent_opportunity_fit" as any) as any
    )
      .update({
        reevaluation_criteria: nextCriteria,
        reevaluation_checked_at: null,
      })
      .eq("id", rowFitId)
      .eq("talent_id", args.userId)
      .eq("label", "hold")
      .is("human_label", null);

    if (updateError) {
      throw new Error(
        updateError.message ??
          "Failed to save internal fit reevaluation information."
      );
    }
    updatedFitIds.push(rowFitId);
  }

  const propagatedFitIds = await propagateInternalFitReevaluationInformation({
    admin: args.admin,
    changedFitId: args.fitId,
    changedSummary: active.summary,
    conversationId: args.conversationId,
    newInformation,
    userId: args.userId,
  });

  return {
    ok: true,
    fitId: args.fitId,
    groupedFitIds: updatedFitIds,
    newInformation,
    propagatedFitIds,
  };
}
