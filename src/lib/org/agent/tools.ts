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
  "update_company",
  "update_role",
  "prepare_candidate_connection",
  "decide_candidate_connection",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

// Candidate connection mutations are intentionally paused until this flow is
// ready to be enabled in production again. Keep the names in the type union so
// the dormant execution code remains type-checked, but reject any invocation.
const DISABLED_ORG_AGENT_TOOL_NAMES = new Set<OrgAgentToolName>([
  "prepare_candidate_connection",
  "decide_candidate_connection",
]);

const nullableText = (description: string, maxLength: number) => ({
  description,
  maxLength,
  type: ["string", "null"],
});

export const ORG_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_talents",
      description:
        "Find company-visible candidates by name, email, headline, talent ID, or position title. Returns a bounded page with stable talent/role IDs, stage, and brief fit. Use read_role, not this search, for a position's whole pipeline.",
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
        "Read one company-visible candidate after resolving talentId. Returns every visible role/stage entry and bounded recent progress. Set includeProfile only when bio, resume, work, or education is needed because it is much larger.",
      parameters: {
        additionalProperties: false,
        properties: {
          includeProfile: {
            description:
              "Include bio, resume, work, education, and extras; default false.",
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
        "Read one role's details, exact whole-pipeline stage counts, stage definitions, a bounded candidate page, and recent progress. For overall pipeline/status/count questions omit stage. Use stage only when the user asks for one specific stage's people. Omit the description when only pipeline state is needed.",
      parameters: {
        additionalProperties: false,
        properties: {
          includeDescription: {
            description: "Include the full JD; default true.",
            type: "boolean",
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
          roleId: {
            description: "Exact role ID.",
            type: "string",
          },
          stage: {
            description:
              "Only filter people when one specific stage was requested. Omit for whole-pipeline status/count questions. Example: connected or custom:<id>.",
            maxLength: 100,
            type: "string",
          },
        },
        required: ["roleId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_company",
      description:
        "Partially update company-wide description, candidate pitch, or durable recruiting criteria. Only supplied fields change; request must be the complete merged replacement. Returns updated or already_reflected status.",
      parameters: {
        additionalProperties: false,
        properties: {
          changeSummary: {
            description: "Short audit summary of the requested change.",
            maxLength: 500,
            minLength: 1,
            type: "string",
          },
          companyDescription: nullableText(
            "New company description, or null to clear it.",
            8_000
          ),
          pitch: nullableText(
            "New candidate-facing company pitch, or null to clear it.",
            8_000
          ),
          request: nullableText(
            "Complete company-wide recruiting request after merging the user's change, or null to clear it.",
            6_000
          ),
        },
        required: ["changeSummary"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_role",
      description:
        "Partially update one resolved role. Only supplied fields change; request must be the complete merged replacement, so call read_role first when it was clipped or omitted. Do not call while multiple roles are plausible; returns updated or already_reflected status.",
      parameters: {
        additionalProperties: false,
        properties: {
          changeSummary: {
            description: "Short audit summary of the requested change.",
            maxLength: 500,
            minLength: 1,
            type: "string",
          },
          description: nullableText(
            "New position description/JD, or null to clear it.",
            20_000
          ),
          employmentTypes: {
            description:
              "Replacement employment types. An empty array clears the field.",
            items: {
              enum: ["full_time", "part_time", "internship", "contract"],
              type: "string",
            },
            maxItems: 4,
            type: "array",
          },
          externalJdUrl: nullableText(
            "External JD URL, or null to clear it.",
            2_000
          ),
          locationText: nullableText(
            "Human-readable position location, or null to clear it.",
            300
          ),
          name: {
            description: "New position title.",
            maxLength: 200,
            minLength: 1,
            type: "string",
          },
          request: nullableText(
            "Complete position-specific recruiting request after merging the user's change, or null to clear it.",
            6_000
          ),
          roleId: {
            description: "Exact position ID to update.",
            type: "string",
          },
          status: {
            description: "Replacement position status.",
            enum: ["top_priority", "active", "paused", "ended"],
            type: "string",
          },
          workMode: {
            description: "Replacement work mode, or null to clear it.",
            enum: ["onsite", "hybrid", "remote", null],
            type: ["string", "null"],
          },
        },
        required: ["roleId", "changeSummary"],
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

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName) &&
    !DISABLED_ORG_AGENT_TOOL_NAMES.has(value as OrgAgentToolName)
  );
}
