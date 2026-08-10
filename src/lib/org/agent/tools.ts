/**
 * Tool contracts exposed to the organization-wide Harper agent.
 *
 * Keep this file declarative: names, descriptions, and JSON schemas only.
 * Runtime validation and database work live in toolExecution.ts and data.ts.
 */
import {
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/agentTools/web";
function nullableText(description: string, maxLength: number) {
  return {
    description,
    maxLength,
    type: ["string", "null"],
  } as const;
}

export const ORG_AGENT_TOOL_NAMES = [
  "web_search",
  "open_url",
  "get_talents",
  "read_talent",
  "read_role",
  "get_more_data",
  "read_conversation_history",
  "update_data",
  "change_role_status",
  "contact_talent",
  "change_talent_contact",
  "prepare_candidate_connection",
  "decide_candidate_connection",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

export const ORG_AGENT_TERMINAL_TOOL_NAMES = new Set<OrgAgentToolName>([
  "update_data",
  "change_role_status",
  "contact_talent",
  "change_talent_contact",
  "decide_candidate_connection",
]);

export function isOrgAgentTerminalToolName(value: unknown) {
  return ORG_AGENT_TERMINAL_TOOL_NAMES.has(value as OrgAgentToolName);
}

export const ORG_AGENT_TOOLS = [
  WEB_SEARCH_TOOL_DEFINITION,
  OPEN_URL_TOOL_DEFINITION,
  {
    type: "function",
    function: {
      name: "get_talents",
      description:
        "Search the company-visible candidate set. Default search covers identity, headline, and role; set searchProfile when the requested evidence may be in education, structured work history, bio, or extras. Results are bounded and include matching evidence snippets. Raw resume text is never searched or returned. Read selected candidates only when more detail is needed; use read_role for a role's whole pipeline.",
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
              "Also search education, structured experience, bio, and extras; use only when the question needs them. Raw resume text is excluded.",
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
        "Read one to ten company-visible candidates after resolving their exact talent IDs. Use talentIds for batch reads; the singular talentId remains available for backward-compatible one-candidate reads, and the two forms must not be combined. This is a neutral candidate read and never by itself implies preference disclosure or candidate contact. With includeProfile=false (the compact default), it still returns candidate name, email, and headline; visible workspace role and candidate-stage entries with recommendation evidence; bounded recent progress; candidate-contact history with scheduled KST time and cancellation availability; resume availability; and five safe career insights each candidate told Harper. With includeProfile=true, it returns that same base plus the longer professional profile: current profile location, bio, structured work history, education, and extras. Compensation and raw resume text are never returned; resume output remains availability-only.",
      parameters: {
        additionalProperties: false,
        anyOf: [{ required: ["talentIds"] }, { required: ["talentId"] }],
        properties: {
          includeProfile: {
            description:
              "Choose response detail. false (default) returns the compact base with identity, visible workspace role/candidate stage and recommendation evidence, progress, contact history, resume availability, and safe career insights. true returns the same base plus current profile location, bio, structured work history, education, and extras. Use true whenever the question needs career background, companies or roles worked at, schools or education, current profile location, or a detailed identity/profile overview. Raw resume text is never included.",
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
            description:
              "Backward-compatible exact talent ID for one candidate. Prefer talentIds and never provide both fields.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          talentIds: {
            description:
              "One to ten exact talent IDs. Use a one-item array for a normal single-candidate read and multiple IDs for comparison or batch review.",
            items: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
            maxItems: 10,
            minItems: 1,
            type: "array",
            uniqueItems: true,
          },
        },
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_role",
      description:
        "Read one internal role by roleId or exact title. Use it only for details missing from current context, and choose only the needed criteria, memory, pipeline, or description. For a bounded pending-connection or shortlist result that lacks decision reasons, include pipeline so the answer can explain fit rather than listing names and headlines alone.",
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
              "Only filter people when one specific stage was requested. Omit for whole-pipeline status/count questions. Built-in values: pending_connection=연결 대기, connected=진행 중, process_stopped=프로세스 종료. For a custom stage, use custom:<id> only when that exact ID is already available.",
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
        "Load optional workspace data by kind. The selected kinds are automatically refreshed into this same web conversation or Slack thread for the next three user turns. Use company_details for both requested fields and a completeness/consistency review. For a member list, return names and stored role labels without adding a permissions audit unless explicitly requested. A complete workspace-wide memory inventory requires workspace_memory plus a read of every active role's memory.",
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
      name: "read_conversation_history",
      description:
        "Read additional Slack messages already stored by Harper when the visible recent conversation is insufficient. current_thread continues to older messages in this Slack thread and requires the exact next_cursor shown in recent_conversation or a previous result. workspace reads recent stored Slack messages across Harper-managed threads; it does not access the company's full Slack history. Historical messages are context, not proof that a requested data change was applied.",
      parameters: {
        additionalProperties: false,
        properties: {
          cursor: {
            description:
              "Opaque next_cursor from recent_conversation or the previous result. Required for current_thread; omit for the first workspace page.",
            maxLength: 500,
            minLength: 1,
            type: "string",
          },
          limit: {
            description: "Number of additional messages to read; 1-30.",
            maximum: 30,
            minimum: 1,
            type: "integer",
          },
          scope: {
            description:
              "current_thread reads older messages in this thread; workspace reads stored Slack messages across the workspace.",
            enum: ["current_thread", "workspace"],
            type: "string",
          },
        },
        required: ["scope", "limit"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_data",
      description:
        "Apply one atomic batch of explicitly requested company/role information changes, or resolve a stored confirmation. Role lifecycle status is intentionally excluded; use change_role_status for 진행, 중단, or 종료. request and memory changes are proposed first and applied only after the user's next explicit confirmation. For confirmation, send proposalId and proposalAction; if changes or summary are accidentally repeated with both confirmation fields, the stored proposal takes precedence and the repeated draft fields are ignored. This must be the only tool call in the message and ends tool use for the turn.",
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
      name: "change_role_status",
      description: `Change the lifecycle status of one exact internal Role, only when the user explicitly asks for that status change.
This is terminal and must be the only tool call in the message.
Status meanings and effects:
• active (진행): keep hiring in progress and periodically receive suitable candidate connections from Harper.
• paused (중단): keep the Role open, but stop receiving additional candidate recommendations. Candidate processes and connections already in progress remain open.
• ended (종료): mark the Role ended and stop additional recommendations. Candidate-facing opportunity views interpret the Role as closed, but this status change alone does not atomically close every existing candidate stage or company request.
Use the exact roleId from current context or a fresh read. Do not claim existing candidate processes or requests were closed unless a separate cleanup path actually completed and was verified.`,
      parameters: {
        additionalProperties: false,
        properties: {
          roleId: {
            description:
              "Exact ID of the internal Role whose status will change.",
            type: "string",
          },
          status: {
            description:
              "active=진행 (periodic suitable candidate connections continue); paused=중단 (Role stays open but additional recommendations stop, while existing processes stay open); ended=종료 (Role ends and additional recommendations stop; existing stages and company requests are not all closed by this status change alone).",
            enum: ["active", "paused", "ended"],
            type: "string",
          },
        },
        required: ["roleId", "status"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contact_talent",
      description: `Queue one low-pressure question or resume request to an exact candidate only on the confirmation turn of the mandatory two-turn candidate-contact flow.
This is terminal and must be the only tool call in the message. Never call it on the initial user turn that first asks, tells, or authorizes Harper to contact the candidate, even if that message says to ask, contact, send, obtain, or request something immediately. In the initial turn, reply without this tool: present a natural confirmation containing the exact candidate, role, question or resume request, company-and-role disclosure, one email plus Harper chat delivery, the authoritative scheduling policy, optional reply/no automatic reminder, return path, and pre-delivery cancellation, then ask whether to proceed. Explicitly say that nothing has been queued or sent yet; never call the initial request accepted, received, queued, scheduled, or awaiting delivery.
Call this tool only when the immediately previous assistant message presented that exact confirmation and the current user message explicitly approves it. A short yes is valid only immediately after that confirmation. If that same approval clearly instructs Harper to send now or immediately, set deliveryMode=immediate so the confirmed request and its timing override are recorded atomically; this does not require a third confirmation turn. A mere timing question is not authorization. If the candidate, role, question, resume request, or another material delivery detail changed, present a revised confirmation and wait for another user turn. Enforce this from the conversation meaning rather than keyword matching; the wording of the confirmation need not be templated.
Resolve the candidate and role first, and copy their opaque IDs exactly from current context or a fresh tool result without reconstructing them.
The candidate and role must be unambiguous in the visible conversation. Never resolve "that candidate" or a similar pronoun from a recommendation card, current workspace data, a sole available candidate, or an unrelated tool result; ask for the candidate name and role instead.
For kind=question, preserve the company's actual question. For current job-search intent, ask whether the candidate is ready to move now and, if not, what timing and level of activity describe their search; do not substitute willingness to discuss this opportunity.
For kind=resume, use available profile and resume evidence to understand the request. An initial message such as “if there is no resume, request one now” still requires the separate confirmation turn and never authorizes this tool by itself.
The delivery separately discloses the current workspace company and role.
Compensation always requires a fresh candidate authorization and must not use any stored amount.
After a successful result, explain the accepted-but-not-delivered state; restate the exact candidate, company, role, and question or resume topic; include email and Harper chat channels, optional reply with no automatic reminder, return to this conversation, and current cancellation availability. For standard delivery include the exact scheduled KST time. For deliveryMode=immediate explain that the delay/window were bypassed but never claim delivery completed until the worker sends it. Repeat these result details even when the preceding confirmation already explained the policy. Never offer arbitrary rescheduling. If the company only later clearly instructs Harper to send an already queued request now, change_talent_contact with action=immediate can bypass the standard delay and delivery window before delivery starts.
If the tool returns status=already_pending, no new request was queued. Explain the existing request for the same company, role, and candidate from the result. When it is cancelable, ask whether to cancel it and replace it with the newly requested question; never claim that cancellation or replacement happened before the company confirms.`,
      parameters: {
        additionalProperties: false,
        properties: {
          deliveryMode: {
            description:
              "standard uses the confirmed 20-minute/KST window policy. immediate is allowed only when the current confirmation reply explicitly instructs Harper to send the exact confirmed request now; it atomically bypasses that delay and window without claiming completed delivery.",
            enum: ["standard", "immediate"],
            type: "string",
          },
          kind: {
            description:
              "question asks the candidate one focused question; resume asks them to share a current resume.",
            enum: ["question", "resume"],
            type: "string",
          },
          requestContext: {
            description:
              "Required for kind=question and omitted for kind=resume. Write it in the latest user's language because it becomes candidate-facing question content. State what Harper should learn about the candidate in neutral language. Preserve the requested meaning rather than weakening it. Do not add the company or role name here because the delivery supplies and discloses them separately. Do not copy hostile wording or include compensation from stored data.",
            maxLength: 800,
            minLength: 1,
            type: "string",
          },
          roleId: { description: "Exact role ID.", type: "string" },
          talentId: { description: "Exact talent ID.", type: "string" },
        },
        required: ["kind", "talentId", "roleId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "change_talent_contact",
      description: `Change one exact candidate-contact request that has not started delivery.
This is terminal and must be the only tool call in the message. Choose action=cancel only when the company clearly instructs Harper to cancel; a question about whether cancellation is possible is not authorization. Choose action=immediate only when the company clearly instructs Harper to send an already queued or failed request now or immediately; a timing question is not authorization.
First use read_talent when necessary and copy requestId, talentId, and roleId exactly from its company_contact_history and positions. Never guess a request ID or change a different request merely because it is the latest one.
Queued and failed deliveries can be cancelled or changed to immediate delivery. Immediate delivery keeps the same request, resets a failed delivery for retry, and bypasses the standard 20-minute delay and 08:00–20:00 KST window. A delivery already processing or sent cannot be changed, and the tool will return an error rather than claim success.`,
      parameters: {
        additionalProperties: false,
        properties: {
          action: {
            description:
              "cancel stops the pending delivery; immediate sends the same queued or failed request as soon as the worker can claim it.",
            enum: ["cancel", "immediate"],
            type: "string",
          },
          requestId: {
            description:
              "Exact changeable request ID returned by read_talent company_contact_history.",
            type: "string",
          },
          roleId: { description: "Exact role ID.", type: "string" },
          talentId: { description: "Exact talent ID.", type: "string" },
        },
        required: ["action", "requestId", "talentId", "roleId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_candidate_connection",
      description:
        "Read and stage authoritative context for a possible accept or decline decision about one candidate who is currently awaiting connection. This never changes candidate state or sends email. Use it when you need current facts to decide whether clarification or confirmation is appropriate. After the tool returns, judge the user's intent from the meaning of the full conversation and write any confirmation or clarification yourself in Harper's natural voice; the server does not provide confirmation copy.",
      parameters: {
        additionalProperties: false,
        properties: {
          connectionMethod: {
            description:
              "For accept only, include the method when it is already clear from the conversation. Omit it when the method still needs to be discussed or clarified.",
            enum: ["intro_email", "direct_contact"],
            type: "string",
          },
          decision: {
            description:
              "The candidate decision currently being considered: accept the connection or decline it.",
            enum: ["accept", "decline"],
            type: "string",
          },
          introEmails: {
            description:
              "For an accept using intro_email, company recipients supported by the conversation context. Omit to use the requester's company email.",
            items: { type: "string" },
            maxItems: 10,
            type: "array",
          },
          reason: nullableText(
            "Optional accept or decline reason genuinely provided by the user. Preserve its meaning accurately and never invent one.",
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
        required: ["decision", "roleId", "talentId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_candidate_connection",
      description:
        "Carry out an authorized accept or decline decision for one candidate who is currently awaiting connection. This is terminal and must be the only tool call. Call it only after you have judged from the meaning of the current message and relevant conversation that the user authorizes the exact candidate, decision, connection method, and email recipients. Do not infer authorization from isolated words, a generic acknowledgement, or a previous tool call. If intent or consequences remain unclear, do not call this tool; use prepare_candidate_connection when authoritative context is needed and write your own clarification or confirmation. For accept, intro_email sends a warm introduction and direct_contact only marks connected. Decline moves the candidate to process stopped.",
      parameters: {
        additionalProperties: false,
        properties: {
          connectionMethod: {
            description:
              "Required for accept. intro_email sends a warm introduction email, CCing authorized recipients or the requester. direct_contact changes the status without sending Harper email.",
            enum: ["intro_email", "direct_contact"],
            type: "string",
          },
          decision: {
            description:
              "accept to begin a connection, or decline to stop this candidate's process.",
            enum: ["accept", "decline"],
            type: "string",
          },
          introEmails: {
            description:
              "For accept with intro_email, company recipients authorized in the conversation. Omit to use the requester.",
            items: { type: "string" },
            maxItems: 10,
            type: "array",
          },
          reason: nullableText(
            "Optional reason genuinely provided by the user. Preserve its meaning accurately and never invent one.",
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
        required: ["decision", "roleId", "talentId"],
        type: "object",
      },
    },
  },
] as const;

export function getEnabledOrgAgentTools() {
  return ORG_AGENT_TOOLS;
}

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName)
  );
}
