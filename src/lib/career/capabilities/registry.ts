// Capability IDs name reusable abilities, not inferred conversational intents.
export const CAREER_CORE_TOOLS = [
  "update_language_setting",
  "update_setting",
  "read_talent_context",
  "write_talent_context",
  "web_search",
  "open_url",
  // A form is a conversation/review surface, so it stays available like text.
  "suggest_form",
] as const;

export const CAREER_CONDITIONAL_TOOLS = [] as const;
export const CAREER_CAPABILITIES = [
  {
    id: "profile",
    turns: 2,
    summary:
      "Read profile identities and immutable revisions, edit facts or create a private version tailored to a purpose. A role-specific version does not silently replace the default profile or previously accepted materials. Brief and Memory use their own tools.",
    tools: [
      ["list_profiles", "list profile versions and the current default"],
      ["read_profile", "read an exact profile revision and its history"],
      [
        "update_talent_profile",
        "read full profile rows or edit only the requested fields",
      ],
    ],
  },
  {
    id: "opportunities",
    turns: 3,
    summary:
      "Record the user's acceptance, rejection or save-for-later decision on an exact recommendation; a reply alone does not persist it. Read roles and prior recommendations, manage matching criteria and search/evaluate external or internal opportunities. Searching does not publish. Add, reorder, archive, restore, replace or reset recommendation lists while preserving independent saved/applied/connected decisions. No fixed count or quality quota.",
    tools: [
      ["list_matchings", "read the current and past matching index"],
      [
        "read_matching",
        "read frozen criteria, search runs, evaluations and current/past membership",
      ],
      [
        "upsert_matching",
        "create or edit a matching and archive/restore its metadata",
      ],
      [
        "search_opportunities",
        "search/evaluate exact criteria or roles; read, resume or cancel the same run",
      ],
      [
        "upsert_opportunities",
        "publish or manage current/past recommendation membership",
      ],
      [
        "save_job_posting",
        "add a specific external posting to Jobs on request; a URL question alone is not a save request",
      ],
      [
        "read_recommended_opportunities",
        "retrieve prior recommendations and progress",
      ],
      [
        "get_role_context",
        "read exact role details, public evidence and private reasoning-only requirements",
      ],
      [
        "update_recommended_opportunity_feedback",
        "accept an internal introduction, decline, or save for later; save external interest",
      ],
      ["get_internal_roles", "find Harper-connected roles"],
    ],
  },
  {
    id: "internal_applications",
    turns: 3,
    summary:
      "Help the user pursue an exact internal Role. apply_to_internal_role evaluates both fit stages and creates a review recommendation; it does not accept or share. Prepare exact profile/document snapshots with assign_to_role. Introduction acceptance separately pins those materials for company readers.",
    tools: [
      [
        "apply_to_internal_role",
        "evaluate and add an explicitly requested internal Role for review",
      ],
      [
        "assign_to_role",
        "read, set or clear exact prepared role materials without changing an accepted introduction",
      ],
    ],
  },
  {
    id: "companies",
    turns: 2,
    summary:
      "Resolve a company by name or URL and save interest in its exact company/workspace scope. Scheduled Career checks prepare shared hiring-announcement sources and new role assessments for followed companies. Changes do not start separate contact runs; timing and pauses use the existing Career schedule. Unfollow removes the saved interest and preserves history.",
    tools: [
      [
        "search_companies",
        "resolve company identities and available source coverage",
      ],
      ["follow_company", "list follows, read prepared hiring evidence and paginated roles, follow, update or unfollow a company"],
    ],
  },
  {
    id: "schedules",
    turns: 2,
    summary:
      "Read and record the user's actual appointments, link them to Roles, and arrange useful preparation/reminders. Read, create, revise, pause or resume future Career work, including the persistent Career check-in. Its saved instruction, cadence and pause remain available in a new conversation. Use current goals, contact history and the reason for a pause to adjust timing/instructions or resume useful continuing work; preserve explicit user restrictions. Recurring checks continue after no-send outcomes. Each occurrence invokes the agent and does not guarantee an email.",
    tools: [
      ["read_talent_schedules", "read actual appointments, times, related Roles and source references"],
      ["upsert_talent_schedules", "record, correct or cancel externally arranged appointments"],
      ["list_schedules", "list future and past scheduled work"],
      ["read_schedule", "read an exact schedule and recent executions"],
      [
        "upsert_schedule",
        "save a one-time/recurring task or change its next date, instructions or active state",
      ],
    ],
  },
  {
    id: "career_delivery",
    turns: 1,
    summary:
      "In a trusted background run, write and deliver the finished Harper email to this candidate. Recipient and sender are fixed by the server. No Gmail connection is needed; retries reuse the exact saved email. Plain final assistant text is not delivered.",
    tools: [
      [
        "deliver_career_email",
        "deliver the candidate-facing email for this invocation",
      ],
    ],
  },
  {
    id: "company_contact",
    turns: 2,
    summary:
      "Read company connections and convey authorized messages or questions through them. Load before handling company correspondence. Delivery does not establish readership or a reply.",
    tools: [
      ["read_company_connections", "read current company connections"],
      [
        "contact_company",
        "convey an authorized message through an exact connection",
      ],
    ],
  },
  {
    id: "documents",
    turns: 3,
    summary:
      "Find/read saved material and create, revise or copy the resumes and Markdown documents needed for the user's delegated work. Respect explicit limits; casual disclosures alone do not authorize writing. Preserve uploaded originals. New documents/copies are private unless sharing is authorized. Manage descriptions, primary resume or removal when requested;",
    tools: [
      ["list_documents", "find saved documents"],
      ["read_document", "read saved document content"],
      [
        "upsert_document",
        "create, update or privately copy a structured resume or Markdown document; manage its metadata and soft-delete state when authorized",
      ],
    ],
  },
  {
    id: "forms",
    turns: 1,
    summary:
      "Save and present reviews of prepared content, including application details, or itemwise proposals/questions through the current channel. Read the exact reviewed revision, corrections and user reply to execute the chosen action.",
    tools: [
      [
        "suggest_form",
        "create, revise, read or present independent forms and suggestions",
      ],
    ],
  },
  {
    id: "browser",
    turns: 1,
    summary:
      "Use a browser mainly to investigate or carry out job applications, including attachments, consents, email verification and submission after the final review communicated through the current channel. Save a specific external posting to Jobs on request. Hand a live browser to the user only for actions Harper cannot perform, such as login, then continue in the same session. Prefer public search/URL reading when that suffices. The application handbook provides guidance.",
    tools: [
      [
        "use_browser",
        "run, read, list, hand off or close an owned browser session",
      ],
      [
        "save_job_posting",
        "add a specific external posting to Jobs on request; a URL question alone is not a save request",
      ],
    ],
  },
  {
    id: "email_writing",
    turns: 1,
    summary:
      "Send email through the connected Gmail account.",
    tools: [
      [
        "write_email",
        "send email using the connected Gmail account",
      ],
    ],
  },
  {
    id: "career_coaching",
    turns: 3,
    summary:
      "Discover topics and support chosen focused coaching. Ordinary advice needs no activity; follow coaching policy for cards and starts.",
    tools: [
      ["read_career_coaching_list", "discover coaching topics"],
      [
        "manage_career_coaching_activity",
        "suggest, start, update or end a coaching activity",
      ],
    ],
  },
  {
    id: "activity_history",
    turns: 1,
    summary:
      "Retrieve recorded activity and changes when current context is insufficient. Missing records do not establish that an event never happened.",
    tools: [["read_talent_activity_events", "read activity history"]],
  },
  {
    id: "connected_inbox",
    turns: 1,
    summary:
      "Read recruiting/application messages and verification codes or links from connected Gmail to complete email verification. Verify contents before making claims.",
    tools: [["search_connected_gmail", "search the connected Gmail inbox"]],
  },
] as const;

export type CareerCapabilityId = (typeof CAREER_CAPABILITIES)[number]["id"];
export type CareerCapabilityMode = "full" | "progressive";
export const CAREER_CAPABILITY_MAX_TURNS = Math.max(
  ...CAREER_CAPABILITIES.map((c) => c.turns)
);
export const CAREER_CAPABILITY_GAP_MS = 30 * 60 * 1000;
export const CAREER_CAPABILITY_LOADER = "load_career_capabilities";

export function getCareerCapabilityMode(): CareerCapabilityMode {
  return process.env.CAREER_CHAT_CAPABILITY_MODE === "full"
    ? "full"
    : "progressive";
}

export function isCareerCapabilityId(
  value: unknown
): value is CareerCapabilityId {
  return CAREER_CAPABILITIES.some((c) => c.id === value);
}
