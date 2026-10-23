import { formatToolError } from "@/lib/llm/toolError";
import { reportToolDiagnostic } from "@/lib/llm/toolExecution";
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
  summarizeRoleCreationNotificationSettings,
  updateRoleCreationDraft,
  updateRoleCreationConversationMetadata,
} from "@/lib/org/agent/roleCreationState";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { OrgHttpError, updateOrgRoleRequestOnly } from "@/lib/org/server";
import { parseOrgRoleCriteria, normalizeOrgRoleCriteria, type OrgRoleCriterion } from "@/lib/org/roleCriteria";
import { after } from "next/server";
import { answerRoleStartQuestion, startRoleStartDraft } from "@/lib/org/roleStart/service";
import {
  ORG_ROLE_EMPLOYMENT_TYPE_VALUES,
  ORG_ROLE_WORK_MODE_VALUES,
  parseOrgRoleEmploymentType,
  parseOrgRoleWorkMode,
} from "@/lib/org/roleFieldValues";
import {
  formatOtherRoleCalibrationContext,
  generateRoleHiringBriefCalibration,
} from "@/lib/org/agent/roleCalibration";
import type { ChatAttachmentPayload } from "@/types/chat";
import { applyRoleTextEdits } from "./roleTextEdits";

export const ROLE_CREATION_TOOL_NAMES = [
  "answer_role_start_question",
  "ask_role_start_question",
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
  {
    type: "function" as const,
    function: {
      name: "answer_role_start_question",
      description:
        "Apply the team's own words as the answer to the open role start question card (ROLE_START_QUESTIONS.openQuestion). Use only when the latest message answers that question; set skip when they decline it. The product updates the Brief and shows the next card.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The team's answer in their own words." },
          skip: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ask_role_start_question",
      description:
        "Ask the hiring team one question as a card with answer chips; the team can also answer in their own words. Use this for every question to the team once the Role's description is saved (preferences, trade-offs, reference profiles, compensation, work arrangement). The card joins the role start questions: it shows now if none is open, otherwise next. Do not also write the question in your reply.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "One short Korean question." },
          why: { type: "string", description: "One short Korean sentence on what the answer changes." },
          chips: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 5,
            description: "4-5 short Korean answers the team can pick, each a different meaning, including a 'not decided' or 'none' style answer when that is a real option.",
          },
        },
        required: ["question", "chips"],
        additionalProperties: false,
      },
    },
  },
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
        "Save role facts the user supplied, confirmed, or asked Harper to extract. For additions/corrections to an existing Description or Brief, prefer textEdits to preserve unaffected text exactly. Use full fields for initial authoring or a requested full rewrite. Do not regenerate all three documents for each new fact.",
      parameters: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string" },
          textEdits: {
            type: "array", minItems: 1, maxItems: 12,
            description: "Ordered exact replacements in saved Description or Brief. before must occur exactly once; after replaces only that span (empty deletes it). To append, replace a unique ending with that ending plus the addition. Never supply the same field both here and as a full replacement. Missing or ambiguous anchors make the entire edit fail without writing.",
            items: {
              type: "object", additionalProperties: false,
              required: ["field", "before", "after"],
              properties: {
                field: { type: "string", enum: ["description", "request"] },
                before: { type: "string", minLength: 1 },
                after: { type: "string" },
              },
            },
          },
          description: {
            type: ["string", "null"],
            description:
              "The complete candidate-visible Role Description in Markdown, following the shared authoring source-fidelity contract. Complete means all known public facts, not invented qualifications to fill a JD template. Write the actual company introduction from companyInformationDocument as natural prose when usable. Never put [[company_info]], [company_info], or any placeholder or acknowledgement token in this field.",
          },
          request: {
            type: ["string", "null"],
            description:
              "The complete private Hiring Brief in Markdown for ordinary requirement edits. Follow the shared authoring contract for Role eligibility, established company caliber and team-specific preferences; preserve confirmed content and its original strength. Real-person calibration belongs in calibrate_role_hiring_brief.",
          },
          criteria: {
            type: "array",
            minItems: 0,
            description:
              "Independent candidate comparison elements under the shared authoring contract. Author them from known Role facts as part of drafting. Omit this field to preserve existing Criteria during unrelated edits. An empty list is valid; authoring is the LLM's responsibility rather than a completion gate. Each element must organize supported evidence, not add a screening bar. name directly identifies the experience, supported seniority range or established background being checked; criteria defines the evidence for that signal.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", minLength: 1 },
                criteria: { type: "string", minLength: 1 },
              },
              required: ["name", "criteria"],
            },
          },
          locationText: { type: ["string", "null"] },
          workMode: {
            type: ["string", "null"],
            enum: [...ORG_ROLE_WORK_MODE_VALUES, null],
          },
          employmentTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ORG_ROLE_EMPLOYMENT_TYPE_VALUES,
            },
            uniqueItems: true,
          },
          salaryRange: {
            type: ["string", "null"],
            description:
              "One free-form compensation value containing any range, currency, equity, bonus, or basis detail together. Never split it into minimum, maximum, currency, or other compensation fields.",
          },
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
        "Read up to eight other internal roles in the same company, including each role's lifecycle status, saved compensation range, private request, structured criteria, description, and memory. For a new draft, use this to ground an optional compensation proposal when a genuinely analogous role has saved compensation, and call it before the first internal request or criteria draft. Never infer analogy from title alone or copy another role's compensation or preferences silently; apply them only after the user's explicit acceptance.",
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
        "Save the Slack channel, the Role's email switch (emailEnabled: new candidates go by email to the Role's assignee and Owners) and primary assignee selected or accepted by the user. Determine that selection and consent from the whole conversation, including contextual acceptance of an earlier proposal and subsequent corrections or withdrawal. Ask only when the intended targets or authorization remain unclear; approval of unrelated settings does not authorize this change. For a new draft's final review only, Harper may also save the single available Slack channel (or, with no Slack channel, emailEnabled=true) and the active current author as transparent defaults; name both defaults clearly and make them easy to change. In that unambiguous-default case, do not stop or ask a separate setup-confirmation question: review this result, then call request_role_creation_confirmation in the same user turn so the final settings and Create role / Keep editing choices arrive together. Omitted fields are preserved.",
      parameters: {
        type: "object",
        minProperties: 1,
        properties: {
          assigneeUserId: { type: "string" },
          channelIds: { type: "array", items: { type: "string" }, minItems: 1 },
          emailEnabled: { type: "boolean" },
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
        "ACTIVATE the saved Role now and start its matching lifecycle; this is not a review/preview action. Available only after the immediately preceding Harper message asked for final role-creation confirmation and the current reply authorizes that exact activation. Natural affirmative replies count only when they approve activation, not merely settings or preparation. A request to reach, show or repeat the confirmation/review step uses request_role_creation_confirmation, even if it also approves all saved settings. Do not call it when the user asks a question, is ambiguous, merely reacts positively, or adds, removes, or changes any role detail; apply changes first and present a fresh confirmation instead.",
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
        "Use only when the saved role is ready for final review and the user has had at least two distinct opportunities to explain team-specific candidate preferences beyond the JD and technical must-haves, including at least one explicit invitation to share a concrete strong-match person or representative ideal current team member through any useful professional source and explain why that person is a strong reference (on a role start Role, pointing them to the web '참고 인물' box counts as that invitation). LinkedIn is one possible source, not a requirement. When set_role_notification just saved the single available Slack channel (or email when there is no Slack channel) and active current author as transparent final defaults, call this after reviewing that result in the same user turn; do not insert a separate yes/no question about those unambiguous defaults. The server checks the current state and attaches Create role / Keep editing choices; this tool itself does not activate the role.",
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

/** The chat writes name/description only; keep strength, signals and change history by name. */
function carryStructuredCriterionFields(
  next: OrgRoleCriterion[],
  previous: unknown
): OrgRoleCriterion[] {
  const before = normalizeOrgRoleCriteria(previous);
  return next.map((criterion) => {
    const match = before.find((item) => item.name === criterion.name);
    if (!match) return criterion;
    const { criteria: _criteria, name: _name, ...structured } = match;
    return { ...structured, ...criterion };
  });
}

function scheduleRoleStartDraft(args: { roleId: string; user: User; workspaceId: string }) {
  // Starts now, beside the rest of the chat turn; after() only keeps it alive
  // once the response ends (scheduling the start itself there waited for the
  // whole reply).
  const task = startRoleStartDraft(args).catch((error) =>
    console.warn("[org/agent:role-start-draft]", formatToolError(error))
  );
  try {
    after(() => task);
  } catch {
    // Outside a request the promise simply runs on.
  }
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
  if (args.name === "ask_role_start_question") {
    assertOnlyKeys(args.input, ["question", "why", "chips"], args.name);
    const { askRoleStartQuestionFromChat } = await import("@/lib/org/roleStart/service");
    const chips = Array.isArray(args.input.chips) ? args.input.chips.map((item) => text(item)).filter(Boolean) : [];
    const result = await askRoleStartQuestionFromChat({
      roleId: args.roleId,
      user: args.user,
      workspaceId: args.workspaceId,
      question: text(args.input.question),
      why: optionalText(args.input.why) ?? null,
      chips,
    });
    return {
      result: result.posted
        ? { ok: true, card: result.shownNow ? "shown_now" : "asked_next" }
        : { ok: false, reason: result.reason },
    };
  }
  if (args.name === "answer_role_start_question") {
    assertOnlyKeys(args.input, ["answer", "skip"], args.name);
    const { loadRoleStartSession } = await import("@/lib/org/roleStart/session");
    const session = await loadRoleStartSession(args.roleId, { forView: true });
    const question = session?.pendingQuestion;
    if (!question) {
      return { result: { ok: false, error: "no_open_question" } };
    }
    const answer = text(args.input.answer);
    const skip = args.input.skip === true;
    if (!skip && !answer) throw new OrgHttpError(400, "answer or skip is required");
    await answerRoleStartQuestion({
      fromChat: true,
      questionId: question.id,
      roleId: args.roleId,
      skip,
      text: skip ? null : answer,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    return {
      result: { ok: true, applied: skip ? "skipped" : "answered", nextCardFollows: true },
      updateSummary: skip ? "질문을 건너뛰었어요." : "답을 반영하고 있어요.",
    };
  }
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
      reportToolDiagnostic(error);
      searchFailed = true;
      console.warn("[org/agent:role-description-source-research]", formatToolError(error));
    }
    let otherRoles: Awaited<
      ReturnType<typeof fetchOtherRoleDescriptionReferences>
    > | null = null;
    try {
      otherRoles = await fetchOtherRoleDescriptionReferences(args);
    } catch (error) {
      reportToolDiagnostic(error);
      console.warn("[org/agent:role-description-fallback-roles]", formatToolError(error));
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
    {
      // A Role with a role start Brief takes reference people only from the web
      // 참고 인물 box: nothing is recorded here (a chat-written Role calibrates as before).
      const { referenceBoxOnlyTurn } = await import("@/lib/org/roleStart/referenceTurn");
      const turn = await referenceBoxOnlyTurn(args.roleId);
      if (turn) return { result: turn, updateSummary: "" };
    }
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
    // A Role with a role start Brief takes the calibration into that Brief, so
    // the saved text and the criteria list change together and survive confirming.
    const { applyCalibrationToRoleStart } = await import("@/lib/org/roleStart/service");
    const routed = await applyCalibrationToRoleStart({
      roleId: args.roleId,
      user: args.user,
      workspaceId: args.workspaceId,
      hiringBrief: calibration.hiringBrief,
    });
    if (routed === "drafting") {
      return {
        result: {
          roleName: state.role.name,
          status: "needs_more_information",
          userReply: "Brief를 아직 쓰고 있어요. 1분쯤 뒤에 다시 말씀해 주시면 참고 인물을 반영할게요.",
        },
        updateSummary: "",
      };
    }
    if (!routed) {
      await updateOrgRoleRequestOnly({
        expectedRequest: state.role.request,
        request: calibration.hiringBrief,
        roleId: args.roleId,
        user: args.user,
        workspaceId: args.workspaceId,
      });
    }
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
      "textEdits",
    ] as const;
    assertOnlyKeys(args.input, allowedKeys, args.name);
    requireOneInput(args.input, allowedKeys, args.name);
    if (args.input.textEdits !== undefined) {
      const current = await fetchRoleCreationState(args);
      try { args = { ...args, input: applyRoleTextEdits(current.role, args.input) }; }
      catch (error) { throw new OrgHttpError(400, error instanceof Error ? error.message : "Invalid text edits"); }
    }
    {
      // Facts the quick JD read saved in this same first turn stay as shown.
      const { withoutPrefilledFacts } = await import("@/lib/org/roleStart/rolePrefill");
      const current = (await fetchRoleCreationState(args)).role;
      const input = withoutPrefilledFacts(args.roleId, args.input, current);
      if (Object.keys(input).length === 0) {
        return { result: { roleName: current.name, status: "updated" }, updateSummary: "" };
      }
      args = { ...args, input };
    }
    const rawWorkMode = optionalText(args.input.workMode);
    const workMode =
      rawWorkMode === null || rawWorkMode === undefined
        ? rawWorkMode
        : parseOrgRoleWorkMode(rawWorkMode);
    if (
      Object.prototype.hasOwnProperty.call(args.input, "workMode") &&
      rawWorkMode !== null &&
      rawWorkMode !== undefined &&
      workMode === null
    ) {
      throw new OrgHttpError(400, "Unknown work mode");
    }
    const rawEmploymentTypes = stringList(args.input.employmentTypes);
    const employmentTypes = rawEmploymentTypes.map((value) => {
      const normalized = parseOrgRoleEmploymentType(value);
      if (!normalized) throw new OrgHttpError(400, "Unknown employment type");
      return normalized;
    });
    {
      // A registered Role with a role start Brief: its text and criteria list
      // change only through that Brief, together (the other fields as before).
      const { request, criteria, ...rest } = args.input;
      const current = request !== undefined || criteria !== undefined ? (await fetchRoleCreationState(args)).role : null;
      if (current && current.status !== "draft") {
        const { applyChatEditToRoleStart } = await import("@/lib/org/roleStart/service");
        const routed = await applyChatEditToRoleStart({
          roleId: args.roleId,
          user: args.user,
          workspaceId: args.workspaceId,
          previousRequest: current.request ?? null,
          ...(request !== undefined ? { request: optionalText(request) ?? null } : {}),
          ...(criteria !== undefined ? { criteria: roleCriteria(criteria) } : {}),
        });
        if (routed && !Object.keys(rest).length) {
          const state = await fetchRoleCreationState(args);
          return {
            result: {
              savedFields: Object.fromEntries(Object.keys(args.input).map((key) => [key, state.role[key as keyof typeof state.role]])),
              registeredRole: true,
              notificationSettings: summarizeRoleCreationNotificationSettings(state),
              ok: true,
            },
            updateSummary: "역할 정보를 저장했어요.",
          };
        }
        if (routed) args = { ...args, input: rest };
      }
    }
    const hasCriteria = Object.prototype.hasOwnProperty.call(args.input, "criteria");
    const previousState =
      hasCriteria || Object.prototype.hasOwnProperty.call(args.input, "description")
        ? await fetchRoleCreationState(args)
        : null;
    const state = await updateRoleCreationDraft({
      actorLabel: args.actorLabel,
      allowCompletedRole: args.allowCompletedRole,
      ...(hasCriteria
        ? {
            criteria: carryStructuredCriterionFields(
              roleCriteria(args.input.criteria),
              previousState?.role.criteria
            ),
          }
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
    const { briefStartedFromJd } = await import("@/lib/org/roleStart/rolePrefill");
    if (hasCriteria && !briefStartedFromJd(args.roleId)) {
      // While the start flow is open, its Brief is the one source of criteria
      // (in the first turn of a JD-started Role the Brief is written from the same JD).
      const { applyChatCriteriaToRoleStart } = await import("@/lib/org/roleStart/service");
      await applyChatCriteriaToRoleStart({
        roleId: args.roleId,
        userId: args.user.id,
        criteria: roleCriteria(args.input.criteria),
      }).catch((error) => console.warn("[org/agent:role-start-criteria]", formatToolError(error)));
    }
    const editingRegisteredRole = state.role.status !== "draft";
    if (
      !editingRegisteredRole &&
      !String(previousState?.role.description ?? "").trim() &&
      String(state.role.description ?? "").trim()
    ) {
      // The JD-reading turn also prepares the role start rubric and first
      // questions; it runs beside the chat so the reply is not delayed.
      scheduleRoleStartDraft({ roleId: args.roleId, user: args.user, workspaceId: args.workspaceId });
    }
    return {
      result: {
        // Read-back is authoritative; a success flag alone loses the exact
        // stored copy that the next edit and final confirmation depend on.
        savedFields: Object.fromEntries(Object.keys(args.input).map((key) => [key, state.role[key as keyof typeof state.role]])),
        ...(editingRegisteredRole
          ? { registeredRole: true }
          : { missingFields: getRoleCreationMissingFields(state) }),
        notificationSettings: summarizeRoleCreationNotificationSettings(state),
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
    assertOnlyKeys(args.input, ["assigneeUserId", "channelIds", "emailEnabled"], args.name);
    const state = await setRoleCreationNotification({
      allowCompletedRole: args.allowCompletedRole,
      ...(Object.prototype.hasOwnProperty.call(args.input, "assigneeUserId")
        ? { assigneeUserId: text(args.input.assigneeUserId) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args.input, "channelIds")
        ? { channelIds: stringList(args.input.channelIds) }
        : {}),
      ...(typeof args.input.emailEnabled === "boolean"
        ? { emailEnabled: args.input.emailEnabled }
        : {}),
      roleId: args.roleId,
      user: args.user,
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
      result: { confirmationAccepted: true, ok: true },
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
        ...(missingFields.includes("assignee")
          ? {
              availableAssignees: state.members.map((member) => ({
                current: member.userId === state.currentUser.userId,
                name: member.name,
                userId: member.userId,
              })),
              responseGuidance:
                "No confirmed role owner is set. Ask whether to set the current conversation partner (the available assignee marked current) as the owner. If that person is not available, ask the user to choose an available teammate. Do not assign anyone without contextual authorization.",
            }
          : {}),
        ok: false,
      },
    };
  }
  return {
    confirmationRequested: true,
    result: { ok: true, presentationRequired: true },
  };
}
