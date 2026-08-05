/**
 * Tool contracts exposed to the organization-wide Harper agent.
 *
 * Keep this file declarative: names, descriptions, and JSON schemas only.
 * Runtime validation and database work live in toolExecution.ts and data.ts.
 */
export const ORG_AGENT_TOOL_NAMES = [
  "get_talents",
  "read_talent",
  "read_role",
  "get_more_data",
  "update_data",
  "contact_talent",
  "request_talent_resume",
  "prepare_candidate_connection",
  "decide_candidate_connection",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

export const ORG_AGENT_TERMINAL_TOOL_NAMES = new Set<OrgAgentToolName>([
  "update_data",
  "contact_talent",
  "request_talent_resume",
]);

export function isOrgAgentTerminalToolName(value: unknown) {
  return ORG_AGENT_TERMINAL_TOOL_NAMES.has(value as OrgAgentToolName);
}

// Candidate connection mutations are intentionally paused until this flow is
// ready to be enabled in production again. Keep the names in the type union so
// the dormant execution code remains type-checked, but reject any invocation.
const DISABLED_ORG_AGENT_TOOL_NAMES = new Set<OrgAgentToolName>([
  "prepare_candidate_connection",
  "decide_candidate_connection",
]);

export const ORG_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_talents",
      description:
        "Search the company-visible candidate set. Default search covers identity, headline, and role; set searchProfile when the requested evidence may be in education, work history, bio, or resume. Results are bounded and include matching evidence snippets. Read a selected candidate only when more detail is needed; use read_role for a role's whole pipeline.",
      parameters: {
        additionalProperties: false,
        properties: {
          limit: {
            description: "Matches to return; 1-20, default 10.",
            maximum: 20,
            minimum: 1,
            type: "integer",
          },
          offset: {
            description: "Page offset; 0-200, default 0.",
            maximum: 200,
            minimum: 0,
            type: "integer",
          },
          query: {
            description: "Name, email, headline, talent ID, or position title.",
            maxLength: 200,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "Exact role ID when the target role is known.",
            type: "string",
          },
          searchProfile: {
            description:
              "Also search education, experience, bio, and resume; use only when the question needs them.",
            type: "boolean",
          },
        },
        required: ["query"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_talent",
      description:
        "Read one company-visible candidate after resolving talentId. Returns every visible role/stage entry, bounded recent progress, and five safe career insights the candidate told Harper. Compensation is never returned. Set includeProfile only when bio, resume, work, or education is needed because it is much larger.",
      parameters: {
        additionalProperties: false,
        properties: {
          includeProfile: {
            description:
              "Include bio, resume, work, and education; default false.",
            type: "boolean",
          },
          progressLimit: {
            description: "Recent progress events; 1-30, default 10.",
            maximum: 30,
            minimum: 1,
            type: "integer",
          },
          roleId: {
            description: "Focus on one role; omit to read all visible roles.",
            type: "string",
          },
          talentId: {
            description: "Exact talent ID.",
            type: "string",
          },
        },
        required: ["talentId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_role",
      description:
        "Read one internal role by roleId or exact title. Use it only for details missing from current context, and choose only the needed criteria, memory, pipeline, or description.",
      parameters: {
        additionalProperties: false,
        properties: {
          exactTitle: {
            description:
              "Exact role title when roleId is unknown. Do not use a fuzzy title.",
            maxLength: 200,
            type: "string",
          },
          include: {
            description:
              "Parts to read. Use pipeline only for stage/count questions; criteria and memory are complete long-text reads.",
            items: {
              enum: ["criteria", "memory", "pipeline", "description"],
              type: "string",
            },
            maxItems: 4,
            minItems: 1,
            type: "array",
          },
          peopleLimit: {
            description: "Candidates in this page; 1-20, default 10.",
            maximum: 20,
            minimum: 1,
            type: "integer",
          },
          peopleOffset: {
            description: "Candidate page offset; 0-200, default 0.",
            maximum: 200,
            minimum: 0,
            type: "integer",
          },
          recentUpdateLimit: {
            description: "Recent progress events; 0-20, default 10.",
            maximum: 20,
            minimum: 0,
            type: "integer",
          },
          roleId: { description: "Exact role ID.", type: "string" },
          stage: {
            description:
              "Only filter people when one specific stage was requested. Omit for whole-pipeline status/count questions. Example: connected or custom:<id>.",
            maxLength: 100,
            type: "string",
          },
        },
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_more_data",
      description:
        "Load optional workspace data by kind. The selected kinds are automatically refreshed into this same web conversation or Slack thread for the next three user turns.",
      parameters: {
        additionalProperties: false,
        properties: {
          fullTextKeys: {
            description:
              "Company detail text fields that must be returned in full for an edit. Only use with company_details.",
            items: {
              enum: [
                "company_description",
                "pitch",
                "workspace_request",
                "short_description",
                "last_funding_round_description",
              ],
              type: "string",
            },
            maxItems: 5,
            type: "array",
          },
          kinds: {
            description: "One to three optional data groups to load.",
            items: {
              enum: ["members", "company_details", "workspace_memory"],
              type: "string",
            },
            maxItems: 3,
            minItems: 1,
            type: "array",
          },
        },
        required: ["kinds"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_data",
      description:
        "Apply one atomic batch of explicitly requested company/role changes, or resolve a stored confirmation. request and memory changes are proposed first and applied only after the user's next explicit confirmation. This must be the only tool call in the message and ends tool use for the turn.",
      parameters: {
        additionalProperties: false,
        properties: {
          baseProposalId: {
            description:
              "Pending proposal to revise. Use only when the user changes that proposal.",
            type: ["string", "null"],
          },
          changes: {
            description:
              "One atomic batch, maximum 12. role keys require roleId; workspace keys must omit it.",
            items: {
              additionalProperties: false,
              properties: {
                key: {
                  enum: [
                    "company_name",
                    "company_description",
                    "pitch",
                    "workspace_request",
                    "logo_url",
                    "homepage_url",
                    "career_url",
                    "linkedin_url",
                    "short_description",
                    "funding_url",
                    "location",
                    "founded_year",
                    "employee_count_start",
                    "employee_count_end",
                    "specialities",
                    "investors",
                    "related_links",
                    "total_funding_raised",
                    "main_investors",
                    "last_funding_stage",
                    "last_funding_round_description",
                    "workspace_memory",
                    "role_name",
                    "role_description",
                    "role_external_jd_url",
                    "role_location",
                    "role_status",
                    "role_work_mode",
                    "role_employment_types",
                    "role_request",
                    "role_memory",
                  ],
                  type: "string",
                },
                kind: {
                  description:
                    "append adds one request/memory fact or list item, creating an absent section; replace changes one exact oldValue; rewrite sets a scalar or replaces the whole value.",
                  enum: ["append", "replace", "rewrite"],
                  type: "string",
                },
                oldValue: {
                  description: "Exact current substring; required for replace.",
                  type: "string",
                },
                roleId: {
                  description: "Exact role ID for role_* keys.",
                  type: "string",
                },
                section: {
                  description: "Required only for role_request append.",
                  enum: ["hard_constraints", "preferred_criteria"],
                  type: "string",
                },
                value: {
                  description:
                    "New value, appended content, or replacement text. Use null to clear a nullable field with rewrite.",
                  items: { type: "string" },
                  type: ["string", "number", "array", "null"],
                },
              },
              required: ["key", "kind", "value"],
              type: "object",
            },
            maxItems: 12,
            minItems: 1,
            type: "array",
          },
          proposalAction: {
            description:
              "Apply only after explicit confirmation, reject after explicit refusal, or return the stored preview.",
            enum: ["apply", "reject", "preview"],
            type: "string",
          },
          proposalId: {
            description: "Exact pending proposal ID from context.",
            type: "string",
          },
          summary: {
            description:
              "변경한 내용만 한 줄, 최대 160자, 이유나 장황한 설명 금지.",
            maxLength: 160,
            minLength: 1,
            type: "string",
          },
        },
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contact_talent",
      description:
        "Queue one low-pressure request to an exact candidate only after the company explicitly asks Harper to contact or check with them. This is terminal and must be the only tool call in the message. Never use it merely because the company asked a question. Resolve the candidate and role first. Compensation always requires a fresh candidate authorization and must not use any stored amount.",
      parameters: {
        additionalProperties: false,
        properties: {
          requestContext: {
            description:
              "A neutral, professional description of what the company wants Harper to check. Preserve the useful context, but do not copy hostile wording or include compensation from stored data.",
            maxLength: 800,
            minLength: 1,
            type: "string",
          },
          roleId: { description: "Exact role ID.", type: "string" },
          talentId: { description: "Exact talent ID.", type: "string" },
        },
        required: ["talentId", "roleId", "requestContext"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_talent_resume",
      description:
        "Queue one resume request only after the company has explicitly confirmed that Harper should obtain it, and only after read_talent shows no accessible resume file. First tell the company to review the existing profile and ask whether Harper should request more. This is terminal and must be the only tool call in the message.",
      parameters: {
        additionalProperties: false,
        properties: {
          roleId: { description: "Exact role ID.", type: "string" },
          talentId: { description: "Exact talent ID.", type: "string" },
        },
        required: ["talentId", "roleId"],
        type: "object",
      },
    },
  },
  /*
   * Candidate connection tools are temporarily disabled. Do not expose these
   * to the model until the outbound-introduction workflow is ready.
   *
  {
    type: "function",
    function: {
      name: "prepare_candidate_connection",
      description:
        "Prepare a confirmation for an initial request to meet or introduce one candidate. Resolve the exact role, candidate, and recommendation first. This does not change any stage or send email. Call this before replying with the required explanation of email recipients and connection options; the later confirmed decision can only use a preparation from an earlier assistant reply in the same conversation thread.",
      parameters: {
        additionalProperties: false,
        properties: {
          recommendationId: {
            description:
              "Exact recommendation ID for this candidate in the selected role.",
            type: "string",
          },
          roleId: {
            description: "Exact role ID for the candidate connection.",
            type: "string",
          },
          talentId: {
            description: "Exact talent ID for the candidate connection.",
            type: "string",
          },
        },
        required: ["roleId", "talentId", "recommendationId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_candidate_connection",
      description:
        "Carry out a confirmed decision for one candidate who is awaiting a connection. Resolve the exact role, candidate, and recommendation first. Do not call this on an initial request to meet a candidate: first explain the connection choices and ask for confirmation. For accept, intro_email sends a warm introduction email and direct_contact only marks connected, so the company must contact the candidate itself. decline moves the candidate to process stopped. This cannot schedule a calendar meeting and rejects candidates not currently awaiting a connection.",
      parameters: {
        additionalProperties: false,
        properties: {
          connectionMethod: {
            description:
              "For accept only. intro_email is the default and sends a warm introduction email, CCing supplied recipients or the requester when omitted. direct_contact changes the status without sending Harper email.",
            enum: ["intro_email", "direct_contact"],
            type: "string",
          },
          confirmed: {
            description:
              "Must be true only after the user explicitly confirmed this exact connection method and its email recipients, or explicitly chose to contact the candidate directly.",
            type: "boolean",
          },
          decision: {
            description:
              "accept to begin a connection, or decline to stop this candidate's process.",
            enum: ["accept", "decline"],
            type: "string",
          },
          introEmails: {
            description:
              "Optional company recipients for a warm introduction. For accept with intro_email, the requester is CCed if this is omitted.",
            items: { type: "string" },
            maxItems: 10,
            type: "array",
          },
          recommendationId: {
            description:
              "Exact recommendation ID for this candidate in the selected role.",
            type: "string",
          },
          reason: nullableText(
            "Optional short reason for accepting or declining. This is recorded in the candidate progress history.",
            2_000
          ),
          roleId: {
            description: "Exact role ID for the candidate decision.",
            type: "string",
          },
          talentId: {
            description: "Exact talent ID for the candidate decision.",
            type: "string",
          },
        },
        required: [
          "decision",
          "confirmed",
          "roleId",
          "talentId",
          "recommendationId",
        ],
        type: "object",
      },
    },
  },
  */
] as const;

export function getEnabledOrgAgentTools() {
  return ORG_AGENT_TOOLS;
}

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName) &&
    !DISABLED_ORG_AGENT_TOOL_NAMES.has(value as OrgAgentToolName)
  );
}
