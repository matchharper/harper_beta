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
  fetchOtherRoleDescriptionReferences,
  fetchOtherRoleCriteria,
  fetchRoleCreationState,
  getRoleCreationMissingFields,
  setRoleCreationNotification,
  updateRoleCreationDraft,
  updateRoleCreationConversationMetadata,
} from "@/lib/org/agent/roleCreationState";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { OrgHttpError, updateOrgRoleRequestOnly } from "@/lib/org/server";
import { parseOrgRoleCriteria } from "@/lib/org/roleCriteria";
import {
  formatOtherRoleCalibrationContext,
  generateRoleHiringBriefCalibration,
} from "@/lib/org/agent/roleCalibration";
import type { ChatAttachmentPayload } from "@/types/chat";

export const ROLE_CREATION_TOOL_NAMES = [
  "open_url",
  "web_search",
  "research_role_description_sources",
  "calibrate_role_hiring_brief",
  "update_role_draft",
  "update_company_context",
  "read_other_roles",
  "set_role_notification",
  "confirm_pending_role_creation",
  "request_role_creation_confirmation",
] as const;

export type RoleCreationToolName = (typeof ROLE_CREATION_TOOL_NAMES)[number];

export const ROLE_CREATION_TOOLS = [
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
  {
    type: "function" as const,
    function: {
      name: "research_role_description_sources",
      description:
        "Run the one automatic source-discovery attempt for a sparse new role. The server searches once using the saved company and role title and also returns other roles from this company as fallback style references. Call only after the real role title is saved, only when the user supplied no substantial description, JD URL, or file, and never call again after descriptionSourceResearch is present. Do not use ordinary web_search for this automatic JD discovery.",
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
      name: "calibrate_role_hiring_brief",
      description:
        "Calibrate this draft Role's company-level talent bar from real people the user presents as examples. Evidence may come from conversation text, internal candidate mentions, professional URLs, or attachments. Reference people represent caliber rather than Role fit unless the user explicitly connects them to both. Use this tool for calibration intent, including a contextual reply such as '이런 사람?', and not for identity questions, profile summaries, or ordinary candidate assessments. It returns the finalized Hiring Brief and user reply; review that result before choosing the next step.",
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
      name: "update_role_draft",
      description:
        "Best suited to saving role facts the user has supplied, confirmed, or asked Harper to extract from a source in this turn. Partial updates are welcome.",
      parameters: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string" },
          description: {
            type: ["string", "null"],
            description:
              "The complete candidate-visible Role Description in Markdown. Write the actual company introduction from companyInformationDocument as natural prose when usable. Never put [[company_info]], [company_info], or any placeholder or acknowledgement token in this field.",
          },
          request: {
            type: ["string", "null"],
            description:
              "The complete private Hiring Brief in Markdown for ordinary requirement edits. Preserve confirmed content and keep Role eligibility, company talent quality / caliber, and team-specific bonuses distinct. Company caliber is an independent interview threshold: a person may satisfy the Role and remain below the company's expected level. Use explicit Top-tier school, company, program, or core-team evidence when the user has established its importance, while interpreting the actual role and contribution. Real-person calibration belongs in calibrate_role_hiring_brief.",
          },
          criteria: {
            type: "array",
            minItems: 0,
            maxItems: 6,
            description:
              "Optional high-level evaluation dimensions. Zero to six may be saved; when useful, prefer two to four complete dimensions and keep two when only two meaningful judgments exist. Consolidate related languages, frameworks, databases, cloud services, and baseline qualifications into one technical-fit criterion instead of one item per technology. Each dimension must still be independently assessable. name is a concise dimension label, never a yes/no question; criteria states the minimum bar, strong and acceptable adjacent evidence, tradeoffs, and concrete concerns.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", minLength: 1, maxLength: 200 },
                criteria: { type: "string", minLength: 1, maxLength: 8000 },
              },
              required: ["name", "criteria"],
            },
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
        "Useful when the user means a company fact to apply across all roles, rather than only to the role currently being drafted. Put all descriptive and candidate-facing company information in pitch as one coherent Markdown document. Homepage and LinkedIn have dedicated fields; every other company-level URL belongs in relatedLinks.",
      parameters: {
        type: "object",
        minProperties: 1,
        properties: {
          companyName: { type: "string" },
          pitch: {
            type: ["string", "null"],
            description:
              "The complete Markdown company-information document used for all descriptive and candidate-facing company context.",
          },
          request: { type: ["string", "null"] },
          locationText: { type: ["string", "null"] },
          foundedYear: {
            type: ["integer", "null"],
            minimum: 1000,
            maximum: new Date().getUTCFullYear() + 1,
          },
          employeeCountStart: { type: ["integer", "null"], minimum: 0 },
          employeeCountEnd: { type: ["integer", "null"], minimum: 0 },
          homepageUrl: { type: ["string", "null"] },
          linkedinUrl: { type: ["string", "null"] },
          relatedLinks: {
            type: "array",
            items: { type: "string" },
            maxItems: 12,
            uniqueItems: true,
          },
          totalFundingRaised: { type: ["string", "null"] },
          lastFundingStage: { type: ["string", "null"] },
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
        "Read up to eight other internal roles in the same company, including each role's private request, structured criteria, description, and memory. For a new draft, call this before the first internal request or criteria draft. Use analogous roles only to propose a team preference for the user's review; never copy it silently.",
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
        "Save the Slack channel and primary assignee selected or accepted by the user. For a new draft's final review only, Harper may also save the single available Slack channel and the active current author as transparent defaults; name both defaults clearly and make them easy to change. In that unambiguous-default case, do not stop or ask a separate setup-confirmation question: review this result, then call request_role_creation_confirmation in the same user turn so the final settings and Create role / Keep editing choices arrive together. Omitted fields are preserved.",
      parameters: {
        type: "object",
        minProperties: 1,
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
      name: "confirm_pending_role_creation",
      description:
        "Activate the saved draft after the immediately preceding Harper message asked for final role-creation confirmation and the user's current free-form reply clearly authorizes registering that exact role now. Natural affirmative replies such as '응', '좋아요, 진행해 주세요', or equivalent wording count when their conversational meaning is clear. Do not call it when the user asks a question, is ambiguous, merely reacts positively, or adds, removes, or changes any role detail; apply changes first and present a fresh confirmation instead.",
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
      name: "request_role_creation_confirmation",
      description:
        "Use only when the saved role is ready for final review and the user has had at least two distinct opportunities to explain team-specific candidate preferences beyond the JD and technical must-haves, including at least one explicit invitation to share a concrete strong-match person or representative ideal current team member through any useful professional source and explain why that person is a strong reference. LinkedIn is one possible source, not a requirement. When set_role_notification just saved the single available Slack channel and active current author as transparent final defaults, call this after reviewing that result in the same user turn; do not insert a separate yes/no question about those unambiguous defaults. The server checks the current state and attaches Create role / Keep editing choices; this tool itself does not activate the role.",
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

export function buildRoleDescriptionSourceQuery(args: {
  companyName: string;
  roleTitle: string;
}) {
  return `${text(args.companyName)} ${text(args.roleTitle)} 채용 career`
    .replace(/\s+/g, " ")
    .trim();
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
  if (!Number.isFinite(parsed)) {
    throw new OrgHttpError(400, "Expected a finite number");
  }
  return Math.floor(parsed);
}

function roleCriteria(value: unknown) {
  try {
    return parseOrgRoleCriteria(value);
  } catch (error) {
    throw new OrgHttpError(
      400,
      error instanceof Error ? error.message : "Invalid role criteria"
    );
  }
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
  companySideContext?: string;
  input: Record<string, unknown>;
  name: RoleCreationToolName;
  onToolProgress?: (label: string) => void;
  previousAssistantMessage: string;
  readAudience?: "caller" | "company_safe";
  referenceAttachments?: ChatAttachmentPayload[];
  roleId: string;
  user: User;
  userMessage: string;
  workspaceId: string;
}) {
  if (args.name === "web_search") {
    return {
      result: await executeSharedWebSearch(args.input, {
        admin: getSupabaseAdmin() as unknown as TalentAdminClient,
      }),
    };
  }
  if (args.name === "open_url") {
    return {
      result: await executeSharedOpenUrl({
        admin: getSupabaseAdmin() as unknown as TalentAdminClient,
        input: args.input,
      }),
    };
  }
  if (args.name === "research_role_description_sources") {
    assertOnlyKeys(args.input, [], args.name);
    const state = await fetchRoleCreationState(args);
    const previous = state.metadata.descriptionSourceResearch;
    if (previous) {
      return {
        result: {
          alreadyAttempted: true,
          research: previous,
          instruction:
            "Do not search for a role-description source again. Continue from the saved draft, conversation, or new material supplied by the user.",
        },
      };
    }
    if (state.role.status !== "draft") {
      throw new OrgHttpError(
        409,
        "Automatic role-description research is only for a new draft"
      );
    }
    const roleTitle = text(state.role.name);
    if (!roleTitle || roleTitle === "새 역할") {
      throw new OrgHttpError(
        409,
        "Save the user's actual role title before researching description sources"
      );
    }
    const query = buildRoleDescriptionSourceQuery({
      companyName: state.workspace.companyName,
      roleTitle,
    });
    let search: Awaited<ReturnType<typeof executeSharedWebSearch>> | null =
      null;
    let searchFailed = false;
    try {
      search = await executeSharedWebSearch(
        { maxResults: 8, query },
        { admin: getSupabaseAdmin() as unknown as TalentAdminClient }
      );
    } catch (error) {
      searchFailed = true;
      console.warn("[org/agent:role-description-source-research]", error);
    }
    let otherRoles: Awaited<
      ReturnType<typeof fetchOtherRoleDescriptionReferences>
    > | null = null;
    try {
      otherRoles = await fetchOtherRoleDescriptionReferences(args);
    } catch (error) {
      console.warn("[org/agent:role-description-fallback-roles]", error);
    }
    const research = {
      attemptedAt: new Date().toISOString(),
      query,
      resultCount: search?.resultCount ?? null,
      selectedSourceUrl: null,
      source: "role_creation_chat" as const,
      status: searchFailed ? ("failed" as const) : ("completed" as const),
    };
    await updateRoleCreationConversationMetadata({
      admin: getSupabaseAdmin(),
      conversationId: state.conversation.id,
      current: state.conversation.metadata,
      patch: { descriptionSourceResearch: research },
    });
    return {
      result: {
        alreadyAttempted: false,
        fallbackCompanyRoles: otherRoles?.roles ?? [],
        instruction:
          "Choose at most one result only if it is clearly this same company's same role, then open that URL before using its contents. Otherwise do not run another search: draft from analogous company-role structure and the saved company document, clearly labeling it as Harper's draft.",
        research,
        search,
      },
    };
  }
  if (args.name === "read_other_roles") {
    assertOnlyKeys(args.input, [], args.name);
    return { result: await fetchOtherRoleCriteria(args) };
  }
  if (args.name === "calibrate_role_hiring_brief") {
    assertOnlyKeys(args.input, [], args.name);
    const state = await fetchRoleCreationState(args);
    const otherRoles = await fetchOtherRoleCriteria(args);
    const calibration = await generateRoleHiringBriefCalibration({
      admin: getSupabaseAdmin() as unknown as TalentAdminClient,
      companyContext: [
        state.workspace.companyName,
        text(state.workspace.pitch),
        text(state.workspace.request),
      ]
        .filter(Boolean)
        .join("\n\n"),
      companySideContext: args.companySideContext ?? args.userMessage,
      currentHiringBrief: state.role.request,
      onProgress: (progress) => args.onToolProgress?.(progress.label),
      otherRoleCalibrationContext: formatOtherRoleCalibrationContext(
        otherRoles.roles
      ),
      readAudience: args.readAudience ?? "caller",
      referenceAttachments: args.referenceAttachments,
      roleDescription: state.role.description,
      roleId: args.roleId,
      roleName: state.role.name,
      user: args.user,
      userMessage: args.userMessage,
      workspaceId: args.workspaceId,
    });
    if (!calibration.shouldUpdate || !calibration.hiringBrief) {
      return {
        result: {
          failedReferenceUrls: calibration.failedReferenceUrls,
          followUpQuestion: calibration.followUpQuestion,
          referenceCount: calibration.referenceCount,
          referenceUrls: calibration.referenceUrls,
          roleName: state.role.name,
          status: "needs_more_information",
          summary: calibration.summary,
          userReply: calibration.userReply,
        },
        updateSummary: calibration.summary,
      };
    }
    await updateOrgRoleRequestOnly({
      expectedRequest: state.role.request,
      request: calibration.hiringBrief,
      roleId: args.roleId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    return {
      result: {
        failedReferenceUrls: calibration.failedReferenceUrls,
        followUpQuestion: calibration.followUpQuestion,
        referenceCount: calibration.referenceCount,
        referenceUrls: calibration.referenceUrls,
        roleName: state.role.name,
        status: "updated",
        summary: calibration.summary,
        userReply: calibration.userReply,
      },
      updateSummary: calibration.summary,
    };
  }
  if (args.name === "update_role_draft") {
    const allowedKeys = [
      "name",
      "description",
      "request",
      "criteria",
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
      ...(Object.prototype.hasOwnProperty.call(args.input, "criteria")
        ? { criteria: roleCriteria(args.input.criteria) }
        : {}),
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
      updateSummary: "역할 정보를 저장했어요.",
    };
  }
  if (args.name === "update_company_context") {
    const keyByInput = {
      companyName: "company_name",
      homepageUrl: "homepage_url",
      lastFundingStage: "last_funding_stage",
      linkedinUrl: "linkedin_url",
      locationText: "location",
      pitch: "pitch",
      request: "workspace_request",
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
      "relatedLinks",
    ];
    assertOnlyKeys(args.input, allowedKeys, args.name);
    requireOneInput(args.input, allowedKeys, args.name);
    if (Object.prototype.hasOwnProperty.call(args.input, "relatedLinks")) {
      changes.push({
        key: "related_links",
        value: stringList(args.input.relatedLinks),
      });
    }
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
    return { result: { ok: true }, updateSummary: "회사 정보를 저장했어요." };
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
      updateSummary: "알림 채널과 담당자를 저장했어요.",
    };
  }

  if (args.name === "confirm_pending_role_creation") {
    assertOnlyKeys(args.input, [], args.name);
    const state = await fetchRoleCreationState(args);
    if (
      state.role.status !== "draft" ||
      state.metadata.phase !== "confirmation_pending" ||
      !state.metadata.pendingConfirmationMessageId
    ) {
      throw new OrgHttpError(409, "There is no pending role confirmation");
    }
    return {
      confirmationAccepted: true,
      result: { activated: true, ok: true },
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
