export const ORG_AGENT_TOOL_NAMES = [
  "update_role_request",
  "update_company_request",
  "schedule_meeting",
  "read_role_feed",
  "read_candidate_context",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

export type OrgAgentRequestImpact =
  | "calibration_note"
  | "hard_filter"
  | "soft_preference";

export type OrgAgentMeetingTopic =
  | "custom_search"
  | "integration"
  | "new_role"
  | "other"
  | "pricing_or_contract"
  | "workflow_question";

const requestUpdateProperties = {
  changeSummary: {
    description:
      "Short Korean audit summary of the exact criterion added, changed, or removed.",
    maxLength: 500,
    minLength: 1,
    type: "string",
  },
  impact: {
    description: "How strongly this change should affect future matching.",
    enum: ["hard_filter", "soft_preference", "calibration_note"],
    type: "string",
  },
  nextRequest: {
    description:
      "Complete replacement request text after merging the new instruction with all useful existing criteria. Never include candidate names or talent IDs.",
    maxLength: 6_000,
    minLength: 1,
    type: "string",
  },
  referencedTalentIds: {
    description:
      "Stable talent IDs used only as evidence for this change. These IDs must not appear in nextRequest.",
    items: { type: "string" },
    maxItems: 3,
    type: "array",
  },
} as const;

export const ORG_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_role_request",
      description:
        "Update the active role's private recruiting criteria for future candidate discovery and recommendations. Use for clear, durable role-specific changes.",
      parameters: {
        additionalProperties: false,
        properties: requestUpdateProperties,
        required: ["nextRequest", "changeSummary", "impact"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_company_request",
      description:
        "Update the current company's private recruiting criteria across all roles. Use only for an explicitly company-wide durable principle.",
      parameters: {
        additionalProperties: false,
        properties: requestUpdateProperties,
        required: ["nextRequest", "changeSummary", "impact"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_meeting",
      description:
        "Create a user-clickable CTA for Harper-team help with an unsupported or high-touch request. This only creates the CTA; it does not send the request until clicked.",
      parameters: {
        additionalProperties: false,
        properties: {
          reason: {
            description: "Concise Korean reason Harper-team help is needed.",
            maxLength: 800,
            minLength: 1,
            type: "string",
          },
          suggestedMessage: {
            description: "Optional short Korean sentence shown with the CTA.",
            maxLength: 300,
            type: "string",
          },
          topic: {
            enum: [
              "new_role",
              "custom_search",
              "workflow_question",
              "pricing_or_contract",
              "integration",
              "other",
            ],
            type: "string",
          },
        },
        required: ["topic", "reason"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_role_feed",
      description:
        "Read older or filtered activity for the active role pipeline when the latest 20 activity items in context are insufficient.",
      parameters: {
        additionalProperties: false,
        properties: {
          before: {
            description: "Optional ISO timestamp cursor for older activity.",
            type: "string",
          },
          eventTypes: {
            items: {
              enum: [
                "recommended",
                "accepted",
                "rejected",
                "note",
                "stage_changed",
              ],
              type: "string",
            },
            maxItems: 5,
            type: "array",
          },
          limit: {
            default: 20,
            maximum: 50,
            minimum: 1,
            type: "integer",
          },
          talentIds: {
            items: { type: "string" },
            maxItems: 5,
            type: "array",
          },
        },
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_candidate_context",
      description:
        "Read compact company-visible context for up to 3 candidates. The server returns data only for candidates in the active role pipeline.",
      parameters: {
        additionalProperties: false,
        properties: {
          includeFeed: {
            description: "Include up to 15 recent role activity items for these candidates.",
            type: "boolean",
          },
          talentIds: {
            items: { type: "string" },
            maxItems: 3,
            minItems: 1,
            type: "array",
          },
        },
        required: ["talentIds"],
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
