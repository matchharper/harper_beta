import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { createHash } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { normalizeProfileDate } from "@/lib/talentOnboarding/profileDate";
import { formatLlmDateTime, formatLlmPartialDate } from "@/lib/llm/promptDateTime";
import {
  listProfiles,
  readProfile,
  readProfileSnapshot,
  writeProfileSnapshot,
  type ProfileSnapshot,
  type StoredProfile,
} from "./store";

const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
export function profileToolContext(
  context: TalentToolExecutionContext | undefined,
  name: string,
  input: Record<string, unknown>,
  options: { readOnly?: boolean } = {}
) {
  if (!context?.admin || !context.userId)
    throw new Error(`${name} requires an authenticated user.`);
  const request =
    context.resumeRequestId ??
    context.userMessageId ??
    context.toolCallId ??
    (options.readOnly ? "read" : null);
  if (!request) throw new Error(`${name} requires an operation identifier.`);
  return {
    admin: context.admin as TalentAdminClient,
    userId: context.userId,
    operationId: `${request}:${name}:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`,
    source: {
      conversationId: context.conversationId,
      userMessageId: context.userMessageId,
      toolCallId: context.toolCallId,
      voiceEventId: context.voiceEventId,
    },
  };
}
const userFields = [
  "name",
  "headline",
  "bio",
  "location",
  "current_location",
  "phone_number",
  "profile_picture",
  "resume_links",
];
const rowFields: Record<string, string[]> = {
  experience: [
    "role",
    "company_name",
    "company_link",
    "company_location",
    "company_logo",
    "company_id",
    "employment_type",
    "start_date",
    "end_date",
    "description",
    "memo",
    "months",
  ],
  education: [
    "school",
    "degree",
    "field",
    "start_date",
    "end_date",
    "url",
    "description",
    "memo",
  ],
  extra: ["title", "date", "description", "memo"],
};
const rowKeys = {
  experience: "talentExperiences",
  education: "talentEducations",
  extra: "talentExtras",
} as const;

/** Pure edit preparation: the database commits this whole snapshot with one revision CAS. */
export function applyProfileEdits(
  snapshot: ProfileSnapshot,
  input: Record<string, unknown>,
  operationId: string
): ProfileSnapshot {
  const next = structuredClone(snapshot),
    userPatch = object(input.talentUser);
  for (const [key, value] of Object.entries(userPatch)) {
    if (!userFields.includes(key))
      throw new Error(`Unsupported profile field: ${key}`);
    if (
      key === "resume_links"
        ? !Array.isArray(value)
        : value !== null && typeof value !== "string"
    )
      throw new Error(`Invalid profile field: ${key}`);
    (next.talentUser as Record<string, unknown>)[key] = value;
  }
  if (input.profileLinks !== undefined) {
    if (!Array.isArray(input.profileLinks))
      throw new Error("profileLinks must be an array.");
    let links = Array.isArray(next.talentUser?.resume_links)
      ? ([...next.talentUser.resume_links] as string[])
      : [];
    for (const raw of input.profileLinks) {
      const change = object(raw),
        url = String(change.url ?? "");
      if (!url) throw new Error("A profile link URL is required.");
      if (change.action === "add") links = [...new Set([...links, url])];
      else if (change.action === "delete")
        links = links.filter((link) => link !== url);
      else throw new Error("Unknown profile link operation.");
    }
    next.talentUser!.resume_links = links;
  }
  const rows = input.rows ?? [];
  if (!Array.isArray(rows)) throw new Error("rows must be an array.");
  for (let index = 0; index < rows.length; index++) {
    const change = object(rows[index]),
      type = String(change.type),
      key = rowKeys[type as keyof typeof rowKeys];
    if (!key) throw new Error("Unknown profile row type.");
    const entries = next[key] as unknown as Record<string, any>[],
      patch = object(change.fields);
    for (const [field, value] of Object.entries(patch)) {
      if (
        !rowFields[type].includes(field) ||
        (value !== null &&
          typeof value !== "string" &&
          !(field === "months" && typeof value === "number"))
      )
        throw new Error(`Invalid ${type} field: ${field}`);
      if (type !== "extra" && ["start_date", "end_date"].includes(field))
        patch[field] = normalizeProfileDate(
          value,
          field === "start_date" ? "start" : "end"
        );
    }
    const at = entries.findIndex(
      (row) => String(row.id) === String(change.rowId)
    );
    if (change.operation === "add") {
      const digest = createHash("sha256")
        .update(`${operationId}:${type}:${index}`)
        .digest();
      const id =
        type === "extra"
          ? `extra_${digest.toString("hex").slice(0, 24)}`
          : digest.readUIntBE(0, 6);
      if (!entries.some((row) => row.id === id)) entries.push({ id, ...patch });
    } else {
      if (at < 0) throw new Error("Profile row not found.");
      if (change.operation === "update")
        entries[at] = { ...entries[at], ...patch };
      else if (change.operation === "delete") entries.splice(at, 1);
      else throw new Error("Unknown profile row operation.");
    }
  }
  if (input.rowMemos !== undefined) {
    if (!Array.isArray(input.rowMemos))
      throw new Error("rowMemos must be an array.");
    for (const raw of input.rowMemos) {
      const edit = object(raw),
        key = rowKeys[edit.type as keyof typeof rowKeys];
      const row = key
        ? (next[key] as unknown as Record<string, any>[]).find(
            (item) => String(item.id) === String(edit.rowId)
          )
        : null;
      if (!row || typeof edit.memo !== "string")
        throw new Error("Profile memo row not found.");
      if (edit.operation === "append")
        row.memo = [row.memo, edit.memo].filter(Boolean).join("\n");
      else if (edit.operation === "update") row.memo = edit.memo;
      else throw new Error("Unknown memo operation.");
    }
  }
  return next;
}

export async function executeUpdateProfile(
  input: Record<string, unknown>,
  context: TalentToolExecutionContext | undefined
) {
  const args = profileToolContext(context, "update_talent_profile", input),
    action = String(input.action ?? "update") as Parameters<
      typeof writeProfileSnapshot
    >[0]["action"];
  const profileId =
    typeof input.profileId === "string" ? input.profileId : undefined;
  const current = await readProfileSnapshot({
    ...args,
    profileId,
    ...(action === "copy" && typeof input.expectedRevision === "number"
      ? { revision: input.expectedRevision }
      : {}),
  });
  const expectedRevision =
    typeof input.expectedRevision === "number"
      ? input.expectedRevision
      : current.revision;
  const snapshot =
    action === "create" && input.snapshot
      ? (input.snapshot as ProfileSnapshot)
      : applyProfileEdits(current.snapshot, input, args.operationId);
  return writeProfileSnapshot({
    ...args,
    action,
    profileId: profileId ?? current.profileId,
    expectedRevision,
    snapshot,
    title: typeof input.title === "string" ? input.title : undefined,
    purpose: typeof input.purpose === "string" ? input.purpose : undefined,
  });
}

export function formatProfileToolResult(name: string, value: unknown): string {
  const result = object(value);
  if (name === "list_profiles")
    return [
      "Profiles (timezone: Asia/Seoul)",
      ...(result.compatibility === "existing_profile"
        ? [
            "The current profile is available through read_profile with no profileId or revision. Profile variants and version history are unavailable.",
          ]
        : []),
      ...(result.profiles ?? []).map(
        (p: any) =>
          `- ${p.title}; profileId=${p.id}; revision=${p.current_revision}${p.is_default ? "; default" : ""}${p.is_archived ? "; archived" : ""}${p.purpose ? `; purpose=${p.purpose}` : ""}; updated ${formatLlmDateTime(p.updated_at)}`
      ),
      `Next cursor: ${result.nextCursor ?? "none"}`,
    ].join("\n");
  const profile = result as StoredProfile,
    snapshot = profile.snapshot;
  if (!snapshot) return "Profile operation did not return a saved snapshot.";
  const user: Record<string, any> = snapshot.talentUser ?? {},
    lines = [
      ...(result.compatibility === "existing_profile"
        ? [
            "Current profile. Profile variants, revision identifiers and version history are unavailable.",
          ]
        : [
            `Profile${profile.title ? `: ${profile.title}` : ""}; profileId=${profile.profileId}; revision=${profile.revision}${profile.isDefault ? "; default" : ""}${profile.isArchived ? "; archived" : ""}; times: Asia/Seoul`,
            ...(profile.purpose ? [`Purpose: ${profile.purpose}`] : []),
          ]),
    ];
  const included = (section: string) =>
    !Array.isArray(result.sections) || result.sections.includes(section);
  for (const key of [
    "name",
    "email",
    "phone_number",
    "headline",
    "bio",
    "location",
    "current_location",
    "resume_links",
  ])
    if (included("talentUser") && user[key] && (!Array.isArray(user[key]) || user[key].length))
      lines.push(
        `${key}: ${Array.isArray(user[key]) ? user[key].join(", ") : user[key]}`
      );
  for (const [label, rows] of [
    ["Experience", snapshot.talentExperiences],
    ["Education", snapshot.talentEducations],
    ["Other", snapshot.talentExtras],
  ] as const) {
    if (
      !included(
        label === "Experience"
          ? "experience"
          : label === "Education"
            ? "education"
            : "extra"
      )
    )
      continue;
    lines.push(`${label}:`);
    if (!rows.length) lines.push("No saved rows in this section.");
    for (const raw of rows) {
      const row = raw as unknown as Record<string, any>;
      lines.push(
        `- RowID=${row.id}; ${[row.role ?? row.degree ?? row.title, row.company_name ?? row.school, row.field, row.employment_type, row.company_location, row.start_date ? `start: ${formatLlmPartialDate(row.start_date)}` : null, label !== "Other" ? `end: ${row.end_date ? formatLlmPartialDate(row.end_date) : "not recorded; current employment/enrollment unconfirmed"}` : null, typeof row.months === "number" ? `${row.months} months` : null, row.date ? formatLlmPartialDate(row.date) : null].filter(Boolean).join(" · ")}`
      );
      if (row.description) lines.push(`  ${row.description}`);
      if (row.memo) lines.push(`  Private memo: ${row.memo}`);
    }
  }
  if (Array.isArray(result.sections))
    lines.push(`Included sections: ${result.sections.join(", ")}. Other sections were not read; read_profile can retrieve them.`);
  if (result.revisionSource) lines.push(
    `Revision saved ${formatLlmDateTime(result.revisionSource.created_at)}; source references: ${JSON.stringify(result.revisionSource.source ?? {})}. These identify the editing context, not independent verification of every profile claim.`
  );
  if (result.sourceMessage) lines.push(
    `Original ${result.sourceMessage.role} message ${result.sourceMessage.id}; ${formatLlmDateTime(result.sourceMessage.createdAt)}:\n${result.sourceMessage.content}`
  );
  if (Array.isArray(result.history)) {
    lines.push(
      "History (timezone: Asia/Seoul):",
      ...result.history.map(
        (row: any) =>
          `- Revision ${row.revision}; ${formatLlmDateTime(row.created_at)}; source references: ${JSON.stringify(row.source ?? {})}`
      ),
      `Next history cursor: ${result.nextHistoryCursor ?? "none"}`
    );
  }
  if (result.comparison)
    lines.push(
      "Comparison source version:",
      formatProfileToolResult("read_profile", {
        ...result.comparison,
        sections: result.sections,
      })
    );
  return lines.join("\n");
}

const optionalRef = {
  profileId: { type: "string" },
  revision: { type: "integer" },
  compareRevision: { type: "integer" },
  historyCursor: { type: "integer" },
  sections: {
    type: "array",
    items: {
      type: "string",
      enum: ["talentUser", "experience", "education", "extra"],
    },
  },
};
export const CAREER_PROFILE_TOOLS: Record<string, TalentToolDefinition> = {
  list_profiles: {
    name: "list_profiles",
    description:
      TOOL_DESCRIPTIONS.list_profiles,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        archived: { type: "boolean" },
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute: (input, context) =>
      listProfiles({
        ...profileToolContext(context, "list_profiles", input, {
          readOnly: true,
        }),
        query: typeof input.query === "string" ? input.query : undefined,
        archived:
          typeof input.archived === "boolean" ? input.archived : undefined,
        cursor: typeof input.cursor === "string" ? input.cursor : undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
      }),
  },
  read_profile: {
    name: "read_profile",
    description:
      TOOL_DESCRIPTIONS.read_profile,
    parameters: {
      type: "object",
      properties: optionalRef,
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute: (input, context) =>
      readProfile({
        ...profileToolContext(context, "read_profile", input, {
          readOnly: true,
        }),
        profileId:
          typeof input.profileId === "string" ? input.profileId : undefined,
        revision:
          typeof input.revision === "number" ? input.revision : undefined,
        compareRevision:
          typeof input.compareRevision === "number"
            ? input.compareRevision
            : undefined,
        historyCursor:
          typeof input.historyCursor === "number"
            ? input.historyCursor
            : undefined,
        sections: Array.isArray(input.sections)
          ? (input.sections as string[])
          : undefined,
      }),
  },
  update_talent_profile: {
    name: "update_talent_profile",
    description:
      TOOL_DESCRIPTIONS.update_talent_profile,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create",
            "copy",
            "update",
            "set_default",
            "archive",
            "restore",
          ],
        },
        profileId: { type: "string" },
        expectedRevision: { type: "integer" },
        title: { type: "string" },
        purpose: { type: "string" },
        talentUser: {
          type: "object",
          properties: Object.fromEntries(
            userFields.map((key) => [
              key,
              key === "resume_links"
                ? { type: "array", items: { type: "string" } }
                : { type: ["string", "null"] },
            ])
          ),
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["experience", "education", "extra"],
              },
              operation: { type: "string", enum: ["add", "update", "delete"] },
              rowId: { type: "string" },
              fields: {
                type: "object",
                description: Object.entries(rowFields).map(([type, fields]) => `${type}: ${fields.join(", ")}`).join(". "),
                properties: Object.fromEntries([...new Set(Object.values(rowFields).flat())].map(key => [key,
                  key === "months" ? { type: ["integer", "null"] } : { type: ["string", "null"] },
                ])),
                additionalProperties: false,
              },
            },
            required: ["type", "operation"],
          },
        },
        profileLinks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["add", "delete"] },
              url: { type: "string" },
            },
            required: ["action", "url"],
          },
        },
        rowMemos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              rowId: { type: "string" },
              operation: { type: "string", enum: ["append", "update"] },
              memo: { type: "string" },
            },
            required: ["type", "rowId", "operation", "memo"],
          },
        },
      },
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute: executeUpdateProfile,
  },
};
