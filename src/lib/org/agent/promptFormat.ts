import type { OrgAgentToolName } from "@/lib/org/agent/tools";

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
          "recommended",
        ],
        items.map((item: any) => [
          item?.candidate?.talentId,
          item?.candidate?.name,
          item?.candidate?.email,
          item?.candidate?.headline,
          item?.role?.roleId,
          item?.role?.name,
          item?.stage,
          item?.fitSummary,
          formatPromptDate(item?.recommendedAt),
        ]),
        [100, 140, 180, 180, 100, 160, 100, 400, 10]
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
          ["extras", profile.extras],
        ],
        [30, 4_000]
      )
    ),
    formatPromptSection(
      "experience",
      formatPromptTable(
        [
          "company",
          "role",
          "type",
          "location",
          "start",
          "end",
          "description",
          "memo",
        ],
        experiences.map((item: any) => [
          item?.company_name,
          item?.role,
          item?.employment_type,
          item?.company_location,
          formatPromptDate(item?.start_date),
          formatPromptDate(item?.end_date),
          item?.description,
          item?.memo,
        ]),
        [160, 160, 80, 120, 10, 10, 800, 400]
      )
    ),
    formatPromptSection(
      "education",
      formatPromptTable(
        ["school", "degree", "field", "start", "end", "description", "memo"],
        education.map((item: any) => [
          item?.school,
          item?.degree,
          item?.field,
          formatPromptDate(item?.start_date),
          formatPromptDate(item?.end_date),
          item?.description,
          item?.memo,
        ]),
        [180, 120, 160, 10, 10, 500, 300]
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
          item?.stage,
          item?.fitSummary,
          item?.fitReasons,
          item?.existingFeedback,
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
    result.profileIncluded && Object.keys(profile).length > 0
      ? formatTalentProfile(profile)
      : "profile_included=false",
  ].join("\n");
}

function formatRoleResult(result: Record<string, any>) {
  const role = asRecord(result.role);
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
          ["status", role.status],
          ["location", role.locationText],
          ["work_mode", role.workMode],
          ["employment", role.employmentTypes],
          ["external_jd_url", role.externalJdUrl],
          ["request", role.request],
          ["description", role.description],
          ["updated", formatPromptDate(role.updatedAt)],
        ],
        [40, 20_000]
      )
    ),
    formatPromptSection(
      "stages",
      formatPromptTable(
        ["id", "label"],
        stages.map((item: any) => [item?.id, item?.label]),
        [100, 120]
      )
    ),
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

function formatUpdateResult(
  name: "update_company" | "update_role",
  result: Record<string, any>
) {
  const role = asRecord(result.role);
  const company = asRecord(result.company);
  return [
    `status=${formatPromptCell(result.status, 40)}`,
    `change=${formatPromptCell(result.changeSummary, 500)}`,
    ...(name === "update_role"
      ? [
          `role_id=${formatPromptCell(result.roleId ?? role.roleId, 100)}`,
          `role=${formatPromptCell(role.name, 160)}`,
        ]
      : [`company=${formatPromptCell(company.companyName, 160)}`]),
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
  return formatUpdateResult(name, result);
}

export function serializeOrgAgentToolError(message: unknown) {
  return `status=error\nmessage=${formatPromptCell(message, 500)}`;
}
