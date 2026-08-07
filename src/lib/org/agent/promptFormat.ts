import type { OrgAgentToolName } from "@/lib/org/agent/tools";
import type { OrgAgentMoreDataResult } from "@/lib/org/agent/data";
import {
  humanizeOrgEmploymentType,
  humanizeOrgFeedback,
  humanizeOrgRoleStatus,
  humanizeOrgStage,
  humanizeOrgWorkMode,
} from "@/lib/org/pipelineStage";

const EMPTY_CELL = "-";

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export function clipPromptText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "")
    .replaceAll("\u0000", "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
    : normalized;
}

/** Preserves Markdown structure while neutralizing prompt section tags. */
export function formatPromptMarkdown(value: unknown, maxLength: number) {
  const normalized = String(value ?? "")
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim()
    .replaceAll("<", "‹")
    .replaceAll(">", "›");
  if (!normalized) return EMPTY_CELL;
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
    : normalized;
}

/**
 * Entity and progress order is already encoded by row order. Day precision is
 * enough for agent decisions and avoids repeating time-zone, seconds, and
 * millisecond tokens in every row.
 */
export function formatPromptDate(value: unknown) {
  const normalized = String(value ?? "").trim();
  const isoDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return (isoDate?.[1] ?? clipPromptText(normalized, 24)) || EMPTY_CELL;
}

export function formatPromptCell(value: unknown, maxLength = 500): string {
  if (Array.isArray(value)) {
    return (
      clipPromptText(
        value
          .map((item) => formatPromptCell(item, 120))
          .filter((item) => item !== EMPTY_CELL)
          .join(","),
        maxLength
      ) || EMPTY_CELL
    );
  }
  if (value && typeof value === "object") {
    const pairs: string[] = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .map(([key, item]) => `${key}=${formatPromptCell(item, 160)}`);
    return clipPromptText(pairs.join(";"), maxLength) || EMPTY_CELL;
  }
  return (
    clipPromptText(value, maxLength)
      .replaceAll("<", "‹")
      .replaceAll(">", "›") || EMPTY_CELL
  );
}

/**
 * TSV keeps column names once and uses a format models already know. Tabs and
 * newlines inside cells have been collapsed by formatPromptCell.
 */
export function formatPromptTable(
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  columnMaxLengths?: readonly number[]
) {
  if (rows.length === 0) return EMPTY_CELL;
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      columns
        .map((_, index) =>
          formatPromptCell(row[index], columnMaxLengths?.[index] ?? 500)
        )
        .join("\t")
    ),
  ].join("\n");
}

export function formatPromptSection(name: string, content: string) {
  return `<${name}>\n${content || EMPTY_CELL}\n</${name}>`;
}

function pageLine(value: Record<string, any>) {
  return [
    `offset=${Number(value.offset ?? 0)}`,
    `limit=${Number(value.limit ?? 0)}`,
    `has_more=${Boolean(value.hasMore)}`,
    ...(value.total === undefined ? [] : [`total=${Number(value.total ?? 0)}`]),
    ...(value.selectedStage
      ? [`stage=${formatPromptCell(value.selectedStage, 100)}`]
      : []),
  ].join(" ");
}

function formatTalentSearchResult(result: Record<string, any>) {
  const items = Array.isArray(result.items) ? result.items : [];
  const hasProfileMatches = items.some(
    (item: any) =>
      Array.isArray(item?.profileMatches) && item.profileMatches.length > 0
  );
  return [
    "status=ok",
    pageLine(result),
    formatPromptSection(
      "matches",
      formatPromptTable(
        [
          "talent_id",
          "name",
          "email",
          "headline",
          "role_id",
          "role",
          "stage",
          "fit",
          ...(hasProfileMatches ? ["profile_matches"] : []),
          "recommended",
        ],
        items.map((item: any) => [
          item?.candidate?.talentId,
          item?.candidate?.name,
          item?.candidate?.email,
          item?.candidate?.headline,
          item?.role?.roleId,
          item?.role?.name,
          humanizeOrgStage(item?.stage, item?.stageLabel),
          item?.fitSummary,
          ...(hasProfileMatches
            ? [
                Array.isArray(item?.profileMatches)
                  ? item.profileMatches.join(" ; ")
                  : null,
              ]
            : []),
          formatPromptDate(item?.recommendedAt),
        ]),
        [
          100,
          140,
          180,
          180,
          100,
          160,
          100,
          400,
          ...(hasProfileMatches ? [500] : []),
          10,
        ]
      )
    ),
  ].join("\n");
}

function formatTalentProfile(profile: Record<string, any>) {
  const experiences = Array.isArray(profile.experiences)
    ? profile.experiences
    : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  return [
    formatPromptSection(
      "profile_summary",
      formatPromptTable(
        ["field", "value"],
        [
          ["location", profile.location],
          ["bio", profile.bio],
          ["resume_excerpt", profile.resumeExcerpt],
        ],
        [30, 4_000]
      )
    ),
    formatPromptSection(
      "experience",
      formatPromptTable(
        ["company", "role", "type", "location", "start", "end", "description"],
        experiences.map((item: any) => [
          item?.company_name,
          item?.role,
          humanizeOrgEmploymentType(item?.employment_type),
          item?.company_location,
          formatPromptDate(item?.start_date),
          formatPromptDate(item?.end_date),
          item?.description,
        ]),
        [160, 160, 80, 120, 10, 10, 800]
      )
    ),
    formatPromptSection(
      "education",
      formatPromptTable(
        ["school", "degree", "field", "start", "end", "description"],
        education.map((item: any) => [
          item?.school,
          item?.degree,
          item?.field,
          formatPromptDate(item?.start_date),
          formatPromptDate(item?.end_date),
          item?.description,
        ]),
        [180, 120, 160, 10, 10, 500]
      )
    ),
  ].join("\n");
}

function formatTalentResult(result: Record<string, any>) {
  const candidate = asRecord(result.candidate);
  const positions = Array.isArray(result.positions) ? result.positions : [];
  const progress = Array.isArray(result.recentProgress)
    ? result.recentProgress
    : [];
  const profile = asRecord(result.profile);
  const resumeAvailability = asRecord(result.resumeAvailability);
  const harperSharedInformation = Array.isArray(result.harperSharedInformation)
    ? result.harperSharedInformation
    : [];
  const requestHistory = Array.isArray(result.requestHistory)
    ? result.requestHistory
    : [];
  return [
    "status=ok",
    formatPromptSection(
      "candidate",
      formatPromptTable(
        ["talent_id", "name", "email", "headline"],
        [
          [
            candidate.talentId,
            candidate.name,
            candidate.email,
            candidate.headline,
          ],
        ],
        [100, 160, 180, 240]
      )
    ),
    formatPromptSection(
      "positions",
      formatPromptTable(
        [
          "role_id",
          "role",
          "stage",
          "fit",
          "fit_reasons",
          "feedback",
          "feedback_reason",
          "memo",
          "tradeoffs",
          "recommended",
          "updated",
        ],
        positions.map((item: any) => [
          item?.roleId,
          item?.roleName,
          humanizeOrgStage(item?.stage, item?.stageLabel),
          item?.fitSummary,
          item?.fitReasons,
          humanizeOrgFeedback(item?.existingFeedback),
          item?.feedbackReason,
          item?.talentMemo,
          item?.tradeoffs,
          formatPromptDate(item?.recommendedAt),
          formatPromptDate(item?.updatedAt),
        ]),
        [100, 160, 100, 700, 500, 300, 400, 700, 1_000, 10, 10]
      )
    ),
    formatPromptSection(
      "recent_progress",
      formatPromptTable(
        ["date", "role_id", "role", "kind", "text", "details"],
        progress.map((item: any) => [
          formatPromptDate(item?.at),
          item?.roleId,
          item?.roleName,
          item?.kind,
          item?.text,
          item?.metadata,
        ]),
        [10, 100, 160, 100, 700, 500]
      )
    ),
    formatPromptSection(
      "resume_availability",
      formatPromptTable(
        ["available", "guidance"],
        [[resumeAvailability.available, resumeAvailability.guidance]],
        [10, 240]
      )
    ),
    formatPromptSection(
      "company_contact_history",
      formatPromptTable(
        [
          "request_id",
          "created_or_sent_kst",
          "scheduled_kst",
          "role",
          "request",
          "topic",
          "status",
          "cancelable",
        ],
        requestHistory.map((item: any) => [
          item?.requestId,
          item?.at,
          item?.scheduledAt,
          item?.roleName,
          item?.label,
          item?.topic,
          item?.status,
          item?.cancelable,
        ]),
        [100, 40, 40, 160, 180, 800, 160, 10]
      )
    ),
    "Harper에게 말해준 정보. 후보자가 Harper에게 공유한 직업 관련 정보이며, 없는 내용은 추정하지 마세요. 보상 정보는 이 목록에 포함되지 않습니다.",
    formatPromptSection(
      "harper_shared_information",
      formatPromptTable(
        ["item", "candidate_shared_information"],
        harperSharedInformation.map((item: any) => [item?.label, item?.value]),
        [120, 600]
      )
    ),
    result.profileIncluded && Object.keys(profile).length > 0
      ? formatTalentProfile(profile)
      : "profile_included=false",
  ].join("\n");
}

function formatRoleResult(result: Record<string, any>) {
  if (result.matchStatus) {
    const candidates = Array.isArray(result.candidates)
      ? result.candidates
      : [];
    return [
      `status=${formatPromptCell(result.matchStatus, 40)}`,
      formatPromptSection(
        "role_candidates",
        formatPromptTable(
          ["role_id", "name"],
          candidates.map((item: any) => [item?.roleId, item?.name]),
          [100, 200]
        )
      ),
    ].join("\n");
  }
  const role = asRecord(result.role);
  const memory = asRecord(result.memory);
  const completeness = asRecord(result.fieldCompleteness);
  const people = asRecord(result.people);
  const peopleItems = Array.isArray(people.items) ? people.items : [];
  const stageCounts = Array.isArray(result.stageCounts)
    ? result.stageCounts
    : [];
  const updates = Array.isArray(result.recentUpdates)
    ? result.recentUpdates
    : [];
  const stages = Array.isArray(result.availableStages)
    ? result.availableStages
    : [];
  return [
    "status=ok",
    formatPromptSection(
      "role",
      formatPromptTable(
        ["field", "value"],
        [
          ["role_id", role.roleId],
          ["name", role.name],
          ["status", humanizeOrgRoleStatus(role.status)],
          ["location", role.locationText],
          ["work_mode", humanizeOrgWorkMode(role.workMode)],
          [
            "employment",
            Array.isArray(role.employmentTypes)
              ? role.employmentTypes.map(humanizeOrgEmploymentType)
              : role.employmentTypes,
          ],
          ["external_jd_url", role.externalJdUrl],
          ["updated", formatPromptDate(role.updatedAt)],
        ],
        [40, 1_000]
      )
    ),
    completeness.role_request?.included
      ? [
          `role_request_complete=${Boolean(completeness.role_request.complete)}`,
          formatPromptSection(
            "role_request_markdown",
            formatPromptMarkdown(role.request, 20_000)
          ),
        ].join("\n")
      : "role_request_included=false",
    completeness.role_memory?.included
      ? [
          `role_memory_complete=${Boolean(completeness.role_memory.complete)}`,
          `role_memory_exists=${Boolean(memory.exists)}`,
          formatPromptSection(
            "role_memory_markdown",
            formatPromptMarkdown(memory.content, 12_000)
          ),
        ].join("\n")
      : "role_memory_included=false",
    completeness.role_description?.included
      ? [
          `role_description_complete=${Boolean(completeness.role_description.complete)}`,
          formatPromptSection(
            "role_description",
            formatPromptMarkdown(role.description, 20_000)
          ),
        ].join("\n")
      : "role_description_included=false",
    formatPromptSection(
      "stages",
      formatPromptTable(
        ["label"],
        stages.map((item: any) => [item?.label]),
        [120]
      )
    ),
    `pipeline_counts_complete=${Boolean(result.countsComplete)}`,
    formatPromptSection(
      "stage_counts",
      formatPromptTable(
        ["stage", "count"],
        stageCounts.map((item: any) => [item?.stage, item?.count]),
        [100, 12]
      )
    ),
    pageLine(people),
    formatPromptSection(
      "people",
      formatPromptTable(
        [
          "talent_id",
          "name",
          "email",
          "headline",
          "stage",
          "fit",
          "recommended",
          "updated",
        ],
        peopleItems.map((item: any) => [
          item?.talentId,
          item?.name,
          item?.email,
          item?.headline,
          item?.stage,
          item?.fitSummary,
          formatPromptDate(item?.recommendedAt),
          formatPromptDate(item?.updatedAt),
        ]),
        [100, 160, 180, 240, 100, 500, 10, 10]
      )
    ),
    formatPromptSection(
      "recent_updates",
      formatPromptTable(
        ["date", "talent_id", "candidate", "kind", "text", "details"],
        updates.map((item: any) => [
          formatPromptDate(item?.at),
          item?.talentId,
          item?.candidateName,
          item?.kind,
          item?.text,
          item?.metadata,
        ]),
        [10, 100, 160, 100, 700, 500]
      )
    ),
  ].join("\n");
}

export function serializeOrgAgentMoreData(value: OrgAgentMoreDataResult) {
  const blocks: string[] = [
    `requested=${value.requestedKinds.join(",") || EMPTY_CELL}`,
  ];
  if (value.members) {
    blocks.push(
      [
        `members_total=${value.members.totalCount} members_returned=${value.members.returnedCount} members_complete=${value.members.complete}`,
        formatPromptSection(
          "members",
          formatPromptTable(
            ["name", "email", "workspace_role"],
            value.members.items.map((item) => [
              item.name,
              item.email,
              item.role,
            ]),
            [120, 220, 80]
          )
        ),
      ].join("\n")
    );
  }
  if (value.companyDetails) {
    const keys = Object.keys(value.companyDetails.values).sort();
    blocks.push(
      [
        `company_details_complete=${value.companyDetails.complete}`,
        formatPromptSection(
          "company_details",
          formatPromptTable(
            ["key", "value", "complete", "truncated", "oversized"],
            keys.map((key) => {
              const state = value.companyDetails!.fields[key];
              const fieldValue = value.companyDetails!.values[key];
              return [
                key === "workspace_request"
                  ? "workspace_request (legacy)"
                  : key,
                COMPANY_DETAIL_LONG_KEYS_FOR_FORMAT.has(key)
                  ? formatPromptMarkdown(fieldValue, 12_000)
                  : fieldValue,
                state?.complete ?? true,
                state?.truncated ?? false,
                state?.oversized ?? false,
              ];
            }),
            [80, 12_000, 8, 8, 8]
          )
        ),
      ].join("\n")
    );
  }
  if (value.workspaceMemory) {
    blocks.push(
      [
        `workspace_memory_exists=${value.workspaceMemory.exists} workspace_memory_complete=${value.workspaceMemory.complete} workspace_memory_truncated=${value.workspaceMemory.truncated}`,
        formatPromptSection(
          "workspace_memory_markdown",
          formatPromptMarkdown(value.workspaceMemory.content, 12_000)
        ),
      ].join("\n")
    );
  }
  const serialized = blocks.join("\n");
  return serialized.length > 14_000
    ? `serialization_complete=false\nmessage=Output framing exceeded the safety limit; do not treat any long text in this result as complete.\n${serialized.slice(0, 13_860)}…`
    : serialized;
}

const COMPANY_DETAIL_LONG_KEYS_FOR_FORMAT = new Set([
  "company_description",
  "last_funding_round_description",
  "pitch",
  "short_description",
  "workspace_request",
]);

function formatUpdateDataResult(result: Record<string, any>) {
  const applyResult = asRecord(result.apply_result);
  return [
    `status=${formatPromptCell(result.status, 60)}`,
    `summary=${formatPromptCell(result.summary, 160)}`,
    ...(result.preview
      ? [
          formatPromptSection(
            "exact_change_preview",
            formatPromptMarkdown(result.preview, 3_000)
          ),
        ]
      : []),
    ...(result.presentation_text
      ? [
          formatPromptSection(
            "stored_presentation",
            formatPromptMarkdown(result.presentation_text, 6_000)
          ),
        ]
      : []),
    ...(result.instruction
      ? [`instruction=${formatPromptCell(result.instruction, 500)}`]
      : []),
    ...(applyResult.status
      ? [`apply_status=${formatPromptCell(applyResult.status, 60)}`]
      : []),
  ].join("\n");
}

function formatRoleStatusChangeResult(result: Record<string, any>) {
  return [
    `status=${formatPromptCell(result.status, 60)}`,
    `role=${formatPromptCell(result.roleName, 200)}`,
    `lifecycle=${humanizeOrgRoleStatus(result.roleStatus)}`,
    `effect=${formatPromptCell(result.effect, 500)}`,
  ].join("\n");
}

function formatCandidateConnectionDecisionResult(result: Record<string, any>) {
  return [
    `status=${formatPromptCell(result.status, 40)}`,
    `change=${formatPromptCell(result.changeSummary, 500)}`,
    `decision=${formatPromptCell(result.decision, 30)}`,
    `connection_method=${formatPromptCell(result.connectionMethod, 40)}`,
    `stage=${formatPromptCell(humanizeOrgStage(result.stage), 100)}`,
  ].join("\n");
}

function formatCandidateConnectionPreparationResult(
  result: Record<string, any>
) {
  return [
    `status=${formatPromptCell(result.status, 40)}`,
    `candidate=${formatPromptCell(result.candidateName, 160)}`,
    `candidate_email=${formatPromptCell(result.candidateEmail, 320)}`,
    `requester_email=${formatPromptCell(result.requesterEmail, 320)}`,
    `decision=${formatPromptCell(result.decision, 30)}`,
    `connection_method=${formatPromptCell(result.connectionMethod, 40)}`,
    `intro_email_available=${Boolean(result.introEmailAvailable)}`,
    `direct_contact_available=${Boolean(result.directContactAvailable)}`,
    `intro_recipients=${formatPromptCell(
      Array.isArray(result.introEmails) ? result.introEmails.join(", ") : null,
      1_000
    )}`,
    `reason=${formatPromptCell(result.reason, 1_000)}`,
  ].join("\n");
}

function formatCompanyTalentRequestResult(result: Record<string, any>) {
  if (result.status === "already_pending") {
    const existing = asRecord(result.existingRequest);
    const requested = asRecord(result.requested);
    return [
      "status=already_pending",
      `new_request_queued=${Boolean(result.newRequestQueued)}`,
      formatPromptSection(
        "requested_replacement",
        formatPromptTable(
          ["kind", "role", "topic"],
          [[requested.kind, requested.roleName, requested.topic]],
          [40, 160, 800]
        )
      ),
      formatPromptSection(
        "existing_request",
        Object.keys(existing).length > 0
          ? formatPromptTable(
              [
                "request_id",
                "kind",
                "role",
                "topic",
                "status",
                "scheduled_kst",
                "cancelable",
              ],
              [
                [
                  existing.requestId,
                  existing.kind,
                  existing.roleName,
                  existing.topic,
                  existing.status,
                  existing.scheduledAt,
                  existing.cancelable,
                ],
              ],
              [100, 80, 160, 800, 160, 40, 10]
            )
          : "private_conflict=true"
      ),
      `instruction=${formatPromptCell(result.instruction, 800)}`,
      `fallback_message=${formatPromptCell(result.userMessage, 1_200)}`,
    ].join("\n");
  }
  return [
    `status=${formatPromptCell(result.status, 40)}`,
    `message=${formatPromptCell(result.userMessage, 800)}`,
  ].join("\n");
}

function formatConversationHistoryResult(result: Record<string, any>) {
  const messages = Array.isArray(result.messages)
    ? result.messages.map(asRecord)
    : [];
  const participantAliases = new Map<string, string>();
  const threadAliases = new Map<string, string>();
  const participantLabel = (slackUserId: string) => {
    const existing = participantAliases.get(slackUserId);
    if (existing) return existing;
    const label = `Slack participant ${participantAliases.size + 1}`;
    participantAliases.set(slackUserId, label);
    return label;
  };
  const threadLabel = (message: Record<string, any>) => {
    if (message.currentThread) return "current_thread";
    const threadId = String(message.slackThreadId ?? "").trim();
    if (!threadId) return "unknown_thread";
    const existing = threadAliases.get(threadId);
    if (existing) return existing;
    const label = `thread_${threadAliases.size + 1}`;
    threadAliases.set(threadId, label);
    return label;
  };

  return [
    [
      "status=ok",
      `scope=${formatPromptCell(result.scope, 30)}`,
      `requested_limit=${Number(result.limit ?? 0)}`,
      `returned_items=${messages.length}`,
      `has_more=${Boolean(result.hasMore)}`,
      `next_cursor=${formatPromptCell(result.nextCursor, 500)}`,
      "order=oldest_to_newest",
    ].join(" "),
    formatPromptSection(
      "messages",
      formatPromptTable(
        [
          "channel",
          "thread",
          "thread_started_at",
          "sent_at",
          "speaker",
          "message",
        ],
        messages.map((message) => {
          const metadata = asRecord(message.metadata);
          const slackUserId = String(message.slackUserId ?? "").trim();
          const speaker =
            message.role === "assistant"
              ? "Harper"
              : String(metadata.slackUserName ?? "").trim() ||
                (slackUserId
                  ? participantLabel(slackUserId)
                  : "Slack participant");
          return [
            message.channelName,
            threadLabel(message),
            message.threadStartedAt,
            message.createdAt,
            speaker,
            message.content,
          ];
        }),
        [100, 40, 30, 30, 140, 900]
      )
    ),
  ].join("\n");
}

/**
 * Database-shaped objects remain useful internally, but are a poor LLM
 * boundary. Each tool gets a small schema-once view containing only facts the
 * model needs for its next decision.
 */
export function serializeOrgAgentToolResult(
  name: OrgAgentToolName,
  value: unknown
) {
  const result = asRecord(value);
  if (name === "get_talents") return formatTalentSearchResult(result);
  if (name === "read_talent") return formatTalentResult(result);
  if (name === "read_role") return formatRoleResult(result);
  if (name === "get_more_data") {
    return serializeOrgAgentMoreData(value as OrgAgentMoreDataResult);
  }
  if (name === "read_conversation_history") {
    return formatConversationHistoryResult(result);
  }
  if (name === "update_data") return formatUpdateDataResult(result);
  if (name === "change_role_status") {
    return formatRoleStatusChangeResult(result);
  }
  if (name === "contact_talent") {
    return formatCompanyTalentRequestResult(result);
  }
  if (name === "change_talent_contact") {
    return formatCompanyTalentRequestResult(result);
  }
  if (name === "decide_candidate_connection") {
    return formatCandidateConnectionDecisionResult(result);
  }
  if (name === "prepare_candidate_connection") {
    return formatCandidateConnectionPreparationResult(result);
  }
  const unsupported: never = name;
  throw new Error(`Unsupported tool result: ${unsupported}`);
}

export function serializeOrgAgentToolError(message: unknown) {
  return `status=error\nmessage=${formatPromptCell(message, 500)}`;
}
