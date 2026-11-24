// Capability IDs name reusable abilities, not inferred conversational intents.
export const CAREER_CORE_TOOLS = [
  "update_language_setting",
  "update_setting",
  "read_talent_context",
  "write_talent_context",
  // Notes carry reasoning and work records across every kind of request.
  "read_notes",
  "upsert_note",
  "web_search",
  "open_url",
  // A form is a conversation/review surface, so it stays available like text.
  "suggest_form",
  "manage_action_items",
  "upsert_plan",
] as const;

export const CAREER_CONDITIONAL_TOOLS = [] as const;
export const CAREER_CAPABILITIES = [
  {id:"calendar",turns:2,summary:"Read separately authorized Google Calendar availability and exact event versions, or create/update/cancel an event within the user's actual scope. Calendar connection is managed in Career settings independently of Gmail. Invitations and counterpart agreement are different facts.",tools:[["read_calendar","read calendars, event windows, exact event etags and busy intervals"],["write_calendar","create, update or cancel an authorized event with a durable effect receipt"]]},
  {
    id: "resources", turns: 3,
    summary: "Read Harper's existing research on several companies at once by option number, name, official site or LinkedIn page: overview, team and hiring facts, research topics and sources, or a fresh check of recent hiring posts and news. For questions about a company, inspect the saved material before seeking external evidence for the same facts. Save reusable public facts.",
    tools: [
      ["read_companies", "read several companies' overviews, facts and saved research, or check their recent hiring posts and news"],
      ["upsert_company", "save or correct labeled company research and directory facts from independent public sources"],
      ["upsert_opportunities", "present or update a grounded general opportunity, with or without a Role"],
    ],
  },
  {
    id: "delegation",
    turns: 1,
    manualOnly: true,
    summary: "Keep a durable responsibility across human waits and conversations. mode=current retains execution in this conversation; mode=independent delegates bounded work when separate reasoning/context benefits the outcome. A human wait does not require another agent. Read owned responsibilities and receipts across conversations; update/cancel returns to the original executor. Gmail thread waits resume from actual correspondence. Independent delegates return findings and remaining needs here.",
    tools: [["manage_work", "record, inspect, update, wait for or close a current or independent responsibility"]],
  },
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
      "Record the user's acceptance, rejection or save-for-later decision on an exact recommendation; a reply alone does not persist it. Import external postings from URLs for a requested save, application or direct recommendation. Read roles and prior recommendations, manage matching criteria, search/evaluate external opportunities and present existing Harper-connected recommendations and already selected unpublished proposals. Reads reuse this selected pool; they do not expand it. Searching does not publish. Add, reorder, archive, restore, replace or reset recommendation lists while preserving independent saved/applied/connected decisions. No fixed count or quality quota.",
    tools: [
      ["list_matchings", "read the current and past matching index"],
      [
        "read_matching",
        "read matching criteria, runs, evaluations, membership and its work note",
      ],
      [
        "upsert_matching",
        "create or reuse a matching for ongoing research, or manage its metadata",
      ],
      [
        "search_opportunities",
        "search/evaluate exact criteria or roles; read, resume or cancel the same run",
      ],
      [
        "upsert_opportunities",
        "publish or manage recommendation membership and saved opportunity stages, including closing or reopening a process",
      ],
      [
        "save_job_posting",
        "import external postings for a requested save/application or direct recommendation, preserving existing progress",
      ],
      [
        "read_recommended_opportunities",
        "retrieve prior recommendations and progress",
      ],
      [
        "get_role_context",
        "read exact public role details and the candidate's opportunity history",
      ],
      [
        "update_recommended_opportunity_feedback",
        "decline an introduction, save for later, or save external interest; contact_company accepts an internal introduction",
      ],
    ],
  },
  {
    id: "career_content",
    turns: 2,
    summary:
      "Keep events, sign-ups (coffee chats, mentoring, fellowships, contests, course recruiting), articles and social posts found for the user in the \"볼 만한 것\" list on Career home so they persist beyond chat until they expire. When the user signs up for one, it moves to their schedule (the schedules capability). Job postings and hiring posts go to Jobs through save_job_posting mode suggest, not here.",
    tools: [
      [
        "manage_content_suggestions",
        "read, save or remove events, sign-ups, articles and posts shown on Career home",
      ],
    ],
  },
  {
    id: "internal_applications",
    turns: 3,
    summary:
      "Prepare for a specific internal Role the candidate chose or was recommended. Resolve an exact public posting, save a private opportunity, and select profile/document versions. These tools do not introduce or share; company_contact provides authorized introduction and ongoing agent correspondence. This capability does not browse hidden Roles or select new recommendations.",
    tools: [
      [
        "apply_to_internal_role",
        "save an explicitly requested internal Role for review",
      ],
      ["get_internal_roles", "resolve the specific public internal posting the user explicitly requested"],
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
      "Save or correct shared company summaries and research from public sources using a known company, employer ref or official identity. Follow several companies by name or workspace ID, including companies absent from the directory. Read, update or unfollow existing subscriptions. Scheduled Career checks receive follow names, user instructions and follow dates, with external roles/assessments and existing internal recommendations where linked. Changes do not start separate contact runs; timing and pauses use the existing Career schedule. Unfollow removes the saved interest and preserves history.",
    tools: [
      ["read_companies", "read several companies at once by number, name, site or LinkedIn page"],
      ["upsert_company", "save or correct labeled company research and directory facts from independent public sources"],
      ["follow_company", "list follows, read follow facts, external roles and existing internal recommendations, follow, update or unfollow a company"],
    ],
  },
  {
    id: "schedules",
    turns: 2,
    summary:
      "Read and record actual appointments, and reserve concrete future Career work. Nonurgent events and today's appointments are reviewed together; flexible same-day reservations can join that review. Preserve exact times explicitly requested by the user. The historical check-in schedule is only external discovery, disabled by stopped or external recommendations off. No generic recurring idle checks. Read current reservations before creating another.",
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
      "Converse with company agents within the user's delegation, including between user turns. This general messaging channel also supports authorized introductions. Read current relationships and correspondence; share only authorized material. Agent receipt, human notification and connection completion are separate facts.",
    tools: [
      ["read_company_connections", "read current company connections"],
      ["read_agent_messages", "read agent correspondence and shared material references"],
      ["contact_user", "deliver a message to this candidate from background work"],
      [
        "contact_company",
        "start a candidate-authorized introduction or continue company-agent correspondence; also supports legacy mutual connections",
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
      "Use a browser mainly to investigate or carry out job applications, including attachments, consents, email verification and submission after the final review communicated through the current channel. Import an external posting into Jobs for a requested save or application when it is not yet saved. Hand a live browser to the user only for actions Harper cannot perform, such as login, then continue in the same session. Prefer public search/URL reading when that suffices. The application handbook provides guidance.",
    tools: [
      [
        "use_browser",
        "run, read, list, hand off or close an owned browser session",
      ],
      [
        "save_job_posting",
        "import an external posting from its URL for a requested save or application, preserving existing progress",
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
      "Offer a focused conversation about the candidate's experience or career decision. The candidate can choose text or an in-app voice call on the activity card. Ordinary advice can stay in chat.",
    tools: [
      ["read_career_coaching_list", "discover coaching topics"],
      [
        "manage_career_coaching_activity",
        "show a coaching card with chat and voice choices, or manage the selected activity",
      ],
    ],
  },
  {
    id: "activity_history",
    turns: 1,
    summary:
      "Look up past searches across conversations, including their scope, zero results and failures, or retrieve other recorded activity. Missing records do not establish that an event never happened.",
    tools: [["read_talent_activity_events", "read activity history"]],
  },
  {
    id: "harper_team",
    turns: 1,
    summary: "Pass a message to the Harper team when the user directly asks for it.",
    tools: [["contact_harper_team", "pass a message to the Harper team"]],
  },
  {
    id: "connected_inbox",
    turns: 1,
    summary:
      "Search connected Gmail for evidence relevant to the person’s career and current work, including prior projects, studies, recruiting correspondence and verification messages.",
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
