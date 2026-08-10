import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
  executeSharedOpenUrl,
  executeSharedWebSearch,
} from "@/lib/agentTools/web";
import { applyWebsiteCompanyDataChanges } from "@/lib/org/companyDataWebsite";
import {
  fetchOtherRoleCriteria,
  fetchRoleCreationState,
  getRoleCreationMissingFields,
  setRoleCreationNotification,
  updateRoleCreationDraft,
} from "@/lib/org/agent/roleCreationState";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { OrgHttpError } from "@/lib/org/server";

export const ROLE_CREATION_TOOL_NAMES = [
  "open_url",
  "web_search",
  "update_role_draft",
  "update_company_context",
  "read_other_roles",
  "set_role_notification",
  "request_role_creation_confirmation",
] as const;

export type RoleCreationToolName = (typeof ROLE_CREATION_TOOL_NAMES)[number];

export const ROLE_CREATION_TOOLS = [
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
  {
    type: "function" as const,
    function: {
      name: "update_role_draft",
      description:
        "Best suited to saving role facts the user has supplied, confirmed, or asked Harper to extract from a source in this turn. Partial updates are welcome.",
      parameters: {
        type: "object",
        anyOf: [
          { required: ["name"] },
          { required: ["description"] },
          { required: ["request"] },
          { required: ["locationText"] },
          { required: ["workMode"] },
          { required: ["employmentTypes"] },
          { required: ["salaryRange"] },
          { required: ["externalJdUrl"] },
          { required: ["memory"] },
        ],
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          request: {
            type: ["string", "null"],
            description:
              "Private matching criteria and internal requirements. Write request using Markdown.",
          },
          locationText: { type: ["string", "null"] },
          workMode: {
            type: ["string", "null"],
            enum: ["onsite", "hybrid", "remote", null],
          },
          employmentTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["full_time", "part_time", "internship", "contract"],
            },
            uniqueItems: true,
          },
          salaryRange: { type: ["string", "null"] },
          externalJdUrl: { type: ["string", "null"] },
          memory: {
            type: ["string", "null"],
            description: "Guide for Harper for this role.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_company_context",
      description:
        "Useful when the user means a company fact to apply across all roles, rather than only to the role currently being drafted.",
      parameters: {
        type: "object",
        anyOf: [
          { required: ["companyName"] },
          { required: ["description"] },
          { required: ["pitch"] },
          { required: ["request"] },
          { required: ["logoUrl"] },
          { required: ["shortDescription"] },
          { required: ["locationText"] },
          { required: ["foundedYear"] },
          { required: ["employeeCountStart"] },
          { required: ["employeeCountEnd"] },
          { required: ["homepageUrl"] },
          { required: ["careerUrl"] },
          { required: ["linkedinUrl"] },
          { required: ["totalFundingRaised"] },
          { required: ["mainInvestors"] },
          { required: ["lastFundingStage"] },
          { required: ["lastFundingRoundDescription"] },
        ],
        properties: {
          companyName: { type: "string" },
          description: { type: ["string", "null"] },
          pitch: { type: ["string", "null"] },
          request: { type: ["string", "null"] },
          logoUrl: { type: ["string", "null"] },
          shortDescription: { type: ["string", "null"] },
          locationText: { type: ["string", "null"] },
          foundedYear: {
            type: ["integer", "null"],
            minimum: 1000,
            maximum: new Date().getUTCFullYear() + 1,
          },
          employeeCountStart: { type: ["integer", "null"], minimum: 0 },
          employeeCountEnd: { type: ["integer", "null"], minimum: 0 },
          homepageUrl: { type: ["string", "null"] },
          careerUrl: { type: ["string", "null"] },
          linkedinUrl: { type: ["string", "null"] },
          totalFundingRaised: { type: ["string", "null"] },
          mainInvestors: { type: ["string", "null"] },
          lastFundingStage: { type: ["string", "null"] },
          lastFundingRoundDescription: { type: ["string", "null"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_other_roles",
      description:
        "Useful for finding a potentially reusable hiring standard from other roles in the same company, so Harper can propose it for the user's review.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_role_notification",
      description:
        "Best used when the user's current message clearly selects or agrees to the Slack channel and primary assignee. Omitted fields are preserved.",
      parameters: {
        type: "object",
        anyOf: [{ required: ["assigneeUserId"] }, { required: ["channelIds"] }],
        properties: {
          assigneeUserId: { type: "string" },
          channelIds: { type: "array", items: { type: "string" }, minItems: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_role_creation_confirmation",
      description:
        "Useful when the saved role appears ready for a final review. The server checks the current state and attaches [예/아니오] choices; this tool itself does not activate the role.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  return value === null ? null : text(value) || undefined;
}

function stringList(value: unknown) {
  return Array.from(
    new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))
  );
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected a finite number");
  return Math.floor(parsed);
}

function optionalNonNegativeInteger(value: unknown) {
  const parsed = optionalNumber(value);
  if (parsed !== null && parsed < 0) {
    throw new OrgHttpError(400, "Expected a non-negative integer");
  }
  return parsed;
}

function optionalFoundedYear(value: unknown) {
  const parsed = optionalNumber(value);
  if (
    parsed !== null &&
    (parsed < 1000 || parsed > new Date().getUTCFullYear() + 1)
  ) {
    throw new OrgHttpError(400, "Founded year is out of range");
  }
  return parsed;
}

function assertOnlyKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
  toolName: string
) {
  const allowed = new Set(keys);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new OrgHttpError(400, `${toolName} received an unknown field`);
  }
}

function requireOneInput(
  input: Record<string, unknown>,
  keys: readonly string[],
  toolName: string
) {
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    throw new OrgHttpError(400, `${toolName} requires at least one field`);
  }
}

export function isRoleCreationToolName(
  value: string
): value is RoleCreationToolName {
  return (ROLE_CREATION_TOOL_NAMES as readonly string[]).includes(value);
}

export async function executeRoleCreationTool(args: {
  actorLabel: string;
  allowCompletedRole?: boolean;
  input: Record<string, unknown>;
  name: RoleCreationToolName;
  previousAssistantMessage: string;
  roleId: string;
  user: User;
  userMessage: string;
  workspaceId: string;
}) {
  if (args.name === "web_search") {
    return { result: await executeSharedWebSearch(args.input) };
  }
  if (args.name === "open_url") {
    return {
      result: await executeSharedOpenUrl({
        admin: getSupabaseAdmin() as unknown as TalentAdminClient,
        enableLinkedinApify: true,
        input: args.input,
      }),
    };
  }
  if (args.name === "read_other_roles") {
    assertOnlyKeys(args.input, [], args.name);
    return { result: await fetchOtherRoleCriteria(args) };
  }
  if (args.name === "update_role_draft") {
    const allowedKeys = [
      "name",
      "description",
      "request",
      "locationText",
      "workMode",
      "employmentTypes",
      "salaryRange",
      "externalJdUrl",
      "memory",
    ] as const;
    assertOnlyKeys(args.input, allowedKeys, args.name);
    requireOneInput(args.input, allowedKeys, args.name);
    const workMode = optionalText(args.input.workMode);
    if (
      Object.prototype.hasOwnProperty.call(args.input, "workMode") &&
      workMode !== null &&
      workMode !== undefined &&
      !["onsite", "hybrid", "remote"].includes(workMode)
    ) {
      throw new OrgHttpError(400, "Unknown work mode");
    }
    const employmentTypes = stringList(args.input.employmentTypes);
    if (
      Object.prototype.hasOwnProperty.call(args.input, "employmentTypes") &&
      employmentTypes.some(
        (value) =>
          !["full_time", "part_time", "internship", "contract"].includes(value)
      )
    ) {
      throw new OrgHttpError(400, "Unknown employment type");
    }
    const state = await updateRoleCreationDraft({
      actorLabel: args.actorLabel,
      allowCompletedRole: args.allowCompletedRole,
      ...(Object.prototype.hasOwnProperty.call(args.input, "description")
        ? { description: optionalText(args.input.description) ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "employmentTypes")
        ? { employmentTypes }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "externalJdUrl")
        ? { externalJdUrl: optionalText(args.input.externalJdUrl) ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "locationText")
        ? { locationText: optionalText(args.input.locationText) ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "memory")
        ? { memory: optionalText(args.input.memory) ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "name")
        ? { name: text(args.input.name) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "request")
        ? { request: optionalText(args.input.request) ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "salaryRange")
        ? { salaryRange: optionalText(args.input.salaryRange) ?? null }
        : {}),
      roleId: args.roleId,
      user: args.user,
      ...(Object.prototype.hasOwnProperty.call(args.input, "workMode")
        ? { workMode: workMode ?? null }
        : {}),
      workspaceId: args.workspaceId,
    });
    const editingRegisteredRole = state.role.status !== "draft";
    return {
      result: {
        ...(editingRegisteredRole
          ? { registeredRole: true }
          : { missingFields: getRoleCreationMissingFields(state) }),
        ok: true,
      },
      updateSummary: "역할 정보를 반영했습니다.",
    };
  }
  if (args.name === "update_company_context") {
    const keyByInput = {
      careerUrl: "career_url",
      companyName: "company_name",
      description: "company_description",
      homepageUrl: "homepage_url",
      lastFundingRoundDescription: "last_funding_round_description",
      lastFundingStage: "last_funding_stage",
      linkedinUrl: "linkedin_url",
      locationText: "location",
      logoUrl: "logo_url",
      mainInvestors: "main_investors",
      pitch: "pitch",
      request: "workspace_request",
      shortDescription: "short_description",
      totalFundingRaised: "total_funding_raised",
    } as const;
    const changes: Parameters<
      typeof applyWebsiteCompanyDataChanges
    >[0]["changes"] = Object.entries(keyByInput).flatMap(([inputKey, key]) =>
      Object.prototype.hasOwnProperty.call(args.input, inputKey)
        ? [{ key, value: optionalText(args.input[inputKey]) ?? null }]
        : []
    );
    const numericKeyByInput = {
      employeeCountEnd: "employee_count_end",
      employeeCountStart: "employee_count_start",
      foundedYear: "founded_year",
    } as const;
    const allowedKeys = [
      ...Object.keys(keyByInput),
      ...Object.keys(numericKeyByInput),
    ];
    assertOnlyKeys(args.input, allowedKeys, args.name);
    requireOneInput(args.input, allowedKeys, args.name);
    for (const [inputKey, key] of Object.entries(numericKeyByInput)) {
      if (Object.prototype.hasOwnProperty.call(args.input, inputKey)) {
        changes.push({
          key,
          value:
            inputKey === "foundedYear"
              ? optionalFoundedYear(args.input[inputKey])
              : optionalNonNegativeInteger(args.input[inputKey]),
        });
      }
    }
    await applyWebsiteCompanyDataChanges({
      actorLabel: args.actorLabel,
      admin: getSupabaseAdmin(),
      changes,
      source: "chat",
      workspaceId: args.workspaceId,
    });
    return { result: { ok: true }, updateSummary: "회사 정보를 반영했습니다." };
  }
  if (args.name === "set_role_notification") {
    assertOnlyKeys(args.input, ["assigneeUserId", "channelIds"], args.name);
    const state = await setRoleCreationNotification({
      allowCompletedRole: args.allowCompletedRole,
      ...(Object.prototype.hasOwnProperty.call(args.input, "assigneeUserId")
        ? { assigneeUserId: text(args.input.assigneeUserId) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "channelIds")
        ? { channelIds: stringList(args.input.channelIds) }
        : {}),
      roleId: args.roleId,
      previousAssistantMessage: args.previousAssistantMessage,
      user: args.user,
      userMessage: args.userMessage,
      workspaceId: args.workspaceId,
    });
    const editingRegisteredRole = state.role.status !== "draft";
    return {
      result: {
        ...(editingRegisteredRole
          ? { registeredRole: true }
          : { missingFields: getRoleCreationMissingFields(state) }),
        ok: true,
      },
      updateSummary: "알림 채널과 담당자를 반영했습니다.",
    };
  }

  assertOnlyKeys(args.input, [], args.name);
  const state = await fetchRoleCreationState(args);
  if (state.role.status !== "draft") {
    return {
      result: {
        alreadyRegistered: true,
        ok: true,
        presentationRequired: false,
      },
    };
  }
  const missingFields = getRoleCreationMissingFields(state);
  if (missingFields.length > 0) {
    return {
      result: {
        error: "role_creation_not_ready",
        missingFields,
        ok: false,
      },
    };
  }
  return {
    confirmationRequested: true,
    result: { ok: true, presentationRequired: true },
  };
}
