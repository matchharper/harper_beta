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

export function formatOrgAgentCompanyContext(args: {
  companyDetailsAvailable: boolean;
  companyName: string;
  pitch: string | null;
  workspaceMemoryAvailable: boolean;
  workspaceRequestExists: boolean;
}) {
  return [
    formatPromptTable(
      ["field", "value"],
      [
        ["company_name", args.companyName],
        ["pitch_document_exists", Boolean(String(args.pitch ?? "").trim())],
        ["pitch_document_complete", true],
        ["workspace_request_exists", args.workspaceRequestExists],
        ["company_details_available", args.companyDetailsAvailable],
        ["workspace_memory_available", args.workspaceMemoryAvailable],
      ],
      [40, 1_000]
    ),
    formatPromptSection(
      "company_information_document",
      formatPromptMarkdown(args.pitch, Number.MAX_SAFE_INTEGER)
    ),
  ].join("\n");
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
  const extras = Array.isArray(profile.extras) ? profile.extras : [];
  return [
    formatPromptSection(
      "profile_summary",
      formatPromptTable(
        ["field", "value"],
        [
          ["location", profile.location],
          ["bio", profile.bio],
        ],
        [30, 2_000]
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
    formatPromptSection(
      "extras",
      formatPromptTable(
        ["title", "date", "description"],
        extras.map((item: any) => [item?.title, item?.date, item?.description]),
        [300, 100, 1_000]
      )
    ),
  ].join("\n");
}

function formatSingleTalentResult(result: Record<string, any>) {
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
  const meetingHistory = Array.isArray(result.meetingHistory)
    ? result.meetingHistory
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
          "closure_notice",
          "closure_notice_at",
          "closure_notice_channel",
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
          item?.processClosureNotification?.status,
          formatPromptDate(item?.processClosureNotification?.deliveredAt),
          item?.processClosureNotification?.sentChannel,
          item?.fitSummary,
          item?.fitReasons,
          humanizeOrgFeedback(item?.existingFeedback),
          item?.feedbackReason,
          item?.talentMemo,
          item?.tradeoffs,
          formatPromptDate(item?.recommendedAt),
          formatPromptDate(item?.updatedAt),
        ]),
        [100, 160, 100, 30, 10, 40, 700, 500, 300, 400, 700, 1_000, 10, 10]
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
        [10, 100, 160, 100, 2_000, 500]
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
          "approved_kst",
          "updated_kst",
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
          item?.approvedAt,
          item?.updatedAt,
          item?.scheduledAt,
          item?.roleName,
          item?.label,
          item?.topic,
          item?.status,
          item?.cancelable,
        ]),
        [100, 40, 40, 40, 40, 160, 180, 800, 160, 10]
      )
    ),
    formatPromptSection(
      "meeting_coordination",
      formatPromptTable(
        [
          "role",
          "process",
          "purpose",
          "duration_minutes",
          "coordination_state",
          "candidate_invitation",
          "invitation_scheduled_kst",
          "invitation_sent_kst",
          "candidate_context_changeable",
          "confirmed_start_kst",
          "confirmed_end_kst",
        ],
        meetingHistory.map((item: any) => [
          item?.roleName,
          item?.processStageName,
          item?.meetingPurpose,
          item?.durationMinutes,
          item?.coordinationState,
          item?.invitationState,
          item?.invitationScheduledAt,
          item?.invitationSentAt,
          item?.canReviseCandidateContext,
          item?.confirmedStartAt,
          item?.confirmedEndAt,
        ]),
        [160, 120, 700, 20, 180, 220, 40, 40, 10, 40, 40]
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

const BATCH_TALENT_RESULT_CONTENT_BUDGET = 42_000;

function formatBoundedTalentResult(
  result: Record<string, any>,
  index: number,
  total: number
) {
  const serialized = formatSingleTalentResult(result);
  const itemBudget = Math.max(
    2_000,
    Math.floor(BATCH_TALENT_RESULT_CONTENT_BUDGET / Math.max(1, total))
  );
  const suffix = [
    "",
    "detail_complete=false",
    "message=This candidate detail was clipped to fit the batch result. Re-read only this talent ID when exact remaining detail is needed.",
  ].join("\n");
  const complete = serialized.length <= itemBudget;
  const content = complete
    ? serialized
    : `${serialized.slice(0, Math.max(0, itemBudget - suffix.length))}${suffix}`;
  return [
    `<talent index="${index + 1}" detail_complete="${complete}">`,
    content,
    "</talent>",
  ].join("\n");
}

function formatTalentResult(result: Record<string, any>) {
  if (!Array.isArray(result.items)) return formatSingleTalentResult(result);
  const items = result.items.map(asRecord);
  const notFoundTalentIds = Array.isArray(result.notFoundTalentIds)
    ? result.notFoundTalentIds
    : [];
  return [
    "status=ok",
    [
      `requested_count=${Number(result.requestedCount ?? items.length)}`,
      `returned_count=${Number(result.returnedCount ?? items.length)}`,
      `not_found_count=${notFoundTalentIds.length}`,
    ].join(" "),
    formatPromptSection(
      "talents",
      items.length > 0
        ? items
            .map((item, index) =>
              formatBoundedTalentResult(item, index, items.length)
            )
            .join("\n")
        : EMPTY_CELL
    ),
    formatPromptSection(
      "not_found_talent_ids",
      formatPromptTable(
        ["talent_id"],
        notFoundTalentIds.map((talentId) => [talentId]),
        [100]
      )
    ),
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
          ["salary", role.salaryRange],
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
    completeness.role_criteria?.included
      ? [
          `role_criteria_complete=${Boolean(completeness.role_criteria.complete)}`,
          formatPromptSection(
            "structured_role_criteria",
            formatPromptTable(
              ["name", "criteria"],
              (Array.isArray(role.criteria) ? role.criteria : []).map(
                (item: any) => [item?.name, item?.criteria]
              ),
              [200, 8_000]
            )
          ),
        ].join("\n")
      : "role_criteria_included=false",
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
        ["stage_id", "label", "kind", "sort_order"],
        stages.map((item: any) => [
          item?.stageId,
          item?.label,
          item?.kind,
          item?.sortOrder,
        ]),
        [100, 120, 40, 12]
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
          "current_stage_id",
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
          item?.currentStageId,
          item?.currentStageLabel ?? item?.stage,
          item?.fitSummary,
          formatPromptDate(item?.recommendedAt),
          formatPromptDate(item?.updatedAt),
        ]),
        [100, 160, 180, 240, 100, 100, 500, 10, 10]
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

const COMPANY_DETAIL_LONG_KEYS_FOR_FORMAT = new Set(["workspace_request"]);

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
    `expectation=${formatPromptCell(result.expectation, 800)}`,
    `next_process=${formatPromptCell(result.nextProcess, 800)}`,
  ].join("\n");
}

function formatRolePipelineStageChangeResult(result: Record<string, any>) {
  const stages = Array.isArray(result.stages) ? result.stages : [];
  return [
    `status=${formatPromptCell(result.status, 60)}`,
    `action=${formatPromptCell(result.action, 30)}`,
    `role=${formatPromptCell(result.roleName, 200)}`,
    `summary=${formatPromptCell(result.summary, 500)}`,
    ...(stages.length > 0
      ? [
          formatPromptSection(
            "affected_stages",
            formatPromptTable(
              ["stage_id", "label", "status"],
              stages.map((stage: any) => [
                stage?.id,
                stage?.label,
                stage?.status,
              ]),
              [100, 120, 40]
            )
          ),
        ]
      : []),
    "candidate_moved=false candidate_contacted=false",
  ].join("\n");
}

function formatCandidateStageMoveResult(result: Record<string, any>) {
  const meeting = asRecord(result.meeting);
  const meetingDraft = asRecord(result.meetingDraft);
  const meetingConfig = asRecord(meetingDraft.config);
  const meetingStage = asRecord(meetingDraft.meetingStage);
  const availability = asRecord(result.organizerAvailability);
  const delivery = asRecord(result.delivery);
  const candidateName = formatPromptCell(result.candidateName, 160);
  const from = formatPromptCell(result.previousStageLabel, 120);
  const to = formatPromptCell(result.stageLabel, 120);
  const roleName = formatPromptCell(result.roleName, 200);
  if (result.status === "meeting_setup_required") {
    const facts = [
      `${candidateName} remains in the ${from} stage of the ${roleName} hiring process. The intended next stage is ${to}.`,
      "No candidate message or meeting request has been created, and the candidate has not been moved.",
    ];
    if (meetingDraft.draftBlocker === "availability_missing") {
      facts.push(
        "The next required input is the company organizer's reusable working availability. Ask the Slack user to describe the days, time range, and timezone if it is not already clear from the workspace.",
        "After the organizer supplies it, save that availability and continue this already-authorized candidate meeting request in the same tool loop. Move the candidate to the intended stage and arrange the time-selection invitation without asking for another approval."
      );
    } else if (meetingDraft.draftBlocker === "organizer_email_missing") {
      facts.push(
        "The next required input is a verified company email address for the meeting organizer. Explain where the company can correct it and that the candidate remains untouched."
      );
    } else {
      facts.push(
        "The next required input is reusable guidance for this process stage: what the meeting is for, how long it lasts, and any context that would help the candidate."
      );
    }
    if (meetingConfig.meetingPurpose || meetingConfig.durationMinutes) {
      facts.push(
        `The intended meeting purpose is ${formatPromptCell(meetingConfig.meetingPurpose, 700)} and the intended duration is ${formatPromptCell(meetingConfig.durationMinutes, 20)} minutes.`
      );
    }
    if (meetingStage.candidateMessage) {
      facts.push(
        `The saved candidate-facing context for this stage is: ${formatPromptCell(meetingStage.candidateMessage, 1_500)}`
      );
    }
    facts.push(
      "Write a natural recruiting-coordinator response that acknowledges what was completed in earlier tool calls during this turn, explains the one remaining prerequisite and the continuation that will follow, and preserves the verified no-contact boundary."
    );
    return facts.join("\n");
  }
  const facts = [
    from === to
      ? `${candidateName} remains in the ${to} stage of the ${roleName} hiring process.`
      : `${candidateName} is in the ${roleName} hiring process. The stage changed from ${from} to ${to}.`,
  ];

  if (result.scheduleId) {
    const deliveryChange = String(delivery.change ?? "");
    facts.push(
      `The organizer's saved availability now used for this and future meeting choices is ${formatPromptCell(availability.summary, 800)} in ${formatPromptCell(availability.timezone, 120)}.`,
      `This meeting is for ${formatPromptCell(meeting.purpose, 700)}, lasts ${formatPromptCell(meeting.durationMinutes, 20)} minutes, and belongs to the ${formatPromptCell(meeting.stageName, 120)} stage. The candidate may choose among times in the next ${formatPromptCell(meeting.offerWindowDays, 20)} days.`,
      deliveryChange === "revised"
        ? "The candidate-facing context on the existing scheduled invitation was revised without creating another delivery."
        : deliveryChange === "revised_and_expedited"
          ? "The candidate-facing context on the existing invitation was revised and that same invitation was moved forward for immediate delivery without creating another delivery."
          : deliveryChange === "expedited"
            ? "The same existing invitation was moved forward for immediate delivery without creating another delivery."
            : deliveryChange === "already_scheduled"
              ? "The same meeting invitation was already scheduled, so Harper did not create a duplicate delivery."
              : "Harper created one candidate time-selection invitation for this meeting.",
      delivery.sentAt
        ? "The candidate's time-selection message has already been delivered."
        : deliveryChange === "expedited" ||
            deliveryChange === "revised_and_expedited"
          ? `Immediate delivery has been requested for the existing invitation, but completed delivery is not yet verified. Its current scheduled time is ${formatPromptCell(delivery.scheduledAt, 100)}.`
          : `The candidate has not received the time-selection message yet. The standard delivery delay is ${formatPromptCell(delivery.delayMinutes, 20)} minutes, and this invitation is scheduled for ${formatPromptCell(delivery.scheduledAt, 100)}. Until delivery starts, candidate-facing context added in this conversation can revise this same scheduled invitation.`,
      "Preserve this verified sequence when explaining Calendar behavior: (1) opening the selection link refreshes the company's connected organizer Google Calendar; (2) blocking events and times outside saved availability are removed before choices are shown; (3) the candidate selects from the remaining choices; (4) only then are the Calendar event and Google Meet created."
    );
    if (meeting.candidateMessage) {
      facts.push(
        `The candidate-facing context included with this request is: ${formatPromptCell(meeting.candidateMessage, 2_000)}`
      );
    }
    if (result.schedulingSettingsUrl) {
      facts.push(
        `If the company wants to refine allowed or blocked times before delivery, the verified optional scheduling settings page is ${formatPromptCell(result.schedulingSettingsUrl, 2_000)}.`
      );
    }
    facts.push(
      "Write the final response as the recruiting coordinator continuing from the user's latest message. Explain its practical effect, the candidate-specific action that followed, and the current delivery boundary. While delivery is still queued, treat adding candidate-facing context to this same invitation as the most immediate optional next action; the settings page is a secondary availability adjustment. Choose the wording and length for this conversation; do not reproduce these sentences as a receipt."
    );
  } else {
    facts.push(
      "No candidate message or meeting request was created by this stage-only change. Explain the result naturally from the user's latest request."
    );
  }
  return facts.join("\n");
}

function formatCandidateConnectionDecisionResult(result: Record<string, any>) {
  const candidateName = formatPromptCell(result.candidateName, 160);
  const roleName = formatPromptCell(result.roleName, 200);
  const facts = [
    `${candidateName}'s ${roleName} hiring process changed as follows: ${formatPromptCell(result.changeSummary, 800)}.`,
  ];
  if (result.reactivation) {
    facts.push(
      "This action reopened a process that had previously been closed for this candidate and role."
    );
  }

  if (result.connectionMethod === "schedule_interview") {
    const meeting = asRecord(result.meeting);
    const availability = asRecord(result.organizerAvailability);
    const delivery = asRecord(result.delivery);
    facts.push(
      `The organizer's saved availability used for this and future meeting choices is ${formatPromptCell(availability.summary, 800)} in ${formatPromptCell(availability.timezone, 120)}.`,
      `This meeting is for ${formatPromptCell(meeting.purpose, 700)}, lasts ${formatPromptCell(meeting.durationMinutes, 20)} minutes, and belongs to the ${formatPromptCell(meeting.stageName, 120)} stage. The candidate may choose among times in the next ${formatPromptCell(meeting.offerWindowDays, 20)} days.`,
      delivery.sentAt
        ? "The candidate's time-selection message has already been delivered."
        : `The candidate has not received the time-selection message yet. The standard delivery delay is ${formatPromptCell(delivery.delayMinutes, 20)} minutes, and this invitation is scheduled for ${formatPromptCell(delivery.scheduledAt, 100)}. Until delivery starts, candidate-facing context added in this conversation can revise this same scheduled invitation.`,
      "Preserve this verified sequence when explaining Calendar behavior: (1) opening the selection link refreshes the company's connected organizer Google Calendar; (2) blocking events and times outside saved availability are removed before choices are shown; (3) the candidate selects from the remaining choices; (4) only then are the Calendar event and Google Meet created."
    );
    if (meeting.candidateMessage) {
      facts.push(
        `The candidate-facing context included with this request is: ${formatPromptCell(meeting.candidateMessage, 2_000)}`
      );
    }
    if (result.schedulingSettingsUrl) {
      facts.push(
        `The verified optional page for refining allowed or blocked times is ${formatPromptCell(result.schedulingSettingsUrl, 2_000)}.`
      );
    }
  } else if (result.nextProcess) {
    facts.push(formatPromptCell(result.nextProcess, 1_000));
  }

  facts.push(
    "Write the final response from the latest company message and these verified effects. Use natural recruiting-coordinator judgment rather than turning the facts into a status receipt."
  );
  return facts.join("\n");
}

function formatCandidateConnectionPreparationResult(
  result: Record<string, any>
) {
  const meetingDraft = asRecord(result.meetingDraft);
  const meetingConfig = asRecord(meetingDraft.config);
  const meetingStage = asRecord(meetingDraft.meetingStage);
  return [
    ...(result.connectionMethod === "schedule_interview"
      ? [
          "response_mode=meeting_coordinator_narrative",
          result.status === "meeting_setup_required"
            ? meetingDraft.draftBlocker === "meeting_stage_missing"
              ? "user_facing_state=Harper can coordinate this meeting, but first needs this process stage's topic, duration, and any candidate-facing context. Nothing has been sent to the candidate."
              : "user_facing_state=Harper can coordinate this meeting, but the organizer needs to share availability first. Nothing has been sent to the candidate."
            : "user_facing_state=This is a proposal awaiting company confirmation. The candidate is not connected by this result, the meeting details are not saved yet, and no email has been sent.",
        ]
      : []),
    `status=${formatPromptCell(result.status, 40)}`,
    `candidate=${formatPromptCell(result.candidateName, 160)}`,
    `candidate_email=${formatPromptCell(result.candidateEmail, 320)}`,
    `requester_email=${formatPromptCell(result.requesterEmail, 320)}`,
    `decision=${formatPromptCell(result.decision, 30)}`,
    `current_stage=${formatPromptCell(
      humanizeOrgStage(result.currentStage),
      100
    )}`,
    `reactivation=${Boolean(result.reactivation)}`,
    `closure_notice_delivered=${Boolean(result.closureNotificationDelivered)}`,
    `closure_notice_delivered_at=${formatPromptCell(
      result.closureNotificationDeliveredAt,
      40
    )}`,
    `closure_notice_channel=${formatPromptCell(
      result.closureNotificationSentChannel,
      40
    )}`,
    `connection_method=${formatPromptCell(result.connectionMethod, 40)}`,
    `process_stage=${formatPromptCell(result.processStageName, 120)}`,
    formatPromptSection(
      "available_process_stages",
      Array.isArray(result.availableProcessStages) &&
        result.availableProcessStages.length > 0
        ? formatPromptTable(
            ["stage_id", "label"],
            result.availableProcessStages.map((stage: Record<string, any>) => [
              stage.id,
              stage.label,
            ]),
            [100, 160]
          )
        : "none"
    ),
    `intro_email_available=${Boolean(result.introEmailAvailable)}`,
    `direct_contact_available=${Boolean(result.directContactAvailable)}`,
    `intro_recipients=${formatPromptCell(
      Array.isArray(result.introEmails) ? result.introEmails.join(", ") : null,
      1_000
    )}`,
    `meeting_title=${formatPromptCell(meetingConfig.title, 240)}`,
    `meeting_duration_minutes=${formatPromptCell(
      meetingConfig.durationMinutes,
      20
    )}`,
    `meeting_purpose=${formatPromptCell(meetingConfig.meetingPurpose, 700)}`,
    `meeting_stage=${formatPromptCell(meetingConfig.processStageName, 120)}`,
    `meeting_stage_source=${formatPromptCell(meetingStage.source, 40)}`,
    `meeting_draft_blocker=${formatPromptCell(meetingDraft.draftBlocker, 80)}`,
    `meeting_confirmation=${formatPromptCell(
      result.meetingScheduleConfirmation,
      4_000
    )}`,
    ...(result.connectionMethod === "schedule_interview"
      ? [
          "writing_instruction=Preserve meeting_confirmation's conversational paragraph order and factual state. This preparation result is a preview, including after the user revises details: use intended language such as '~로 준비할게요' or '~로 바꿔 준비하면 돼요', never completed language such as '업데이트했어요' or '반영했어요'. You may adapt the opening to the visible conversation, but do not turn it into a field list. Omit the automatic meeting title unless the user explicitly asked about or changed it.",
        ]
      : []),
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
  if (
    result.status === "draft" ||
    result.status === "draft_revised" ||
    result.status === "confirmation_required"
  ) {
    return [
      `status=${formatPromptCell(result.status, 40)}`,
      `candidate=${formatPromptCell(result.candidateName, 160)}`,
      "nothing_sent=true",
      "exact_body_appended_by_server=true",
      "writing_instruction=Write the surrounding confirmation yourself in the latest user's language as two or three short, conversational sentences. Lead with the help Harper will provide for this specific candidate, not a report that a draft or message was prepared. Naturally convey all three facts: Harper will ask the candidate and bring the answer back here; nothing has been sent yet; the company should check the body once. Ask exactly one natural confirmation question, with only one question mark in the whole reply. The appended body already owns the request context, so the surrounding prose may name the candidate but must not repeat the company name, Role title, subject, or body. Do not copy a fixed template, prescribe exact reply words such as '보내줘', or use workflow language such as 승인, 화면에 표시된, draft, revision, or status.",
    ].join("\n");
  }
  return [
    `status=${formatPromptCell(result.status, 40)}`,
    result.scheduledAt
      ? `scheduled_at=${formatPromptCell(result.scheduledAt, 100)}`
      : null,
    `message=${formatPromptCell(result.userMessage, 800)}`,
  ]
    .filter(Boolean)
    .join("\n");
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
  if (name === "start_role_creation") {
    const requiredContinuationLink = String(
      result.requiredContinuationLink ?? ""
    ).trim();
    const exactRequiredContinuationLink =
      /^<https:\/\/[^<>|\s]+\|새로운 채용 등록 이어가기>$/.test(
        requiredContinuationLink
      )
        ? requiredContinuationLink
        : EMPTY_CELL;
    const sanitizedExample = formatPromptCell(result.responseExample, 3_000);
    const illustrativeResponse =
      exactRequiredContinuationLink === EMPTY_CELL
        ? sanitizedExample
        : sanitizedExample.replaceAll(
            formatPromptCell(requiredContinuationLink, 1_200),
            exactRequiredContinuationLink
          );
    return [
      `status=${formatPromptCell(result.status, 30)}`,
      `role_title=${formatPromptCell(result.roleTitle, 200)}`,
      `required_continuation_link=${exactRequiredContinuationLink}`,
      `response_guidance=${formatPromptCell(result.responseGuidance, 3_000)}`,
      `illustrative_response=${illustrativeResponse}`,
      "instruction=Write the final reply yourself in Harper's natural recruiting-partner voice. The example is illustrative, not fixed copy. Include required_continuation_link exactly once, use its label nowhere else as a heading or repeated CTA, and do not continue role discovery in the current conversation.",
    ].join("\n");
  }
  if (name === "web_search" || name === "open_url") {
    return `status=success\n${JSON.stringify(result, null, 2).slice(0, 40_000)}`;
  }
  if (name === "get_talents") return formatTalentSearchResult(result);
  if (name === "read_talent") return formatTalentResult(result);
  if (name === "read_role") return formatRoleResult(result);
  if (name === "calibrate_role_hiring_brief") {
    return [
      `status=${formatPromptCell(result.status, 30)}`,
      `role_name=${formatPromptCell(result.roleName, 200)}`,
      `reference_count=${formatPromptCell(result.referenceCount, 20)}`,
      `summary=${formatPromptCell(result.summary, 600)}`,
      `follow_up_question=${formatPromptCell(result.followUpQuestion, 1_000)}`,
      `failed_reference_urls=${formatPromptCell(result.failedReferenceUrls, 2_000)}`,
      "instruction=Explain the updated decision boundary concisely. Do not reproduce profile biographies or the full Hiring Brief. Ask follow_up_question only when it is not empty.",
    ].join("\n");
  }
  if (name === "get_more_data") {
    return serializeOrgAgentMoreData(value as OrgAgentMoreDataResult);
  }
  if (name === "read_conversation_history") {
    return formatConversationHistoryResult(result);
  }
  if (name === "update_data" || name === "update_role_criteria") {
    return formatUpdateDataResult(result);
  }
  if (name === "change_role_status") {
    return formatRoleStatusChangeResult(result);
  }
  if (name === "manage_role_pipeline_stages") {
    return formatRolePipelineStageChangeResult(result);
  }
  if (name === "move_candidate_stage") {
    return formatCandidateStageMoveResult(result);
  }
  if (name === "manage_interview_availability") {
    return [
      `The current organizer's working meeting availability is now ${formatPromptCell(result.summary, 1_000)} in ${formatPromptCell(result.timezone, 128)}. Harper will use it as the basis for future meeting choices.`,
      "This availability change alone does not move or contact a candidate.",
      formatPromptCell(result.nextProcess, 1_000),
      formatPromptCell(result.responseGuidance, 1_000),
      "Continue a fully identified candidate meeting request in this tool loop. Otherwise explain the practical effect of the organizer's latest instruction in a natural final response.",
    ].join("\n");
  }
  if (name === "contact_talent") {
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
