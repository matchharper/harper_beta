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
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

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
] as const;

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName)
  );
}
