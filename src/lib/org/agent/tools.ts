import { COMPANY_EMAIL_PREFERENCE_TOOL } from "@/lib/email/companyPreferencesContract";
import { COMPANY_LANGUAGE_SETTING_TOOL } from "@/lib/org/agent/languageSettingContract";
/**
 * Tool contracts exposed to the organization-wide Harper agent.
 *
 * Keep this file declarative: names, descriptions, and JSON schemas only.
 * Runtime validation and database work live in toolExecution.ts and the read
 * data modules.
 */
import { DIRECT_CONTACT_MESSAGE_CONTRACT } from "@/lib/companyTalentRequests/directMessage";
import {
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/agentTools/web";
import { COMPANY_MEETING_SCHEDULING_ENABLED } from "@/lib/companyMeetingScheduling";
import { COMPANY_SIDE_LLM_DATA_KEYS } from "@/lib/org/agent/companyDataCatalog";
import { AUTHORIZED_MESSAGE_CONTENT_CONTRACT } from "@/lib/companyTalentRequests/relayContract";
function nullableText(description: string, maxLength: number) {
  return {
    description,
    maxLength,
    type: ["string", "null"],
  } as const;
}

export const ORG_AGENT_TOOL_NAMES = [
  "update_email_preferences",
  "update_language_setting",
  "report_issue",
  "send_company_message",
  "job_posting_promote",
  "start_role_creation",
  "web_search",
  "open_url",
  "get_talents",
  "read_talent",
  "add_candidate_note",
  "list_contacts",
  "read_contact",
  "read_role",
  "request_matching_search",
  "recommend_talents",
  "publish_role_recommendations",
  "write_company_memory",
  "calibrate_role_hiring_brief",
  "get_more_data",
  "read_conversation_history",
  "update_role_criteria",
  "update_data",
  "change_role_status",
  "set_role_notification",
  "manage_role_pipeline_stages",
  "contact_talent",
  "move_candidate_stage",
  "move_candidate_to_role",
  "manage_interview_availability",
  "decide_company_intro",
  "prepare_candidate_connection",
  "decide_candidate_connection",
] as const;

export type OrgAgentToolName = (typeof ORG_AGENT_TOOL_NAMES)[number];

export const ORG_AGENT_TOOLS = [
  COMPANY_EMAIL_PREFERENCE_TOOL,
  COMPANY_LANGUAGE_SETTING_TOOL,
  {
    type: "function",
    function: {
      name: "send_company_message",
      description: "Commit the final company-facing Slack message batch to the server-approved audience and end this turn. Complete reads and other work first; call this tool alone. Each text is the actual message body. With no parent it starts a new thread; replyTo refers to an earlier ref in this batch; threadRef continues an existing stored thread in this audience. The server persists all parts atomically and retries delivery using those same bodies and parent references. A committed batch is not proof of recipient readership. No extra final answer is generated.",
      parameters: {
        type: "object", additionalProperties: false, required: ["messages"],
        properties: { messages: { type: "array", minItems: 1, maxItems: 12, items: {
          type: "object", additionalProperties: false, required: ["ref", "text"],
          properties: {
            ref: { type: "string", minLength: 1, maxLength: 80 },
            text: { type: "string", minLength: 1, maxLength: 12000 },
            roleId: { type: "string", description: "Exact accessible Role for this message. Replies inherit their parent's Role when omitted." },
            threadRef: { type: "string", description: "Exact stored thread ID in the approved audience; mutually exclusive with replyTo." },
            replyTo: { type: "string", description: "An earlier ref in this batch; mutually exclusive with threadRef." },
          },
        } } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "job_posting_promote",
      description: "Record the latest acquisition demand for an active internal Role already permitting external promotion. The shared LinkedIn posting inventory operator reads this request when allocating its limited purchased slots. This does not publish, schedule or remove a posting and does not guarantee timing, frequency or candidate volume. Check current promotion permission first; never use this to enable promotion or change anonymity. The result reports the actual recorded request and current publicity settings.",
      parameters: { type: "object", additionalProperties: false, required: ["roleId", "demand", "reason"], properties: {
        roleId: { type: "string" },
        demand: { type: "string", enum: ["sufficient", "normal", "more_needed", "urgent"] },
        reason: { type: "string", minLength: 1, maxLength: 1500, description: "Short current recruiting evidence for the operator; omit private candidate details." },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "report_issue",
      description: "Send a user-requested error report, discrepancy or feedback to Harper team members through the internal support channel. Interpret the user's request in context; do not send merely because a lookup failed. Summarize observed facts, impact and what remains unknown using only information available in this company conversation. Do not attach full transcripts, private candidate reasons or hidden profiles. The server attaches the current workspace, conversation and message references. Call once for the report; if delivery is unknown, explain the uncertainty rather than automatically retrying. A sent result proves delivery only, not investigation, a support ticket, a fix or a reply deadline.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { summary: { type: "string", minLength: 1, maxLength: 2500, description: "Concise factual report in the user's language, including the requested help and relevant observed discrepancy." } },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_role_creation",
      description:
        "Create a draft Role from the hiring information already supplied in Slack and open its web hiring-start onboarding. Saves the supplied basic fields, preserves the selected original messages and files, and prepares the onboarding questions. Returns the exact web continuation link; does not activate hiring or start matching. Slack-only.",
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
          draft: {
            type: "object", additionalProperties: false,
            description: "Grounded initial Role fields authored by you from the supplied conversation/JD. Omit unknown fields. Keep private selection preferences in request, not public description.",
            properties: {
              description: { type: "string", minLength: 1, description: "Candidate-facing work, scope and qualifications actually supplied. Preserve their strength; add no assumed requirements." },
              request: { type: "string", description: "Private Hiring Brief when supplied criteria warrant it, using the shared authoring contract." },
              locationText: { type: "string" },
              workMode: { type: "string", description: "Use the stored value onsite, hybrid, or remote when the company has stated the work mode." },
              employmentTypes: { type: "array", items: { type: "string" }, description: "Use stored values full_time, part_time, contract, or internship only for stated employment types." },
              salaryRange: { type: "string", description: "The stated compensation, preserving currency, period and qualifiers." },
              externalJdUrl: { type: "string", description: "Verified source JD URL, if provided." },
            },
            required: ["description"],
          },
        },
        required: ["roleTitle", "contextMessageCount", "draft"],
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
        "Search or list the company-visible candidate set across one, multiple, or all Roles. This population contains candidates already shared with the company, not the full talent pool or unseen talent market; it provides no comparative sourcing evidence for alternate hiring thresholds. A closed stage alone does not establish the reason for closure. This is the first read for a workspace-wide candidate list or filter; do not call read_role once per Role merely to list candidates. Omit query to list candidates, and use currentCompanyStageId to select an exact current company stage such as pending_connection or a known custom:<id>. Every result includes the candidate's exact current company stage ID and user-facing label for that Role. Default text search covers identity, headline, and Role; set searchProfile when the requested evidence may be in education, structured work history, bio, or extras. Results include matching evidence snippets and pagination facts; when the user asks for every matching candidate, continue with the next offset while hasMore is true. Raw resume text is never searched or returned. Read selected candidates only when more detail is needed; use read_role when the whole Role pipeline and ordered stages are needed.",
      parameters: {
        additionalProperties: false,
        properties: {
          currentCompanyStageId: {
            description:
              "Optional exact current company stage filter. Built-in examples include company_intro, intro_requested, pending_connection, connected, final_offer, and process_stopped. Use custom:<id> only when that exact stage ID is known.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          limit: {
            description: "Matches to return in this page; 1-100, default 20.",
            maximum: 100,
            minimum: 1,
            type: "integer",
          },
          offset: {
            description:
              "Pagination offset; default 0. Increase it using the previous result's limit while hasMore is true.",
            maximum: 10000,
            minimum: 0,
            type: "integer",
          },
          query: {
            description:
              "Optional name, email, headline, talent ID, or Role title search. Omit for an unfiltered or stage-filtered list.",
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
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_candidate_note",
      description:
        "Add one company-internal note to one exact candidate for one exact Role after the company asks to record it. The note is appended to the candidate's recent progress and is returned by read_talent. It is visible to the company, is not shared with the candidate, and does not change candidate profile data, pipeline stage, Role criteria, or contact the candidate. Resolve the exact talentId and roleId first.",
      parameters: {
        additionalProperties: false,
        properties: {
          note: {
            description: "The exact company-internal note to append.",
            maxLength: 2_000,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "Exact internal Role ID for this candidate context.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          talentId: {
            description: "Exact candidate talent ID.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
        },
        required: ["talentId", "roleId", "note"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_talent",
      description:
        "Read company-visible candidates after resolving their exact talent IDs. Prefer a focused batch suited to the current question; ordinary reads have no fixed candidate-count maximum. Use talentIds for batch reads; the singular talentId remains available for a one-candidate read, and the two forms must not be combined. Profile reads on every plan consume no Intros and do not authorize contact. An unaccepted company-first proposal returns only company-visible board facts, proposal delivery state and contact history, including automatic follow-up timestamps; it never exposes the private email, Career insights or stored resume. With includeProfile=true, company-first proposals can return the company-visible professional profile on every plan. For already-shared candidates, includeProfile=false (the compact default) returns name, email, headline, visible Role/stage evidence, bounded progress, meeting-coordination state and KST times, contact history with cancellation availability, resume availability, and safe career insights. Candidate email addresses are withheld in pending_connection, company_intro, and intro_requested. With includeProfile=true, shared candidates additionally return professional profile location, bio, work history, education, and extras. An eligible candidate without an existing company pair can return a profile-only preview without creating a recommendation or contact. Compensation and raw resume text are never returned; resume output remains availability-only.",
      parameters: {
        additionalProperties: false,
        minProperties: 1,
        properties: {
          includeProfile: {
            description:
              "false (default) returns the compact base with identity, visible Role/stage and recommendation evidence, progress, contacts and resume availability. true adds the complete public professional profile. For location or work/education timelines, profileView=outline supplies those facts without descriptive bodies; profileView=full includes the complete source prose. Raw resume text is never included.",
            type: "boolean",
          },
          profileView: {
            type: "string", enum: ["outline", "full"],
            description: "Includes the authorized profile. outline returns current location and complete work/education/extras metadata, including all employers, roles and dates, but omits bio and descriptive bodies. Use it for broad lists and career-path comparisons when those facts suffice. full returns the original bio and all descriptive evidence for substantive work, achievements or detailed fit explanations. Expand only the candidates needing that evidence; no batch-size limit. Omit includeProfile or set it true when specifying this field.",
          },
          profileSections: {
            type: "array", items: { type: "string", enum: ["bio", "experience", "education", "extras"] },
            description: "Select the source sections needed for this question before reading many profiles. For example, experience returns every work-history row and its full descriptive evidence without unrelated biography, education or extras. Omit for all sections; [] returns current location only. Identity and company relationship facts always remain. Combine with profileView=outline for metadata only, or full/omitted for original prose. Sections left out are not evidence of absence and can be read later. No candidate-count or prose-length limit.",
          },
          progressLimit: {
            description: "Recent progress events; 1-30, default 10.",
            maximum: 30,
            minimum: 1,
            type: "integer",
          },
          progressOffset: {
            description: "Offset in company-visible role activity; use recentProgressPage.hasMore to read older events. Default 0.",
            maximum: 100000,
            minimum: 0,
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
              "Exact talent IDs for comparison or batch review. Prefer a focused set of relevant candidates; ordinary reads have no fixed batch maximum.",
            items: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
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
      name: "list_contacts",
      description:
        "List company-visible candidate communications across the whole workspace without first enumerating candidates. Use kind=followup to read stored future and past company followups, their dates and delivery state; those dates guide follow-up by the candidate-side Harper Agent, whose delivery timing depends on the candidate conversation. It covers company-requested candidate contacts, interview availability requests, connection introduction emails, standalone connection or Role-change notices, and Harper's recorded process-closure or company-request follow-up notices. Use dateBasis=sent for questions about messages that were actually sent; created and updated are available for draft/history and recent-activity questions. Omit kind to search all supported communication kinds. When recovering a previously created contact, first search by candidate or Role with kind omitted because the user's wording may not match the stored kind. Results are a compact index and intentionally omit subjects and bodies. If the user asks what was sent, requests exact wording, or needs response detail, pass the returned contactRef values to read_contact, batching up to ten. Continue with the next offset while hasMore is true when the user asks for every result. There is no direction filter because one contact can include a company request, a Harper delivery, and a candidate response; the detailed read identifies the actual people involved instead.",
      parameters: {
        additionalProperties: false,
        properties: {
          after: {
            description:
              "Optional inclusive ISO date-time lower bound, interpreted using dateBasis. Include Z or an explicit UTC offset such as +09:00.",
            type: "string",
          },
          before: {
            description:
              "Optional exclusive ISO date-time upper bound, interpreted using dateBasis. Include Z or an explicit UTC offset such as +09:00.",
            type: "string",
          },
          followupStatus: { description: "For kind=followup: optional stored status such as pending, delivered, or cancelled. Date filters apply to the planned date by default.", type: "string" },
          dateBasis: {
            description:
              "Which verified timestamp to filter and sort by. sent includes only communications with an actual sent time; updated is the default.",
            enum: ["created", "sent", "updated", "scheduled"],
            type: "string",
          },
          kind: {
            description:
              "Optional communication kind. contact is a company-requested candidate question or document request; interview_request is an interview availability request; connection_intro is an introduction email after connection acceptance; notice is a standalone connection, Role-change, process-closure, or company-request follow-up notification.",
            enum: [
              "contact",
              "interview_request",
              "connection_intro",
              "notice",
              "followup",
            ],
            type: "string",
          },
          limit: {
            description: "Results in this page; 1-100, default 20.",
            maximum: 100,
            minimum: 1,
            type: "integer",
          },
          offset: {
            description:
              "Pagination offset; default 0. Increase it using the previous result's limit while hasMore is true.",
            maximum: 10000,
            minimum: 0,
            type: "integer",
          },
          query: {
            description:
              "Optional candidate name/email, Role name, or company sender name/email search.",
            maxLength: 200,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "Optional exact Role ID.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          talentId: {
            description: "Optional exact candidate ID.",
            maxLength: 100,
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
      name: "read_contact",
      description:
        "Read one to ten exact communication records returned by list_contacts. Pass a one-item contactRefs array for a single read and up to ten references for a batch. This returns the stored subject and body when that source keeps them, together with a concise user-safe state, the candidate and Role, its actual initiator and recipient or recipients, verified scheduled/sent times, and a candidate response when one is stored. An active company-requested candidate-contact draft also returns the exact contact ID and revision required to revise, approve, or cancel it. A still-changeable queued or failed candidate contact returns the exact contact ID and available immediate/cancel actions. For company-requested candidate emails, interview requests, and Role-change notices, sender names the company user whose request Harper delivered; it is not a generic Harper placeholder. Each system-generated connection, process-closure, or company-request follow-up notice correctly names Harper as sender. Do not expose contact references or internal contact IDs in the final answer.",
      parameters: {
        additionalProperties: false,
        properties: {
          contactRefs: {
            description:
              "One to ten exact opaque contact references returned by list_contacts.",
            items: {
              maxLength: 160,
              minLength: 1,
              type: "string",
            },
            maxItems: 10,
            minItems: 1,
            type: "array",
            uniqueItems: true,
          },
        },
        required: ["contactRefs"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_role",
      description:
        "Read one internal role by roleId or exact title. Use it only for details missing from current context, and choose only the needed criteria, memory, pipeline, description, or notification settings. notification returns saved channels, primary assignee, available exact targets, current-user/current-channel markers, and explicit draft selections; it does not start hiring. criteria returns both the broad internal role request and the optional structured evaluation dimensions. The request is used for matching even when those optional dimensions are empty; their absence alone does not establish why sourcing results are sparse. This read has no unseen-talent market distribution or counterfactual supply estimates. pipeline returns the complete ordered stage references with exact stage IDs plus each returned candidate's exact current stage ID; read it before a pipeline structure edit or candidate stage move. For a bounded pending-connection or shortlist result that lacks decision reasons, include pipeline so the answer can explain fit rather than listing names and headlines alone.",
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
              enum: ["criteria", "memory", "pipeline", "description", "notification"],
              type: "string",
            },
            maxItems: 5,
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
              "Only filter people when one specific stage was requested. Omit for whole-pipeline status/count questions. Built-in IDs: company_intro (company may request an intro; candidate has not accepted), intro_requested (company requested the intro), pending_connection (candidate accepted and awaits the company's decision), connected, process_stopped. Use the response-language contract for UI labels. For a custom stage, use custom:<id> only when that exact ID is already available.",
            maxLength: 100,
            type: "string",
          },
        },
        type: "object",
      },
    },
  },
  {
    type: "function", function: {
      name: "recommend_talents",
      description: "Submit final candidate actions from the supplied scheduled shortlist and end this turn. Use its short refs in talent_ids. company_first adds company review cards without contacting candidates; talent_first recommends this Role through the existing candidate delivery; connect presents an already accepted candidate to the company as pending connection, not connected. Include only selected people. actions=[] records no action. Full-profile reads are not a prerequisite. Send all actions together in one call; stage 3 writes selected candidates' explanations and existing delivery follows automatically, without another selection LLM.",
      parameters: { type: "object", additionalProperties: false, required: ["actions"], properties: {
        actions: { type: "array", items: { type: "object", additionalProperties: false,
          required: ["label", "talent_ids"], properties: {
            label: { type: "string", enum: ["company_first", "talent_first", "connect"] },
            talent_ids: { type: "array", items: { type: "string" } },
          } } },
        reason: { type: "string", description: "Optional short explanation of the selection or no action; not a review of every candidate." },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "request_matching_search",
      description: "Queue evaluation for one saved Role. Explicit company searches save stage-1/2 evidence without changing the recommendation list or contacting anyone. After completion, read matching.view=selection for current statistics, Top candidates and the entire untouched recommendation pool; choose exact IDs with publish_role_recommendations if warranted. scope=unassessed/new_members limits discovery, all reevaluates including existing untouched cards, evaluated reuses saved scores. startStage=1 reevaluates hard conditions; 2 reuses prior stage-1 eligibility for changed comparison criteria. Do not rescore an unchanged Brief without a reason. A trusted scheduled assignment retains its separately authorized directions. A queued result does not prove completed evaluation or publication.",
      parameters: {
        type: "object", additionalProperties: false, required: ["roleId"], properties: {
          roleId: { type: "string" },
          scope: { type: "string", enum: ["unassessed", "new_members", "all", "evaluated"] },
          startStage: { type: "integer", enum: [1, 2] },
          limit: { type: "integer", minimum: 1, description: "Retrieval/evaluation budget, default 5000. No artificial top-200 gate." },
          recommendCount: { type: "integer", minimum: 0, description: "Suggested recommendation target, normally 10; not a quota. Interactive searches always evaluate only. Scheduled authority retains its separate direction limits." },
          sourceRelation: { type: "string", enum: ["accepted"], description: "Scheduled authority only: review current accepted, not-yet-introduced candidates. Positive recommendCount does not cap accepted introductions; zero evaluates only." },
          recommendCounts: { type: "object", additionalProperties: false, required: ["companyFirst", "talentFirst"], properties: {
            companyFirst: { type: "integer", minimum: 0 }, talentFirst: { type: "integer", minimum: 0 },
          }, description: "Scheduled authority only: desired new additions per direction, without replacing the existing company list. This input never grants permission to contact candidates." },
          talentIds: { type: "array", items: { type: "string" }, minItems: 1, description: "Exact people to evaluate. Interactive publication uses publish_role_recommendations after reading the evidence. Scheduled review retains its separately authorized selection contract." },
          reason: { type: "string", description: "Short factual purpose of this search, retained in its history." },
        },
      },
    },
  },
  {
    type: "function", function: {
      name: "publish_role_recommendations",
      description: "Publish selected company-first candidates for one Role. kind=add takes only the new IDs to add and preserves every existing card; an empty add changes nothing. kind=replace takes the complete desired untouched list, including retained existing IDs; omitted untouched cards retire without rejection, and [] clears that pool. Read matching.view=selection for evidence and current membership. The server manages Brief/pool versions. New candidates need current stage-2 evidence and sharing eligibility. The web API writes descriptions concurrently, one call per selected candidate, using their recorded scores without reranking or topping up. The tool waits for every description and the atomic list save. Existing cards included in add remain unchanged; replace can retain existing cards without current scores. Save/Pass/Accept/Intro progress is preserved. This never contacts candidates or moves them to connection pending. A completed result confirms the saved additions, refreshes, removals and retained candidates; there is no background publication wait.",
      parameters: {type:"object",additionalProperties:false,required:["roleId","kind","talentIds"],properties:{
        roleId:{type:"string"},
        kind:{type:"string",enum:["add","replace"],description:"add preserves existing recommendations and adds only talentIds. replace makes talentIds the complete untouched recommendation list."},
        sourceRunId:{type:"string",description:"Optional saved run whose exact evaluation references should be reused without discovery or stage-1/2 scoring. Read selection with that runId first. Its Brief must equal the current saved Brief; prior criteria never become current criteria implicitly. Omit to use latest current-Brief evaluations."},
        talentIds:{type:"array",items:{type:"string"},description:"For add, only new IDs to add; [] does nothing. For replace, the complete desired untouched list, including retained IDs; [] clears it."},
        reason:{type:"string",description:"Short purpose grounded in the company conversation and assessed evidence."},
      }},
    },
  },
  {
    type: "function", function: {
      name: "write_company_memory",
      description: "Save authorized company facts, feedback and durable context as scoped rows. Choose company, team or role from the meaning and audience. This does not change the Hiring Brief or contact anyone. Use exact ref/revision from company_memory reads for updates/deletes. operationId identifies an atomic batch; reuse it unchanged only for a retry. A revision conflict requires reading the current row. Labels/content are free text. Move scope with add+delete in one batch.",
      parameters: {type:"object",additionalProperties:false,required:["operationId","changes"],properties:{
        operationId:{type:"string",minLength:1},changes:{type:"array",minItems:1,items:{type:"object",additionalProperties:false,required:["op"],properties:{
          op:{type:"string",enum:["add","update","delete"]},scope:{type:"string",enum:["company","team","role"]},
          teamId:{type:"string"},roleId:{type:"string"},ref:{type:"integer",minimum:1},revision:{type:"integer",minimum:1},
          label:{type:"string"},content:{type:"string"},
        }}},
      }},
    },
  },
  {
    type: "function",
    function: {
      name: "calibrate_role_hiring_brief",
      description:
        "Calibrate one existing Role's company-level talent bar from a new real-person reference supplied through conversation text, an internal candidate mention, a professional URL, or an attachment. Reference people represent caliber rather than Role fit unless the user explicitly connects them to both. Use it for a newly supplied reference, including a contextual '이런 사람?' after Harper requested one. Do not use it for identity questions, profile summaries, or ordinary candidate assessment. It returns the finalized Hiring Brief.",
      parameters: {
        additionalProperties: false,
        properties: {
          roleId: {
            description:
              "Exact internal Role ID whose Hiring Brief is updated.",
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
      name: "get_more_data",
      description: "Read additional company information. kinds selects members, teams, company_details, legacy workspace_memory, scoped company_memory, matching_runs, or hiring_brief_history. teams lists all accessible team IDs and names, including teams with no assigned people or Roles. hiring_brief_history lists saved Hiring Brief changes, authors and summaries; hiringBriefHistory.historyId returns complete before/after Brief and Criteria snapshots. With matching_runs alone, read recent history or older pages by offset. Add matching to read one run, current-Brief cumulative statistics, filtered candidate lists, or one person's evaluation history. Statistics count evaluations, not deliveries or consent. Missing historical measurements are unknown, not zero. company_memory returns editable row refs/revisions and actual scopes; memory filters narrow its inventory. Full field reads needed for edits use fullTextKeys. Read failures do not imply empty state.",
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
            description: "Requested independent data groups.",
            items: {
              enum: ["members", "teams", "company_details", "workspace_memory", "company_memory", "matching_runs", "hiring_brief_history"],
              type: "string",
            },
            minItems: 1,
            type: "array",
          },
          offset: {type:"integer",minimum:0,description:"Older matching history page offset."},
          roleId: {type:"string",description:"Optional exact Role for matching history pages; preserve it with offset. Omit for workspace history. Detailed matching queries use matching.roleId instead."},
          matching: { type: "object", additionalProperties: false, required: ["roleId"], properties: {
            roleId: {type:"string"}, view: {type:"string",enum:["summary","candidates","evaluations","selection"],description:"selection reads latest evidence or a saved runId: its criteria, frozen ranked candidates and old scores, alongside the entire current untouched recommendation pool and current scores. Defaults to the top 20 candidates; use from/to to read a larger or later range. The server manages publication versions; choose add or replace and exact talentIds. Older runs without frozen references explicitly report incomplete historical coverage. Other filters use summary/candidates/evaluations."},
            runId: {type:"string",description:"Saved run from history. Reads the original Brief and recorded evaluation references, including reused scores, without starting a search. With selection, compares that historical candidate list with the current pool."}, briefVersion: {type:"string",description:"Omit for current Brief or the requested run's recorded Brief; exact returned version or all for evaluation history."},
            talentIds: {type:"array",items:{type:"string"}}, stage: {type:"integer",enum:[1,2,3]},
            inputContractVersion: {type:"string",description:"Exact input projection, for example worker_behavior_v1. Different projections are not interchangeable current evaluations."},
            relationship: {type:"string",enum:["accepted"],description:"Current accepted, not-yet-introduced source relationships. This is a relationship inventory, not an evaluation or company acceptance."},
            hasCompanyHistory: {type:"boolean",description:"Filter the entire counted/listed population by an existing company introduction or shared progress. false finds people without that company history; inspect returned current relationship/new-pair facts before recommending."},
            includeDistributions: {type:"boolean",description:"Include per-score probability distributions when needed; omitted by default to keep the result concise."},
            criterion: {type:"string",description:"Exact criterion name from statistics."}, label: {type:"string",description:"Exact score or label from statistics."},
            from: {type:"integer",minimum:1,description:"selection only: first position in the currently readable ranked list, starting at 1, inclusive. Defaults to 1. Do not combine from/to with offset/limit."},
            to: {type:"integer",minimum:1,description:"selection only: last position, inclusive. Defaults to from + 19. For example from=21,to=40 reads the next 20; from=1,to=100 reads the top 100. Existing untouched recommendations are always returned separately in full."},
            offset: {type:"integer",minimum:0}, limit: {type:"integer",minimum:1},
          } },
          hiringBriefHistory: {type:"object",additionalProperties:false,required:["roleId"],properties:{
            roleId:{type:"string"},historyId:{type:"string",description:"Exact change id for full before/after snapshots. Omit for compact history list."},
            offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1},
          }},
          memory: {type:"object",additionalProperties:false,properties:{
            scope:{type:"string",enum:["company","team","role"]},roleId:{type:"string"},teamId:{type:"string"},
            forRoleId:{type:"string",description:"Read this Role and its inherited team/company memory within the current audience."},
            offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1},
          }},
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
        "Browse Slack conversations already stored by Harper when the visible recent conversation is insufficient. Use type=all with limit=5 first when the relevant thread is unknown; it returns the five most recent thread previews with exact KST start/latest times, message counts, and the first three messages. Continue with the exact nextCursor only when those previews do not identify the relevant thread. Then use type=thread with one to three exact threadIds to read each selected thread's rolling summary plus messages after that summary, or stored messages when no summary exists. This does not access the company's full Slack history. Historical discussion is context, not proof that a requested data change remains applied.",
      parameters: {
        additionalProperties: false,
        properties: {
          roleId: { type: "string", description: "Optional exact accessible Role to browse its stored conversations from a workspace review. Omit for the current conversation." },
          cursor: {
            description:
              "Opaque nextCursor from a previous result. For type=all, it continues the thread index. For type=thread, use a selected thread's nextCursor with that one exact threadId to continue older stored messages.",
            maxLength: 500,
            minLength: 1,
            type: "string",
          },
          limit: {
            description:
              "Number of recent thread previews for type=all; 1-10, default 5. Start with 5 and request another cursor page only when needed. Omit for type=thread.",
            maximum: 10,
            minimum: 1,
            type: "integer",
          },
          threadIds: {
            description:
              "One to three exact opaque thread IDs returned by type=all or shown for the current recent conversation. Required for type=thread; omit for type=all. When continuing with a cursor, pass only its matching thread ID.",
            items: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
            maxItems: 3,
            minItems: 1,
            type: "array",
          },
          type: {
            description:
              "all lists stored Slack threads; thread reads the selected thread contexts.",
            enum: ["all", "thread"],
            type: "string",
          },
        },
        required: ["type"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_role_criteria",
      description:
        "Edit or fully replace one role's independent candidate comparison elements. For a new draft, author them from known Role facts before completion as part of the authorized Role setup; no separate criteria request is needed. For a registered Role, edit only within the user's requested scope and retain unrelated facts, alternatives and requirement strengths inside each edited element. Replacing an element's text is not permission to drop its other conditions. For targeted additions, updates or deletions, use edits and copy an existing element's exact name into targetName. Use criteria only for a full-list replacement. Read include=criteria first when current criteria are not visible. An empty list is valid; authoring is the LLM's responsibility. Provide exactly one of criteria or edits. For multiple independently requested roles, call this once per exact Role after reviewing each result.",
      parameters: {
        additionalProperties: false,
        minProperties: 2,
        properties: {
          criteria: {
            description:
              "Full replacement list of zero to six independent comparison elements under the shared authoring contract. Do not use for a targeted add, update or delete.",
            items: {
              additionalProperties: false,
              properties: {
                criteria: {
                  minLength: 1,
                  type: "string",
                },
                name: {
                  minLength: 1,
                  type: "string",
                },
              },
              required: ["name", "criteria"],
              type: "object",
            },
            minItems: 0,
            type: "array",
          },
          edits: {
            description:
              "Targeted edits, applied in order and saved atomically. add requires name and criteria. update requires the exact current targetName and at least one replacement field, name or criteria. delete requires only the exact current targetName. A delete may reduce the final list to zero items.",
            items: {
              additionalProperties: false,
              properties: {
                criteria: {
                  description:
                    "Detailed replacement text for add, or optional new detailed text for update.",
                  minLength: 1,
                  type: "string",
                },
                name: {
                  description:
                    "Dimension name for add, or optional new name for update.",
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
                  minLength: 1,
                  type: "string",
                },
              },
              required: ["operation"],
              type: "object",
            },
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
        "Apply one atomic batch of explicitly requested company/role information changes, or resolve a stored confirmation. Role lifecycle status is intentionally excluded; use change_role_status for 진행, 중단, or 종료. Hiring Brief (role_request) changes are applied directly when authorized in the conversation. A Role's 필수 조건 (hard constraints) live in its Hiring Brief, never in the JD: add one with a role_request append to the Hard constraints section, and change or remove one by replacing its exact line (not a whole rewrite); 평가 기준 (evaluation criteria) are changed with update_role_criteria; never use role_description for either. Memory changes use a stored proposal and confirmation. Read and write Role compensation only through salaryRange as one free-form text value; keep minimum, maximum, currency, equity, bonus, and basis details together rather than creating split compensation fields. Submit salaryRange separately from confirmation-required memory fields, though it may share an atomic batch with ordinary direct changes. For confirmation, send proposalId and proposalAction; if changes or summary are accidentally repeated with both confirmation fields, the stored proposal takes precedence and the repeated draft fields are ignored. Put changes that should succeed or fail together in one atomic batch; use a later call only when a previous result changes what should happen next.",
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
                  description:
                    "role_is_company_first_search enables or disables future periodic searches. role_intro_search_date sets one or more weekdays as an array of Mon, Tue, Wed, Thu, Fri, Sat, Sun; role_intro_search_time sets an integer hour from 0 to 23. These times use Asia/Seoul. Use kind=rewrite for these settings. Changing them does not start an immediate search or cancel an existing run; request_matching_search starts an explicit search. role_is_anonymous (rewrite, boolean) controls company-identity concealment in public promotion: enabling it unpublishes linked Harper public jobs pending reviewed anonymous copy, while neither enabling nor disabling it automatically edits existing LinkedIn posts or republishes Harper jobs.",
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
                  type: ["string", "number", "boolean", "array", "null"],
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
              "Existing proposals only; always pair with proposalId. Apply after explicit confirmation, reject after explicit refusal, or return that stored proposal's preview. To create a new preview, omit both proposal fields and send changes.",
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
      name: "set_role_notification",
      description: "Save the selected Slack notification channels, the Role's email switch and/or primary assignee for one existing Role, including a draft, without changing its hiring status. Read read_role(include=[notification]) for exact available targets and saved settings. channelIds replaces the selected channel set; emailEnabled turns email of new candidates to the Role's assignees and Owners on or off; assigneeUserId replaces the primary assignee. Omitted settings are preserved. The server refuses a save that would leave no Slack channel and email off. Requires the company's contextual authorization for these targets; no new channel or teammate is created. Returns verified saved settings.",
      parameters: {
        type: "object", additionalProperties: false, required: ["roleId"],
        anyOf: [{ required: ["channelIds"] }, { required: ["emailEnabled"] }, { required: ["assigneeUserId"] }],
        properties: {
          roleId: { type: "string" },
          channelIds: { type: "array", items: { type: "string" }, minItems: 1 },
          emailEnabled: { type: "boolean" },
          assigneeUserId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "change_role_status",
      description: `Change the lifecycle status of one exact internal Role, only when the user explicitly asks for that status change.
Call this once per exact Role. After its result, continue any other explicit, independent work from the user when it is still safe and relevant.
When an exact existing Role is still draft and the user explicitly asks to start hiring or register it, call this with status=active instead of start_role_creation. The server reuses the saved draft and checks every role-creation requirement. If information is missing, no activation occurs: use the returned missing fields and available notification choices to ask only for what is needed, then complete the still-authorized activation after the user answers. If the user explicitly selects notification channels, email or an assignee, include those optional exact values in the activation call; they are saved before readiness is checked again. Never invent or silently default these targets.
Status meanings and effects:
• active (진행): keep hiring in progress and periodically receive suitable candidate connections from Harper.
• paused (중단): keep the Role open, but stop receiving additional candidate recommendations. Candidate processes and connections already in progress remain open.
• ended (종료): mark the Role ended and stop additional recommendations. This change is immediate, but candidate closure is not atomic: after the grace period, Harper's final delivery closes accepted candidate Positions across company-controlled stages except final_offer and records the notice.
• deleted (삭제): apply the same internal-Role deletion as the web product by atomically setting status=deleted and is_expired=true. It uses the same deferred candidate-closure rule as ended, including the final_offer exception.
Use deleted only for an explicit request to delete the exact Role. Do not reinterpret 종료 as deletion. Use the exact roleId from current context or a fresh read. Do not claim a candidate was already notified or closed until current progress shows that the closure notice was committed.`,
      parameters: {
        additionalProperties: false,
        properties: {
          roleId: {
            description:
              "Exact ID of the internal Role whose status will change.",
            type: "string",
          },
          notificationChannelIds: {
            description:
              "Draft activation only. Exact enabled Slack channel IDs explicitly selected by the user. Resolve references to the current Slack channel from runtime_context and earlier choices from recent_tool_context; omit when the saved draft already has confirmed channels or the user has not selected them.",
            items: { type: "string" },
            maxItems: 20,
            minItems: 1,
            type: "array",
            uniqueItems: true,
          },
          emailEnabled: {
            description:
              "Draft activation only. true when the user chose to receive new candidates by email (sent to the Role's assignees and Owners), e.g. when the company has no Slack channel. Omit when the user has not chosen email.",
            type: "boolean",
          },
          assigneeUserId: {
            description:
              "Draft activation only. Exact active organization member ID explicitly selected as the primary assignee. Resolve the exact member from recent_tool_context; omit when the saved draft already has a confirmed assignee or the user has not selected one.",
            type: "string",
          },
          status: {
            description:
              "active=진행 (periodic suitable candidate connections continue); paused=중단 (Role stays open but additional recommendations stop, while existing processes stay open); ended=종료 or deleted=삭제 stops recommendations and schedules accepted candidate closure after the grace period at every stage except final_offer. deleted also sets is_expired=true.",
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
      description: "Deliver a message to exact candidate(s), or prepare/revise a reviewable draft, schedule an approved draft, expedite a queued delivery, or cancel. Choose send vs create_draft from conversational authorization under the loaded candidate_contact policy, not the topic. send accepts talentId + roleId + messageContent for an authorized new message, or relayId + messageContent for a continuation. One target or items of up to ten; inspect partial outcomes. This never changes candidate interest, sharing consent, or pipeline stage.",
      parameters: {
        additionalProperties: false,
        properties: {
          action: {
            description:
              "Lifecycle action applied to the singular target or every batch item. add_followup/reschedule_followup/cancel_followup manage stored future contact dates. For these use singular followup references; inspect each result before the next mutation.",
            enum: [
              "create_draft",
              "send",
              "revise_draft",
              "schedule",
              "immediate",
              "cancel",
              "add_followup",
              "reschedule_followup",
              "cancel_followup",
            ],
            type: "string",
          },
          contactRef: { description: "For reschedule_followup/cancel_followup: exact followup contactRef from a current read. Only the followup changes, preserving the original request.", type: "string" },
          sourceContactRef: { description: "For add_followup: exact sourceContactRef from a current read. Supports contact:<id>, intro_request:<id>, meeting_round:<id>, or interview_request:<meeting id>.", type: "string" },
          scheduledAt: { description: "For add_followup/reschedule_followup: ISO date with timezone from which the candidate-side Harper Agent can follow up. Actual delivery may be later depending on the candidate conversation.", type: "string" },
          contactId: {
            description:
              "Exact contact ID from a contact-kind draftAction or deliveryAction, for one target or a shared batch default. Required for revise_draft, schedule, immediate, and cancel. An interview_request meeting ID belongs to move_candidate_stage.meetingScheduleId in candidate_process, not this contact lifecycle.",
            type: "string",
          },
          deliveryMode: {
            description:
              "For schedule only. Applies as a shared default to batch items. standard sends 5 minutes after approval at any time of day; immediate requires explicit send-now approval.",
            enum: ["standard", "immediate"],
            type: "string",
          },
          editInstruction: {
            description:
              "For revise_draft only: the company's requested change to the current exact copy, or a shared default for batch items.",
            maxLength: 2000,
            minLength: 1,
            type: "string",
          },
          expectedRevision: {
            description:
              "Exact currently presented revision for one target, or a shared default for batch items. Required for revise_draft and schedule.",
            minimum: 1,
            type: "integer",
          },
          messageSubject: { description: "For send: final candidate-facing email subject, required.", type: "string", minLength: 1, maxLength: 180 },
          contactPurpose: {
            description: "For create_draft or send, choose request if the candidate is asked to answer or act (including a question, resume, proposal, or interview request); choose deliver for information only. Omission defaults to deliver. For revise_draft, supply it when the edit changes the purpose.",
            enum: ["request", "deliver"],
            type: "string",
          },
          messageContent: {
            description:
              `${DIRECT_CONTACT_MESSAGE_CONTRACT} ${AUTHORIZED_MESSAGE_CONTENT_CONTRACT}`,
            maxLength: 5000,
            minLength: 1,
            type: "string",
          },
          relayId: {
            description:
              "For send when replying to a candidate relay: exact ID from candidate_contact_ref in the current conversation. Never combine with talentId or roleId. Omit for a new authorized message identified by talentId and roleId.",
            type: "string",
          },
          requestContext: {
            description:
              "Required for send: internal topic summary of the exact message, not another writing instruction. For create_draft: a neutral description of the exact information requested or message to pass along, in the latest user's language. May be shared across batch items. Never include stored compensation.",
            maxLength: 800,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description:
              "For create_draft or send without relayId: exact Role ID for one target or a shared default for batch items.",
            type: "string",
          },
          talentId: {
            description:
              "For create_draft or send without relayId: exact candidate ID for one target.",
            type: "string",
          },
          items: {
            description:
              "One to ten targets for the same action. Each item's values override shared top-level defaults. For create_draft provide talentId and roleId plus requestContext. For send provide talentId + roleId + messageContent, or relayId + messageContent for a reply. For revise_draft, schedule, immediate, and cancel provide contactId and the fields required by that action.",
            items: {
              additionalProperties: false,
              properties: {
                contactId: { type: "string" },
                deliveryMode: {
                  enum: ["standard", "immediate"],
                  type: "string",
                },
                editInstruction: {
                  maxLength: 2000,
                  minLength: 1,
                  type: "string",
                },
                expectedRevision: { minimum: 1, type: "integer" },
                messageSubject: { type: "string", minLength: 1, maxLength: 180 },
                contactPurpose: { enum: ["request", "deliver"], type: "string" },
                messageContent: {
                  description: AUTHORIZED_MESSAGE_CONTENT_CONTRACT,
                  maxLength: 5000,
                  minLength: 1,
                  type: "string",
                },
                relayId: { type: "string" },
                requestContext: {
                  maxLength: 800,
                  minLength: 1,
                  type: "string",
                },
                roleId: { type: "string" },
                talentId: { type: "string" },
              },
              type: "object",
            },
            maxItems: 10,
            minItems: 1,
            type: "array",
          },
          presentedDrafts: {
            description:
              "For action=schedule only. Convenience mode for a short approval of the entire nearest displayed draft set when exact IDs are not copied into the call. Omit contactId and items; the server resolves every exact presented ID and revision. When exact contactId and expectedRevision values are available, pass them directly instead.",
            type: "boolean",
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
      description: `Add, update, rename, or delete company-defined pipeline stages for one exact Role after an explicit user request.
This may be followed in the same user request by a candidate move, but it never moves or contacts a candidate itself. Read the Role with include=pipeline first unless the complete ordered stage list and exact stage IDs are already visible in this conversation.
For action=add, provide labels in the exact requested order. Existing exact normalized labels are left unchanged and missing labels are appended after the current company-defined stages. Do not invent interview stages or silently merge semantically similar names. When the company is creating one process stage in order to schedule a meeting, include its explicitly supplied meeting purpose, duration, and optional candidate note so that stage can reuse the guidance later.
For action=update, copy one exact custom stageId from read_role and provide at least one meeting default to change. Omitted meeting defaults are preserved. meetingPurpose and meetingDurationMinutes must both remain set or both be cleared; to clear them, provide null for both. meetingCandidateMessage may be changed or cleared independently. This updates future scheduling defaults and never changes an invitation or confirmed meeting that already exists.
For action=rename, copy one exact custom stageId from read_role and provide the requested new label.
For action=delete, copy one exact custom stageId from read_role. Deletion is allowed only when no candidate currently occupies that stage; otherwise the tool fails without moving candidates or deleting the stage. Built-in stages can never be renamed or deleted.
This operation changes only the Role's pipeline structure. It does not move candidates, contact candidates, send email, or change Role criteria, request, memory, or lifecycle status.`,
      parameters: {
        additionalProperties: false,
        properties: {
          action: {
            enum: ["add", "update", "rename", "delete"],
            type: "string",
          },
          label: {
            description:
              "New label for action=rename. Omit for add, update, and delete.",
            maxLength: 40,
            minLength: 1,
            type: "string",
          },
          labels: {
            description:
              "One to six labels for action=add, in the order they should appear. Omit for update, rename, and delete.",
            items: {
              maxLength: 40,
              minLength: 1,
              type: "string",
            },
            maxItems: 6,
            minItems: 1,
            type: "array",
          },
          meetingCandidateMessage: nullableText(
            "For action=add with one label only, or action=update. Candidate-facing note saved on the process stage. For update, omit to preserve or use null to clear.",
            2_000
          ),
          meetingDurationMinutes: {
            description:
              "For action=add with one label only, or action=update. Required with meetingPurpose when creating defaults. For update, omit to preserve or use null together with meetingPurpose=null to clear the pair.",
            maximum: 240,
            minimum: 15,
            multipleOf: 15,
            type: ["integer", "null"],
          },
          meetingPurpose: nullableText(
            "For action=add with one label only, or action=update. Candidate-friendly topic saved on the process stage. For update, omit to preserve or use null together with meetingDurationMinutes=null to clear the pair.",
            600
          ),
          roleId: {
            description: "Exact internal Role ID.",
            type: "string",
          },
          stageId: {
            description:
              "Exact custom:<id> stage ID returned by read_role. Required for update, rename, and delete; omit for add.",
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
      description: `Move one exact candidate between company pipeline stages after the company explicitly asks for that change, including a previously delegated conditional action now authorized by a delivered candidate contact.
Call this once per exact candidate stage change and review the result before another action. Read the Role with include=pipeline first unless the candidate's exact currentStageId and the complete ordered stage list with exact stage IDs are already visible. For “next stage”, select the immediate next company-defined process stage in that authoritative order; use connected after pending_connection unless the company explicitly chose a custom destination; do not infer a generic recruiting sequence from labels alone.
Meeting scheduling is available from any company-visible active stage: pending_connection, connected, final_offer, or an exact custom:<id> stage. Never restrict it to pending_connection. A closed candidate whose last stage is accepted, archived, process_stopped, or another company pipeline stage may also be selected. Moving a closed candidate to an active destination first returns candidate_reengagement_required without moving or contacting them. Explain the two choices naturally. If the company says Harper should ask, use contact_talent under its shared authorization policy to ask about the intended action. Contacting and reopening are separate effects. If the company says it already confirmed directly and wants to proceed, call this tool again with reengagementResolution=company_confirmed. Never infer that confirmation. Alternatively, when a candidate contact establishes consent for the company’s previously requested action, pass its exact candidateConsentRelayId and omit reengagementResolution; read current state before acting. Moving a closed candidate to archived or process_stopped does not require renewed consent and should proceed normally. A candidate in pending_connection moves to connected by default. Custom stages are optional and must never be a prerequisite for connecting or scheduling. targetStageId may be connected, archived, process_stopped, a custom:<id> stage, or final_offer. A final_offer target returns a confirmation question unless confirmFinalOffer=true after Harper has just asked the exact question. The executor re-reads the candidate and applies compare-and-set protection. If scheduleInterview=true, use connected from pending_connection, or retain the current active stage unless a different destination was explicitly requested. No custom stage is required. The complete candidate-facing invitation email is written in the candidate's saved locale. To resume, revise, or expedite an existing invitation, pass its exact meetingScheduleId from read_talent or read_contact. Omit meetingScheduleId only for a new meeting request. Each new request has its own meeting, including a later interview with the same candidate in the same stage; retries of the same request remain idempotent. meetingDeliveryMode defaults to the standard delayed-delivery policy; use immediate only when the company explicitly instructs Harper to send this invitation now. An immediate update preserves the existing body, public link, and delivery identity. Before any move or candidate contact, scheduling verifies the organizer's active Google Calendar connection and saved availability. If either is missing, the result keeps the candidate unchanged and provides the verified Calendar settings link and user-safe setup guidance. Otherwise it moves the candidate only after the meeting request is ready. With scheduling disabled, this operation never contacts the candidate. With scheduling enabled, it creates, revises, or expedites the time-selection request and returns the verified delivery facts for the final response.`,
      parameters: {
        additionalProperties: false,
        properties: {
          notifyCandidateOnClosure: {
            type: "boolean",
            description: "For a process closure, whether Harper should send the separate candidate closure notice. Defaults to true. Set false when the company asks to end without notifying. The candidate-visible closed status is unchanged.",
          },
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
              "Exact destination stage ID from the ordered read_role pipeline result. For scheduleInterview, use connected from pending_connection; otherwise retain expectedCurrentStageId unless a stage move was requested.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          confirmFinalOffer: {
            description:
              "Set true only when the immediately previous Harper message asked whether to move this exact candidate to final offer and the user explicitly confirmed it.",
            type: "boolean",
          },
          candidateConsentRelayId: {
            type: "string",
            description:
              "Exact delivered candidate contact ID whose full meaning authorizes this stage change, under the company’s preceding instruction. For a closed position, this is fresh consent evidence instead of claiming company_confirmed. Never infer consent merely from the arrival of a contact.",
          },
          reengagementResolution: {
            description:
              "Set company_confirmed only when this tool previously returned candidate_reengagement_required for the same candidate and intended stage, and the company explicitly says it already confirmed renewed interest directly. Omit otherwise.",
            enum: ["company_confirmed"],
            type: "string",
          },
          ...(COMPANY_MEETING_SCHEDULING_ENABLED
            ? {
                scheduleInterview: {
                  description:
                    "Set true only when the company asked Harper to arrange this meeting. A custom process stage is optional.",
                  type: "boolean",
                },
                meetingDurationMinutes: {
                  description:
                    "For scheduleInterview only. Duration in 15-minute increments. Omit to reuse a selected stage default or the normal 60-minute duration; do not ask for duration merely because no stage is configured.",
                  maximum: 240,
                  minimum: 15,
                  multipleOf: 15,
                  type: "integer",
                },
                meetingDeliveryMode: {
                  description:
                    "For scheduleInterview only. Omit or use standard for the normal 20-minute delay. Use immediate only after an explicit instruction to send now; it preserves an existing queued invitation instead of creating another one.",
                  enum: ["standard", "immediate"],
                  type: "string",
                },
                meetingPurpose: nullableText(
                  "For scheduleInterview only. Candidate-friendly purpose grounded in the conversation. Omit to reuse a selected stage default or an existing meeting; ask only if the purpose is unresolved.",
                  600
                ),
                meetingCandidateMessage: nullableText(
                  "For a new meeting only. Optional candidate-facing note. With a selected custom stage it becomes that stage default; otherwise it applies only to this meeting. For an existing invitation, use meetingAdditionalMessage instead. Omit rather than inventing one.",
                  2_000
                ),
                meetingAdditionalMessage: nullableText(
                  "For scheduleInterview only. Optional one-off context for this candidate, not a stage default. When revising an existing invitation, supply its complete revised candidate-facing note; internal-only revisions are not supported.",
                  2_000
                ),
                meetingAdditionalMessageVisibility: {
                  enum: ["candidate", "internal", "both"],
                  type: "string",
                },
                meetingAttendeeEmails: {
                  items: { type: "string" },
                  maxItems: 10,
                  type: "array",
                },
                meetingScheduleId: nullableText(
                  "Exact existing meeting ID when resuming, revising the candidate-facing note, or expediting that invitation. Its saved purpose, duration, title, and attendees are retained and cannot be changed by this operation. Omit for a newly requested meeting. Read the current meeting before retrying uncertain delivery.",
                  100
                ),
                meetingTitle: nullableText(
                  "For scheduleInterview only. Explicit override; omit to use the normal default title.",
                  200
                ),
              }
            : {}),
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
      name: "move_candidate_to_role",
      description: `Move one exact company-visible candidate from one internal Role to an exact company-visible stage in another internal Role in the same Workspace.
Call this once per exact candidate Role change and review the result before another action. Use it only after the company clearly authorizes the move. For an initial neutral move instruction where the conversation does not establish whether to proceed now, first offer that Harper can ask the candidate using the existing contact_talent flow, or can move them now. If the company says to move now, says the change was already discussed, or previously delegated a conditional move and the delivered candidate contact now supplies the requested choice/consent, do not ask again and call this tool. Read both Roles and their pipeline data first so sourceRoleId, targetRoleId, talentId, and targetStageId are exact. Use move_candidate_stage for a change within one Role. This operation preserves contacts, invitations, confirmed meetings, and email history under their original Role. On success it closes the source Position, activates the target Position at the requested stage, and records the Role change in both feeds. Existing unanswered requests or meetings never block this operation.`,
      parameters: {
        additionalProperties: false,
        properties: {
          candidateConsentRelayId: {
            type: "string",
            description: "For a company-authorized UI Role move conditional on candidate consent, pass the fresh candidate_contact_ref.relayId when the candidate explicitly accepts that exact change. The server checks the saved authorization, destination, cancellation and current state. Omit for a newly authorized immediate company move.",
          },
          sourceRoleId: {
            description: "Exact internal source Role ID from read_role.",
            type: "string",
          },
          talentId: {
            description:
              "Exact candidate talent ID visible in the source Role.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          targetRoleId: {
            description:
              "Exact internal destination Role ID in the same Workspace from read_role.",
            type: "string",
          },
          targetStageId: {
            description:
              "Exact destination stage ID from the target Role pipeline: pending_connection, connected, custom:<id>, or final_offer. Never invent a custom stage ID.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
        },
        required: ["talentId", "sourceRoleId", "targetRoleId", "targetStageId"],
        type: "object",
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_interview_availability",
      description:
        "Save the current company user's own interview availability after an explicit natural-language instruction. Replace only named weekly rules while preserving unspecified weekdays and date exceptions. An empty interval list means unavailable; exact-date changes may add, remove, or restore an exception. Set timezone only from unambiguous evidence. This never selects or contacts a candidate. When the conversation already establishes one candidate, exact destination stage, and authorized meeting request, continue with move_candidate_stage.",
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
      name: "decide_company_intro",
      description:
        "Handle the company's decision for one exact candidate in company_intro. decision=request_intro asks Harper to present this Role to a candidate whose interest is not yet known; if the candidate accepts, Harper will immediately send a CC introduction to the confirmed company recipients and move the candidate to connected by default without another company approval. decision=pass removes the candidate from this company-first proposal flow without creating a candidate-visible opportunity or contacting the candidate. On an initial request_intro, provide only a companyAppeal the user actually supplied, confirmed company recipient emails; do not invent or broaden the company's reason. Omitted recipient emails may use the current requester's company email when available. The first complete call records no decision and returns confirmation_required. Call this tool again for the same candidate only when the immediately previous Harper message explained the exact candidate, Role, delivery recipients, and effects, and the current message clearly authorizes that proposal or pass. On that confirmation call, planning fields may be omitted because the server reuses the exact immediately presented plan. The server verifies adjacency and actor identity; otherwise it returns confirmation_required without changing state. Use this same tool in web chat and Slack instead of sending the user to the candidate card.",
      parameters: {
        additionalProperties: false,
        properties: {
          companyAppeal: {
            description:
              "For an initial request_intro only: the company's grounded reason for wanting to meet this candidate, preserving the user's meaning without invention. Omit on the later short confirmation so the exact presented reason is reused.",
            maxLength: 2_000,
            minLength: 1,
            type: "string",
          },
          decision: {
            description:
              "request_intro asks Harper to propose the Role on the company's behalf; pass declines to propose this Role and does not contact the candidate.",
            enum: ["request_intro", "pass"],
            type: "string",
          },
          introRecipientEmails: {
            description:
              "For an initial request_intro only: company recipients to CC if the candidate accepts. Omit to propose the current requester's company email when available, or on the later short confirmation to reuse the exact presented recipients.",
            items: { type: "string" },
            maxItems: 10,
            minItems: 1,
            type: "array",
          },
          nextStageId: {
            description:
              "Optional exact custom:<id> destination only if the company explicitly selected it. Normally omit: acceptance goes to connected without requiring any custom stage. Omit on a later confirmation to reuse the presented plan.",
            maxLength: 100,
            minLength: 1,
            type: "string",
          },
          roleId: {
            description: "Exact Role ID for this company-first proposal.",
            type: "string",
          },
          talentId: {
            description: "Exact Talent ID for this company-first proposal.",
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
      name: "prepare_candidate_connection",
      description:
        "Read authoritative context for an ordinary accept by CC introduction or direct company contact, or for a decline. Decline supports a candidate awaiting connection or already in a company-active process, including immediately after acceptance. Accept also supports a previously company-stopped candidate whose earlier Talent acceptance is still authoritative. This never changes state or sends email. An accepted pending_connection candidate goes to connected by default; no process-stage setup is required. Meeting scheduling and explicit stage moves use move_candidate_stage. Set connectionMethod=direct_contact when the company first requests that method.",
      parameters: {
        additionalProperties: false,
        properties: {
          notifyCandidateOnClosure: {
            type: "boolean",
            description: "For a process closure, whether Harper should send the separate candidate closure notice. Defaults to true. Set false when the company asks to end without notifying. The candidate-visible closed status is unchanged.",
          },
          connectionMethod: {
            description:
              "For accept only. Omit or use intro_email for the default CC introduction. Use direct_contact only when the company explicitly asked to contact the candidate itself. Meeting scheduling uses move_candidate_stage instead.",
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
          ...(COMPANY_MEETING_SCHEDULING_ENABLED
            ? {
                processStageId: {
                  description:
                    "Optional exact custom:<id> destination only when the company explicitly selected it. Normally omit: an accepted candidate goes to connected. Never ask for or create a stage just to accept.",
                  maxLength: 100,
                  minLength: 1,
                  type: "string",
                },
              }
            : {}),
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
        "Carry out an authorized ordinary connection accept or decline decision. Decline supports a candidate awaiting connection or already in a company-active process. An accept for a closed process_stopped candidate first returns candidate_reengagement_required without changing state; use move_candidate_stage for a closed accepted or archived candidate and for every explicit stage destination. If the company asks Harper to check, use contact_talent under its shared authorization policy to ask about the intended action. The contact itself does not reopen the process. Call accept again with reengagementResolution=company_confirmed only when the company explicitly says renewed interest was already confirmed directly. Call this tool once per exact candidate decision and review the result before continuing. Call it only when the immediately previous Harper message asked for approval of the exact candidate, delivery behavior, and recipients and the current message authorizes all of it; the server verifies that adjacency and otherwise returns confirmation_required without changing state. Do not infer authorization from isolated words or a generic acknowledgement. Meeting scheduling and explicit process-stage moves use move_candidate_stage instead. For accept, omitted connectionMethod defaults to intro_email, which sends a neutral warm introduction. Use direct_contact only after an explicit request. Never proactively offer direct_contact. Decline moves the candidate to process stopped.",
      parameters: {
        additionalProperties: false,
        properties: {
          notifyCandidateOnClosure: {
            type: "boolean",
            description: "For a process closure, whether Harper should send the separate candidate closure notice. Defaults to true. Set false when the company asks to end without notifying. The candidate-visible closed status is unchanged.",
          },
          connectionMethod: {
            description:
              "For accept, omit or use intro_email for the default warm introduction. Use direct_contact only after an explicit company request. Meeting scheduling uses move_candidate_stage instead.",
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
          reengagementResolution: {
            description:
              "Set company_confirmed only after this tool returned candidate_reengagement_required for the same candidate and the company explicitly says it already confirmed renewed interest directly. Omit otherwise.",
            enum: ["company_confirmed"],
            type: "string",
          },
          ...(COMPANY_MEETING_SCHEDULING_ENABLED
            ? {
                processStageId: {
                  description:
                    "Optional explicitly approved custom:<id> destination. Normally omit to use connected; on a simple approval the server retains the confirmed proposal.",
                  maxLength: 100,
                  minLength: 1,
                  type: "string",
                },
              }
            : {}),
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

export function getEnabledOrgAgentTools(surface: "chat" | "slack" = "chat", trusted?: {scheduledMatching?: boolean}) {
  const tools = ORG_AGENT_TOOLS.filter(
    (tool) =>
      (tool.function.name !== "recommend_talents" || trusted?.scheduledMatching === true) &&
      (COMPANY_MEETING_SCHEDULING_ENABLED ||
      tool.function.name !== "manage_interview_availability")
  );
  return surface === "slack"
    ? tools
    : tools.filter((tool) => tool.function.name !== "start_role_creation" && tool.function.name !== "send_company_message");
}

export function isOrgAgentToolName(value: unknown): value is OrgAgentToolName {
  return (
    typeof value === "string" &&
    ORG_AGENT_TOOL_NAMES.includes(value as OrgAgentToolName)
  );
}
