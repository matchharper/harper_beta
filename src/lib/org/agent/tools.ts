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
import { COMPANY_SIDE_LLM_DATA_KEYS } from "@/lib/org/agent/companyDataCatalog";
function nullableText(description: string, maxLength: number) {
  return {
    description,
    maxLength,
    type: ["string", "null"],
  } as const;
}

export const ORG_AGENT_TOOL_NAMES = [
  "start_role_creation",
  "web_search",
  "open_url",
  "get_talents",
  "read_talent",
  "read_role",
  "get_more_data",
  "read_conversation_history",
  "update_role_criteria",
  "update_data",
  "change_role_status",
  "manage_role_pipeline_stages",
  "contact_talent",
  "move_candidate_stage",
  "manage_interview_availability",
  "prepare_candidate_connection",
  "decide_candidate_connection",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

export const ORG_AGENT_TERMINAL_TOOL_NAMES = new Set<OrgAgentToolName>([
  "start_role_creation",
  "update_role_criteria",
  "update_data",
  "change_role_status",
  "manage_role_pipeline_stages",
  "contact_talent",
  "move_candidate_stage",
  "manage_interview_availability",
  "decide_candidate_connection",
]);

export function isOrgAgentTerminalToolName(value: unknown) {
  return ORG_AGENT_TERMINAL_TOOL_NAMES.has(value as OrgAgentToolName);
}

export const ORG_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "start_role_creation",
      description:
        "Start a dedicated Slack thread for one new role and hand the user's exact recent Slack context to the role-creation flow. Supply the exact role title established from the available context and the smallest number of recent messages needed to preserve the hiring request. Do not ask the user to restate a title that is already clear. The dedicated role-creation flow automatically continues before the user has to say anything there. The result provides an exact required continuation link plus guidance and an illustrative example; author the final handoff reply naturally as Harper rather than copying fixed system-status text. This tool is Slack-only and terminal.",
      parameters: {
        additionalProperties: false,
        properties: {
          contextMessageCount: {
            description:
              "How many recent messages from this Slack thread to transfer, including the current user message. Use 1 when the current message is self-contained. Include only directly relevant user/Harper turns needed to understand the title, JD, link, file, constraints, or a clarification that established them.",
            maximum: 12,
            minimum: 1,
            type: "integer",
          },
          roleTitle: {
            description:
              "The exact role title established from the available context, including level or qualifiers when present.",
            maxLength: 200,
            minLength: 1,
            type: "string",
          },
        },
        required: ["roleTitle", "contextMessageCount"],
        type: "object",
      },
    },
  },
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
        minProperties: 1,
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
        "Read one internal role by roleId or exact title. Use it only for details missing from current context, and choose only the needed criteria, memory, pipeline, or description. criteria returns both the broad internal role request and the optional 0-6 structured evaluation dimensions. pipeline returns the complete ordered stage references with exact stage IDs plus each returned candidate's exact current stage ID; read it before a pipeline structure edit or candidate stage move. For a bounded pending-connection or shortlist result that lacks decision reasons, include pipeline so the answer can explain fit rather than listing names and headlines alone.",
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
              "Legacy workspace request text that must be returned in full for an edit. The company information document is already present in every prompt. Only use with company_details.",
            items: {
              enum: ["workspace_request"],
              type: "string",
            },
            maxItems: 1,
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
      name: "update_role_criteria",
      description:
        "Edit or fully replace one role's optional high-level evaluation dimensions after the user explicitly asks. For one or more targeted additions, updates, or deletions, use edits and copy an existing dimension's exact name into targetName. Use criteria only for a full-list replacement. Read the role with include=criteria first when the current criteria are not visible. The final list may contain 0-6 dimensions; when useful, prefer 2-4 without adding filler. Consolidate related technical qualifications into one technical-fit dimension instead of one criterion per technology. Provide exactly one of criteria or edits. This must be the only tool call in the message and ends tool use for the turn.",
      parameters: {
        additionalProperties: false,
        minProperties: 2,
        properties: {
          criteria: {
            description:
              "Full replacement list of zero to six high-level evaluation dimensions. When useful, prefer two to four without adding filler, and consolidate related technical qualifications into one technical-fit dimension. Do not use for a targeted add, update, or delete.",
            items: {
              additionalProperties: false,
              properties: {
                criteria: {
                  maxLength: 8000,
                  minLength: 1,
                  type: "string",
                },
                name: {
                  maxLength: 200,
                  minLength: 1,
                  type: "string",
                },
              },
              required: ["name", "criteria"],
              type: "object",
            },
            maxItems: 6,
            minItems: 0,
            type: "array",
          },
          edits: {
            description:
              "One to six targeted edits, applied in order and saved atomically. add requires name and criteria. update requires the exact current targetName and at least one replacement field, name or criteria. delete requires only the exact current targetName. A delete may reduce the final list to zero items, and an add cannot raise it above six.",
            items: {
              additionalProperties: false,
              properties: {
                criteria: {
                  description:
                    "Detailed replacement text for add, or optional new detailed text for update.",
                  maxLength: 8000,
                  minLength: 1,
                  type: "string",
                },
                name: {
                  description:
                    "Dimension name for add, or optional new name for update.",
                  maxLength: 200,
                  minLength: 1,
                  type: "string",
                },
                operation: {
                  enum: ["add", "update", "delete"],
                  type: "string",
                },
                targetName: {
                  description:
                    "Exact current dimension name for update or delete. Omit for add.",
                  maxLength: 200,
                  minLength: 1,
                  type: "string",
                },
              },
              required: ["operation"],
              type: "object",
            },
            maxItems: 6,
            minItems: 1,
            type: "array",
          },
          roleId: {
            description: "Exact internal role ID.",
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
                  enum: COMPANY_SIDE_LLM_DATA_KEYS.filter(
                    (key) => key !== "role_status"
                  ),
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
• deleted (삭제): apply the same internal-Role deletion as the web product by atomically setting status=deleted and is_expired=true. The Role is removed from active Role surfaces and additional recommendations stop, but existing candidate stages and company requests are not all closed by this deletion alone.
Use deleted only for an explicit request to delete the exact Role. Do not reinterpret 종료 as deletion. Use the exact roleId from current context or a fresh read. Do not claim existing candidate processes or requests were closed unless a separate cleanup path actually completed and was verified.`,
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
              "active=진행 (periodic suitable candidate connections continue); paused=중단 (Role stays open but additional recommendations stop, while existing processes stay open); ended=종료 (Role ends and additional recommendations stop); deleted=삭제 (the Role is soft-deleted exactly like the web deletion flow with status=deleted and is_expired=true). Existing stages and company requests are not all closed by ended or deleted alone.",
            enum: ["active", "paused", "ended", "deleted"],
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
      description: `Manage the lifecycle of one exact candidate-contact draft and its delivery.
This is terminal and must be the only tool call in its assistant message. A read_talent call may occur in an earlier tool loop only when candidate or role resolution genuinely requires it.
Use action=create_draft on the company's initial request. It validates the exact candidate and Role, calls the bounded candidate-copy writer, and saves the complete subject and body without queuing delivery. The server appends only the exact body; write the surrounding confirmation yourself in a natural voice without separately reciting the subject or Role.
Use action=revise_draft when the company asks to edit the currently presented draft. Copy contactId and expectedRevision from pending_candidate_contact_drafts or candidate_contact_draft message context, and pass only the company's editInstruction. The server loads the authoritative current copy, writes a new revision, and appends the full revised body again. Write the surrounding explanation and confirmation yourself. Never edit a queued or sent contact.
Use action=schedule only when the immediately previous Harper message presented the same contactId and revision body and the current company message explicitly approves it. A short yes counts only in that sequence. deliveryMode=standard schedules at least 20 minutes later within 08:00–20:00 KST. deliveryMode=immediate is allowed only when the approval explicitly says to send now. Scheduling never regenerates or rewrites copy.
Use action=immediate only for a clear instruction to send an already queued, still-changeable contact now. It preserves the approved subject and body and moves that existing delivery forward; do not cancel or recreate it. It is unavailable for an unapproved draft or a delivery that has started.
Use action=cancel only for a clear cancellation instruction. It can discard a draft or cancel a queued/failed delivery that has not started. It cannot cancel processing or sent delivery.
For create_draft, resolve opaque IDs exactly. The candidate must be in 연결 대기 for the Role and have a contact email. kind=resume is unavailable when a public primary resume is already visible. For kind=question, preserve the requested meaning in requestContext. Compensation always requires fresh candidate authorization and must never expose stored compensation.
Do not call read_talent between normal create_draft, revise_draft, and schedule turns merely to recover an ID: use the authoritative pending draft context. If several drafts make the reference ambiguous, ask which candidate and Role the company means rather than guessing.`,
      parameters: {
        additionalProperties: false,
        properties: {
          action: {
            description: "Lifecycle action for this candidate contact.",
            enum: [
              "create_draft",
              "revise_draft",
              "schedule",
              "immediate",
              "cancel",
            ],
            type: "string",
          },
          contactId: {
            description:
              "Exact contact ID. Required for revise_draft, schedule, and cancel; omit for create_draft.",
            type: "string",
          },
          deliveryMode: {
            description:
              "For schedule only. standard uses the 20-minute/KST window; immediate requires explicit send-now approval.",
            enum: ["standard", "immediate"],
            type: "string",
          },
          editInstruction: {
            description:
              "For revise_draft only: the company's requested change to the current exact copy.",
            maxLength: 2000,
            minLength: 1,
            type: "string",
          },
          expectedRevision: {
            description:
              "Exact currently presented revision. Required for revise_draft and schedule.",
            minimum: 1,
            type: "integer",
          },
          kind: {
            description:
              "For create_draft only: question asks one focused question; resume requests a current resume.",
            enum: ["question", "resume"],
            type: "string",
          },
          requestContext: {
            description:
              "For create_draft with kind=question: a neutral description of the exact information requested, in the latest user's language. Never include stored compensation.",
            maxLength: 800,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "For create_draft only: exact Role ID.",
            type: "string",
          },
          talentId: {
            description: "For create_draft only: exact candidate ID.",
            type: "string",
          },
        },
        required: ["action"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_role_pipeline_stages",
      description: `Add, rename, or delete company-defined pipeline stages for one exact Role after an explicit user request.
This is terminal and must be the only tool call in the message. Read the Role with include=pipeline first unless the complete ordered stage list and exact stage IDs are already visible in this conversation.
For action=add, provide labels in the exact requested order. Existing exact normalized labels are left unchanged and missing labels are appended after the current company-defined stages. Do not invent interview stages or silently merge semantically similar names.
For action=rename, copy one exact custom stageId from read_role and provide the requested new label.
For action=delete, copy one exact custom stageId from read_role. Deletion is allowed only when no candidate currently occupies that stage; otherwise the tool fails without moving candidates or deleting the stage. Built-in stages can never be renamed or deleted.
This operation changes only the Role's pipeline structure. It does not move candidates, contact candidates, send email, or change Role criteria, request, memory, or lifecycle status.`,
      parameters: {
        additionalProperties: false,
        properties: {
          action: {
            enum: ["add", "rename", "delete"],
            type: "string",
          },
          label: {
            description:
              "New label for action=rename. Omit for add and delete.",
            maxLength: 40,
            minLength: 1,
            type: "string",
          },
          labels: {
            description:
              "One to six labels for action=add, in the order they should appear. Omit for rename and delete.",
            items: {
              maxLength: 40,
              minLength: 1,
              type: "string",
            },
            maxItems: 6,
            minItems: 1,
            type: "array",
          },
          roleId: {
            description: "Exact internal Role ID.",
            type: "string",
          },
          stageId: {
            description:
              "Exact custom:<id> stage ID returned by read_role. Required for rename and delete; omit for add.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
        },
        required: ["action", "roleId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_candidate_stage",
      description: `Move one exact candidate between already-active company pipeline stages after the user explicitly asks for that stage change.
This is terminal and must be the only tool call in the message. Read the Role with include=pipeline first unless the candidate's exact currentStageId and the complete ordered stage list with exact stage IDs are already visible. For “next stage”, select the immediate next active stage in that authoritative order; never infer a generic recruiting sequence from labels alone.
Both expectedCurrentStageId and targetStageId must be connected, final_offer, or a custom:<id> stage belonging to this Role. This tool deliberately cannot move a candidate from or to pending_connection, process_stopped, accepted, or archived. Use the existing candidate connection decision flow for starting, stopping, or reactivating a connection.
The executor re-reads the candidate and applies compare-and-set protection. If another user changed the stage, it fails instead of overwriting the newer state. A successful move records pipeline progress only: it does not contact the candidate, send email or Slack messages, schedule an interview, or alter Role data.`,
      parameters: {
        additionalProperties: false,
        properties: {
          expectedCurrentStageId: {
            description:
              "Exact current stage ID from a fresh read_role pipeline result.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "Exact internal Role ID.",
            type: "string",
          },
          talentId: {
            description: "Exact candidate talent ID.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          targetStageId: {
            description:
              "Exact destination stage ID from the ordered read_role pipeline result.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
        },
        required: [
          "roleId",
          "talentId",
          "expectedCurrentStageId",
          "targetStageId",
        ],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_interview_availability",
      description:
        "Save the current company user's own interview availability after an explicit natural-language instruction such as '매주 오전 7시부터 오후 8시까지 가능해'. This is a terminal mutation and must be the only tool call in the turn. Use weeklyUpdates to replace only the named weekdays while preserving every unspecified weekday and existing date exception. An empty intervals array means unavailable. Use dateOverrides for exact-date availability or unavailability, and removeDateOverrides to return exact dates to their weekly rule. Set timezone only when the user explicitly provides it or the intended timezone is unambiguous. This tool never changes another member's availability, candidate state, meeting draft, invitation, Calendar event, or Meet link. After saving, explain what changed and ask the user to request or retry the candidate-specific scheduling proposal; do not claim that an invitation was prepared or sent.",
      parameters: {
        additionalProperties: false,
        minProperties: 1,
        properties: {
          dateOverrides: {
            description:
              "Exact-date replacements. Use intervals=[] when the whole date is unavailable. Omitted dates remain unchanged.",
            items: {
              additionalProperties: false,
              properties: {
                date: {
                  description: "Exact local calendar date in YYYY-MM-DD.",
                  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                  type: "string",
                },
                intervals: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      end: {
                        pattern:
                          "^(?:(?:[01]\\d|2[0-3]):(?:00|15|30|45)|24:00)$",
                        type: "string",
                      },
                      start: {
                        pattern: "^(?:[01]\\d|2[0-3]):(?:00|15|30|45)$",
                        type: "string",
                      },
                    },
                    required: ["start", "end"],
                    type: "object",
                  },
                  maxItems: 8,
                  type: "array",
                },
              },
              required: ["date", "intervals"],
              type: "object",
            },
            maxItems: 30,
            type: "array",
          },
          removeDateOverrides: {
            description:
              "Exact YYYY-MM-DD dates whose exception should be removed so the weekly rule applies again.",
            items: {
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              type: "string",
            },
            maxItems: 30,
            type: "array",
            uniqueItems: true,
          },
          timezone: {
            description:
              "IANA timezone such as Asia/Seoul. Omit unless explicitly stated or unambiguous from the request.",
            maxLength: 128,
            minLength: 1,
            type: "string",
          },
          weeklyUpdates: {
            description:
              "Recurring replacements for only the named ISO weekdays: 1=Monday through 7=Sunday. To set every day, include all seven days in one item. Unspecified weekdays remain unchanged.",
            items: {
              additionalProperties: false,
              properties: {
                days: {
                  items: {
                    enum: ["1", "2", "3", "4", "5", "6", "7"],
                    type: "string",
                  },
                  maxItems: 7,
                  minItems: 1,
                  type: "array",
                  uniqueItems: true,
                },
                intervals: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      end: {
                        pattern:
                          "^(?:(?:[01]\\d|2[0-3]):(?:00|15|30|45)|24:00)$",
                        type: "string",
                      },
                      start: {
                        pattern: "^(?:[01]\\d|2[0-3]):(?:00|15|30|45)$",
                        type: "string",
                      },
                    },
                    required: ["start", "end"],
                    type: "object",
                  },
                  maxItems: 8,
                  type: "array",
                },
              },
              required: ["days", "intervals"],
              type: "object",
            },
            maxItems: 7,
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
      name: "prepare_candidate_connection",
      description:
        "Read and stage authoritative context for a possible accept or decline decision. Decline supports a candidate awaiting connection or already in a company-active process, including immediately after acceptance. Accept also supports a previously company-stopped candidate whose earlier Talent acceptance is still authoritative. This never changes candidate state or sends email. Use connectionMethod=schedule_interview as soon as the company asks Harper to arrange a meeting. The server prepares the concise default proposal and meeting confirmation; present its facts naturally without asking title, duration, organizer, attendees, provider, or email copy one by one. If it returns meeting_setup_required, show the schedule link and blocker without asking for approval; no decision context is staged until the blocker is fixed. Always call it with connectionMethod=direct_contact in the turn where the company first asks to use direct contact. A schedule revision calls this tool again with the complete intended overrides. After the tool returns, judge the user's intent from the meaning of the full conversation and write any confirmation or clarification yourself in Harper's natural voice, using the exact server facts.",
      parameters: {
        additionalProperties: false,
        properties: {
          connectionMethod: {
            description:
              "For accept only. Use schedule_interview when the company asks Harper to arrange a meeting. It automatically defaults to the requester as organizer and first attendee, a 60-minute duration, a '[company] <> [candidate] Intro' title, a 14-day offer window, and Google Meet. Do not ask for those fields one by one. Omit or use intro_email for the default CC introduction. Use direct_contact only when the company explicitly asked to contact the candidate itself.",
            enum: ["intro_email", "direct_contact", "schedule_interview"],
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
          meetingAdditionalMessage: nullableText(
            "For schedule_interview only. Optional exact preference or context genuinely supplied by the company. Omit rather than inventing one.",
            2_000
          ),
          meetingAdditionalMessageVisibility: {
            description:
              "For schedule_interview only. Where an explicitly supplied additional message may be used. Defaults to both. candidate and both may later appear in the candidate's locale; internal is never shown externally.",
            enum: ["candidate", "internal", "both"],
            type: "string",
          },
          meetingAttendeeEmails: {
            description:
              "For schedule_interview only. Additional Workspace member emails explicitly requested by the company. The requester remains the default organizer and attendee and is added automatically. Omit when no change was requested.",
            items: { type: "string" },
            maxItems: 10,
            type: "array",
          },
          meetingDurationMinutes: {
            description:
              "For schedule_interview only. Explicit company override in 15-minute increments from 15 to 240. Omit to use 60 minutes; never ask for this field merely because it was omitted.",
            maximum: 240,
            minimum: 15,
            multipleOf: 15,
            type: "integer",
          },
          meetingTitle: nullableText(
            "For schedule_interview only. Explicit company override. Omit to use '[company] <> [candidate] Intro'; never ask for a title merely because it was omitted.",
            200
          ),
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
        "Carry out an authorized accept or decline decision. Decline supports a candidate awaiting connection or already in a company-active process, and accept may reactivate a previously company-stopped candidate. This is terminal and must be the only tool call. Call it only when the immediately previous Harper message asked for approval of the exact candidate, delivery behavior, and recipients or automatic meeting proposal and the current message authorizes all of it; the server verifies that adjacency and otherwise returns confirmation_required without changing state. Do not infer authorization from isolated words or a generic acknowledgement. Use schedule_interview only after a decision_context_ready proposal was presented, never after meeting_setup_required. A simple approval omits all meeting override fields and reuses the stored revision. If the user changes a detail, use prepare_candidate_connection again instead. The current schedule_interview action marks the candidate connected and stores a meeting draft, but does not contact the candidate, create the public scheduling link, send locale email, or create a Calendar event or Google Meet link. For accept, omitted connectionMethod defaults to intro_email, which sends a neutral warm introduction. Use direct_contact only after an explicit request. Never proactively offer direct_contact. Decline moves the candidate to process stopped.",
      parameters: {
        additionalProperties: false,
        properties: {
          connectionMethod: {
            description:
              "For accept, use schedule_interview only after the immediately previous Harper message presented the automatic meeting proposal and the company approved it. Omit or use intro_email for the default warm introduction. Use direct_contact only after an explicit company request.",
            enum: ["intro_email", "direct_contact", "schedule_interview"],
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
          meetingAdditionalMessage: nullableText(
            "For schedule_interview only. Repeat only when the approved proposal explicitly contained this value; otherwise omit and the server uses the immediately confirmed proposal.",
            2_000
          ),
          meetingAdditionalMessageVisibility: {
            description:
              "For schedule_interview only. Repeat only when needed to identify the exact approved revision.",
            enum: ["candidate", "internal", "both"],
            type: "string",
          },
          meetingAttendeeEmails: {
            description:
              "For schedule_interview only. Repeat only when needed to identify the exact approved revision. Omit on a simple approval.",
            items: { type: "string" },
            maxItems: 10,
            type: "array",
          },
          meetingDurationMinutes: {
            description:
              "For schedule_interview only. Repeat only when needed to identify the exact approved revision. Omit on a simple approval.",
            maximum: 240,
            minimum: 15,
            multipleOf: 15,
            type: "integer",
          },
          meetingTitle: nullableText(
            "For schedule_interview only. Repeat only when needed to identify the exact approved revision. Omit on a simple approval.",
            200
          ),
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

export function getEnabledOrgAgentTools(surface: "chat" | "slack" = "chat") {
  return surface === "slack"
    ? ORG_AGENT_TOOLS
    : ORG_AGENT_TOOLS.filter(
        (tool) => tool.function.name !== "start_role_creation"
      );
}

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName)
  );
}
