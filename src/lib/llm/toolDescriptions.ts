/**
 * Career 도구의 최상위 function.description 원본. 도구 이름으로 찾아 수정합니다.
 * 위쪽은 현재 사용, 아래쪽은 현재 미사용 설명입니다.
 * 사용 여부는 현재 Career 제품 경로 기준이며 디버깅·평가·구 실행 처리는 제외합니다.
 * 입력 필드 설명과 handbook 본문은 각 schema/guide에 둡니다.
 * 동적 설명은 실행 모듈을 import하지 않고 필요한 사실만 인자로 받습니다.
 * 같은 이름의 기존 지원 도구는 saved/active/preparation, read/operate로 구분합니다.
 */
export const TOOL_DESCRIPTIONS = {
  upsert_company: `Save verified, reusable public company research with target, label, Markdown content and that entry's sourceRefs, or send several entries for independent results. Use a company, workspace, Role, posting or owned opportunity ref already in context, or give the company's name; add its official website or LinkedIn company identity when another company shares the name. The server stores the entry with the company's workspace. A returned public candidate can be used directly once identified. The summary label holds the company's one current briefing, which accompanies every later read of the company; write it so the next person understands the company without researching it again, linking each fact to its source. Other labels can have several independent rows. To correct one, include its dataRef with the revision from a previous result. Returns companyRef, dataRef and exact public observations; a conflict includes the current record. For directory fields alone use fields and sourceRefs, with companyId and expectedRevision for a correction. Personal fit and private information belong to the candidate's records.`,
  read_companies: `Read several companies at once by option number, company ID, name, official website or LinkedIn company page. Each company gets a short card: its saved overview, the facts on record (team size and 12-month change with where recent joiners came from, leaders' backgrounds, open roles, staff from the candidate's schools or past companies, size, founding year, location) and the research topics saved for it. topics returns those saved topics in full with their sources. check refreshes the public overview now (saved for every later reader) and lists public posts and news from the last 90 days, such as hiring posts and funding. A website or LinkedIn page Harper does not know yet adds the company. Harper-connected companies are not covered.`,
  read_resources: `Read Harper's existing company material directly: set target.name to the known company name, supply an official identity, or pass an employer ref in refs. A single identifiable employer includes its overview, available labels and sources. Use refreshSummary=false for saved material only. Include labels to retrieve corresponding entries and sources in the same call. Read a company_datum ref for an exact record, or an observation ref for the original public body. companyEvidenceQuery includes matching linked sources. Result pages share a compact overview per employer. Private records and anonymous employer identities retain their access boundaries. Follow the returned continuation for remaining content.`,
  // ============================================================================
  // ======================== 현재 사용 — 43개 설명 ==============================
  // ============================================================================
  // Career 채팅·온보딩·음성·이메일·백그라운드에서 사용하는 도구입니다.
  // 채널·연결 상태·기능 로딩에 따라 선택되며, 매번 모두 노출되는 것은 아닙니다.

  read_talent_schedules: `Read this user's appointments, including Harper-managed meetings and externally arranged meetings. Filter by exact ID, Role, stable source key or time window; paginate with offset. A specific ID includes cancelled or unconfirmed records. These are appointment facts, not future agent work.`,
  upsert_talent_schedules: `Record an externally arranged confirmed appointment from the user's conversation or verified email. Create requires title, starts_at and a stable source_key. Role is optional; content holds preparation, location and meeting links. Read existing appointments before recording a possible duplicate; update/cancel requires schedule_id and expected_version. Updating a cancelled appointment restores it only when supported by new confirmation. A proposed availability is not a confirmed appointment. This tool does not contact a company, create a Calendar event or modify a Harper-managed meeting. Use upsert_schedule with target_refs.meetingScheduleIds to reserve useful preparation/reminder work; adjust that work if the appointment changes.`,

  // 기능·가이드 로딩 관련
  // src/lib/career/capabilities/resolver.ts
  load_career_capabilities: `Load detailed policies and callable tools for catalog capabilities, available in the next model response. Local and idempotent; loading neither needs nor grants user approval.`,

  // src/lib/career/handbooks/registry.ts
  load_handbook: (
    catalog: readonly { id: string; description: string; characters: number }[]
  ) =>
    `Load the detailed handbook guidance from the next model completion for three delivered replies. Local and idempotent within a reply. ${catalog.map((book) => `${book.id}: ${book.description} (${book.characters} characters)`).join(" ")}`,

  // 공고 탐색·추천 관련
  // src/lib/career/matching/tools.ts
  list_matchings: `Read matching workspaces and the current opportunity list write target for each returned matching, the default list, and all lists. A matching preserves a complete criteria snapshot; metadata archive does not reject roles or stop schedules.`,

  // src/lib/career/matching/tools.ts
  read_matching: `Open a matching. Opening it makes it the matching this request works on, and its work note comes with it. Read this matching's opportunity list write target, frozen criteria beside current Brief, current/previous memberships, feedback and runs; the overview counts the options evaluated for this matching and the routes used, section=pool lists them with their numbers, weighted scores, facts and whether they were recommended, highest score first, and section=history lists its search, page-read and research receipts. Cursors appear only when another page exists; pass the exact returned cursor for that section. Scores must never be disclosed.`,

  // src/lib/career/notes/tools.ts
  read_notes: `Read your notes, which record what was done so later requests and scheduled runs do not redo it: a larger piece of work such as an exploration or an application (work), or the direction you are taking with this person, why, and what would change it (think). Every turn lists the most recently edited ones, and the work note of the matching a request continues arrives in full. Without noteId this lists notes, most recently edited first, optionally only those linked to a matching or company, of one kind, or containing some words. With noteId it returns the whole note and its revision; a work note linked to a matching comes with that matching's exploration computed from records.`,

  // src/lib/career/notes/tools.ts
  upsert_note: `Record what was done so later requests and scheduled runs do not redo it: a larger piece of work such as an exploration or an application (work), or your reasoning about this person's direction (think). A matching's work note holds the lessons learned during its exploration and a summary of the whole work. A single company look-up is usually too small for a note of its own. create needs kind, title and content. update edits one note: append adds text, replace swaps one exact passage, content replaces the whole text and needs expectedRevision; title, matchingId and company can change too. delete needs expectedRevision. matchingId links a note to a matching; company links it to a company by name, official site, LinkedIn page or workspace ID.`,

  // src/lib/career/matching/tools.ts
  upsert_matching: `Create with the complete Search Brief plus scope; use a new matching when meaningfully changing criteria. This snapshot does not update the current Search Brief: save changes to ongoing search preferences through write_talent_context first.

Keeping old results or asking for a separate list does not itself mean a one-off exploration; preserve the old Brief only when the user's meaning keeps that ongoing direction.

Update only title/description; archive/restore preserves results, decisions and schedules. Use the matching metadata revision as expectedRevision.`,

  // src/lib/career/matching/tools.ts
  search_opportunities: `Find and evaluate opportunities without publishing them. Postings, public hiring posts and companies themselves (whether or not they post a fitting role) are judged with the same candidate rubric and ranked together. postings finds public postings by title and country (at limits them to some companies). companies finds companies by what they do (about), by likeness to other companies (like: close in what they do or sharing many people with them), with optional size and places. named takes companies by name, official website or LinkedIn company page; a site or page Harper does not know yet is added to its directory and its public overview is prepared before it is judged. Any combination runs as one search. Harper's index holds public postings gathered from VC portfolio job boards, Korean job aggregators and LinkedIn Jobs, companies seen through them, and companies from its company directory; teams that hire only through their own sites, referrals or social posts are often absent. Harper-connected companies are not covered.
Each option gets a number in the matching this request works on, kept across requests; other tools accept these numbers. The result starts with how many options this search evaluated, how many were new to the matching and where the best new one ranks among all options evaluated for the matching, then how many times each route has been used and how high its new options ranked. Each option then gets one line with its weighted score (mutualFit 55%, candidateInterest 35%, companyInterest 10%; a constraint conflict lowers it) and the facts on record: open roles closest to the search, team size and change over 12 months with where recent joiners came from, leaders' backgrounds, staff from the candidate's schools or past companies, size and founding year. Options already recommended to this person are counted, not listed. read pages through a saved search by cursor; resume retries an incomplete one; cancel stops it. evaluationLimit caps how many postings or companies a route evaluates (default 600 postings and 150 companies; at most 1200). Scores are for your judgment only and are never shown to the person.`,

  // src/lib/talentOnboarding/tools.ts
  get_role_context: `Read exact roles and current recommendation/progress facts by roleIds. Several roles can be read in one call. Search and recommendation results use the same saved role summaries as this tool; this read supplies additional facts or a different JD detail level. For internal roles, use existing recommendations, exact roleIds from selected unpublished proposals in context, read_recommended_opportunities or this invocation, or a specific public posting the user chose, including one not yet saved. Public role details support discussion and preparation; this is not an internal discovery tool.

Includes company facts, existing recommendation decisions, meetings and a page of role activities. Use activityOffset for older activity pages when activityPage.hasMore is true; jd selects summary (default), full or skip. Summary uses the saved summary in the conversation language, falling back to the full description when unavailable.`,

  // src/lib/talentOnboarding/tools.ts
  read_recommended_opportunities: `Read the user's existing recommended public AND Harper-connected opportunities and already selected unpublished internal proposals. Unpublished proposals are returned separately with roleIds and selection times; reading does not publish, rescore, select more roles or contact anyone. Use the returned pagination to read further selections. Use returned summaries for comparison; get_role_context supplies missing detail, and upsert_opportunities publishes useful proposals. Also supports recovering a roleId for Apply with Harper from a provided posting URL. Use postingUrl for an exact URL lookup regardless of the company name's language.

Treat feedback=negative and rejected as Talent-side rejection records, not company rejections. For archived and stopped processes, follow progress.message and treat progress.stopReason as authoritative.`,

  // src/lib/career/matching/tools.ts
  upsert_opportunities: `Publish and maintain the candidate's recommended opportunities independently of feedback/progress. Every recommendation targets either a Role (an official posting or a public hiring post, by roleId) or a company itself, whether or not it posts a fitting role (by companyWorkspaceId), and appears in the same Opportunities list. An option number from this matching's searches (candidate) names either. A public posting or hiring post not yet saved as a Role is first registered with save_job_posting. action=read reads an opportunity reference returned by a list write. Publication does not record user interest or execute an action. add/archive/restore/replace/reset never accept, reject, erase saved state or contact companies. add/replace also returns the shared overview of each published opportunity's employer (business, founders, publicly reported financing), completing it first when it is missing or out of date.

set_stage changes an existing saved opportunity's stage independently of recommendation membership and candidate feedback. Each item needs its exact recommendationId, roleId or companyWorkspaceId and savedStage (saved/applied/connected/offer/closed/hidden). closed moves a finished or no-longer-available process to the Closed section; saved reopens it. Other stages record actual progress, not intended actions. This does not submit an application, introduce the candidate, contact anyone, or change the shared role's availability. Each item returns its own update or failure receipt; list revisions are not used for this action.

replace/reset require the current expectedRevision because they remove other memberships. Targeted add/restore/archive do not require it; supply it only when the change depends on a specific list snapshot. When supplied, use the target and expectedRevision together as returned by list_matchings or read_matching. Omit matchingId for the default list. Set allLists: true and omit matchingId for a reset/archive across all lists.

An external roleId or a companyWorkspaceId is sufficient to publish a new recommendation; the explanation carries why this person should pursue it. Assessment IDs are not publication inputs. action=add saves new roles and updates existing list entries together. Evaluate when the assessment is useful for your decision. Use this tool to manage existing internal recommendation membership or publish an exact already selected internal proposal returned by context or read_recommended_opportunities. Use its available public Role context to judge publication; publication does not introduce or share the candidate. A user-chosen public internal Role is saved through apply_to_internal_role.`,

  // src/lib/talentOnboarding/tools.ts
  update_recommended_opportunity_feedback: `Record decisions on exact recommendations through an items array; each item identifies its opportunity and feedback. Decisions run in input order and return individual outcomes; a failure does not undo successful decisions. dislike declines, keep saves an internal role for later, and like saves external interest. Internal introduction acceptance uses contact_company with the exact recommendation after the candidate has reviewed the Role and asks to be introduced. That tool pins prepared materials or the default profile and public documents and submits to the company agent. apply_to_internal_role saves an initially requested internal opportunity.`,

  // 외부 공고·지원 관련
  // src/lib/talentOnboarding/tools.ts
  save_job_posting: `Import external public job postings from their URLs. mode=index reads the posting page and registers or refreshes its shared Role facts without creating a personal recommendation, save, application or contact. Personal fields are not promoted. save/suggest import into this user's Jobs. Pass postings as a list, with each posting's URL and optional fields/mode. Import independent postings together in one call. Results correspond to input order and include each posting's outcome; one failure does not roll back other saves. Use for a requested save or to save external postings the user asked to apply to when they are not yet in their Jobs. The application request includes this preparation; a separate save confirmation is unnecessary.

save/suggest create or reuse the posting and the user's recommendation, preserving existing application progress. They return roleId, recommendationId and savedStage. Use the returned roleId to continue the requested application with the application tools and handbook; saving alone does not submit an application. Harper-connected/internal roles use the internal role tools.

Each mode=suggest item becomes a personal recommendation card in New opportunities, with scoring handled in the background. Use it for the options you advise this person to pursue. Postings used to explain that choice can be linked as comparisons or retained as shared sources with mode=index. A social post (for example on LinkedIn) counts as a hiring post only when the poster works at the hiring company, explicitly says they are hiring, the role is identifiable and the post is at most 30 days old; pass hiring_post with how the post asks people to reach out. A post that links to a real job page should be saved by that job page's URL instead. Job seekers' own posts (#opentowork), company promotion and coffee chats without hiring are not hiring posts.

If extraction is incomplete, the result includes the retrieved page body and actual retrieval failures. Read that body as source data, identify the exact job title and hiring company, then continue the authorized save with the same URL and those fields. Ask the user only for facts unavailable from the source; do not treat an empty summary as an unreadable page.`,

  // src/lib/career/browser/tool.ts
  use_browser: `Operate a persistent browser primarily for job applications. The browser receives your task and explicitly selected attachments, not the conversation, profile or document library. Include the user's requested outcome, authority and relevant verified facts in task. Supply documents to transfer files; mentioning a resume in task does not attach it.

run starts or continues a task and waits for its result before the calling agent continues. At a host deadline, the same transcript and browser execution are checkpointed and resumed; a new run is not a continuation. Each application has its own browser: start a new application without session_id, and pass session_id only to continue that same application. When human-only interaction is needed, it also makes the browser available to the user. One browser runs one task at a time and one role has one submission in flight at a time; a run that would overlap is not started and returns the active run instead, and the reply resumes when that run ends. When the user must supply something for the open page (a one-time code, a missing answer, a choice), offer both routes: send it in chat, or take direct control from the browser card and enter it there. Read an emailed code with search_connected_gmail when Gmail is connected; never open a mailbox inside the browser. Passwords, QR scans and CAPTCHAs are entered by the user in the browser only; never ask for a password in chat. When the user must sign in, ask them to do it in the Harper browser shown in chat: signing in on their own browser or phone does not sign in Harper's browser. Where the site offers both, suggest its own email sign-in over Google or other social sign-in, which can fail in a remote browser. Include in task whether the user already has an account on the site when known. Hand a sign-in to the user again only after they returned control or answered; when a check still finds a sign-in page, tell the user what it shows (an error, a different account screen) instead of repeating the same request. When the user answers in chat, run the same session with that answer in task so the open page continues; if the browser had been handed to the user, a chat answer written after the handoff returns control to Harper for that run. Do not run while the user says they are still operating the browser.

list discovers saved sessions from DB metadata without contacting the browser provider. Filter by work_id or role_refs and use nextOffset as offset for more results. Recorded status is not a current page observation or submission receipt. read inspects the selected session_id or execution_id for its actual observations. handoff pauses automatic work at the current page for manual control; it does not navigate to login. The viewer’s Done action returns control and resumes Harper without a chat message. A completed task needing human input returns its observation to you immediately. While human control is active, release returns its current status without operating the browser, and so does run unless the user answered in chat after the handoff. release stops an idle browser while preserving workspace files; close also clears transferred files.

Browsers are short-lived and may expire while waiting for the user. Preserve observed questions, answers and pinned attachments; restore them in a new browser and recheck account, fields and current conditions. A saved session does not guarantee preserved login or page state. Prepare mode cannot submit; execute mode requires actual user authority and a stable effect_key shared with any email alternative. Separate work uses separate browser workspaces. Preparation runs for different applications in separate browsers can be called together in one step; they run at the same time, while execute runs still run one at a time. A new prepare run linked to role_refs first checks whether the posting is closed (closed in Harper, HTTP 404/410, or clear closed wording) and opens no browser when it is; pass ignore_closed=true only when the user asks to try anyway.

Saved login keeps the sites the user signs into in Harper's browsers signed in for later applications (the browser provider keeps the sign-in cookies; Harper never sees or stores a password). It is off until the user agrees. While the user controls a browser that started without it, the viewer shows an unchecked "keep me signed in for later applications" choice; checking it turns saved login on and returns control to you before they sign in. The user can also agree in their own words or by checking a form's consent item with id save_login; then run with save_login=true and that message in authorization_refs. An unchecked save_login box is not agreement. A browser keeps how it started: a sign-in is kept only in a browser started without session_id after saved login is on. Sites still end sign-ins on their own schedule. When the user asks to remove it, use forget_login.

Do not use for ordinary search when web_search/open_url suffice. An uncertain run may have acted externally: read it rather than resubmitting.

Sessions are available from the chat browser control. Include [[browser:SESSION_ID]] in your message to display a specific session at that position; this only changes its presentation, not control or authorization. Viewer credentials are delivered only to the user interface.`,

  // Harper 내부 공고·지원 관련
  // src/lib/talentOnboarding/tools.ts
  get_internal_roles: `Resolve a specific public Harper-connected posting the user explicitly asks about or wants to pursue, including a /jobs posting. Use role_id when known; otherwise use the title/company terms identifying that posting. Results are possible identity matches, not new recommendations.

This read-only lookup is not for browsing hidden roles, general job searches or proactive recommendations. Use read_recommended_opportunities for the user's existing recommendations and get_role_context for their details. An empty lookup does not authorize broader internal discovery.`,

  // src/lib/career/internalApplications/tools.ts
  apply_to_internal_role: `Save or reuse a private opportunity for an exact internal Role the user chose. Returns the public Role/company facts needed for an informed introduction choice and the roleId for its posting card, without private hiring criteria or status. Saving does not request an introduction or share materials. contact_company handles authorized introductions and correspondence.`,

  // src/lib/career/internalApplications/tools.ts
  assign_to_role: `Read, replace, or clear the preparation materials for an internal Role. Read first and use its assignment revision as expectedRevision for set/clear (0 when none exists). Set snapshots exact profile/document revisions; documents-only freezes the current default profile.

The result includes selectionRef for the exact selected versions. Clear changes preparation only, not accepted sharing. An accepted introduction shares updates only through a later authorized contact_company with that selectionRef.`,

  // 회사 탐색·팔로우·연락 관련
  // src/lib/career/companies/tools.ts

  // src/lib/career/companies/tools.ts
  follow_company: (coverage: string) =>
    `List, read, follow, update or unfollow company subscriptions. For follow/read/update/unfollow, pass a companies array. Each follow entry has company_workspace_id or company_name and an optional instruction. A company name alone is sufficient, including companies absent from the directory. A batch saves each follow independently and reports individual failures; successful items remain saved. action=read uses follow_id and optional offset in each companies entry to read the follow facts and pages external roles with saved assessments and existing internal recommendations (offset pagination); it does not run a new search or reevaluate roles. action=list reads the user's subscriptions, exact scopes and revisions; use it before changing a follow. List defaults to active follows, with include_unfollowed and offset for history and pagination. For update/unfollow, each companies entry needs its current follow_id and expected_revision; update also accepts instruction.

Company scope includes all linked organizations; workspace scope includes only that workspace. Name-only follows have no linked local role inventory. ${coverage}

This does not grant company sharing permission or affect company search ranking.`,

  // src/lib/talentOnboarding/tools.ts
  read_company_connections: `Read companies and Roles with existing mutual connections or agent introduction correspondence for this user. An agent request is not yet a mutual connection. This includes an accepted company Request Intro, a Harper recommendation actually handed to the company, and a company contact that reached the user.

Use it when the user wants Harper to ask, follow up, clarify, pass along information, or identify which connected company they mean. The result reports durable relationship facts and the latest relay transport status without deciding what Harper should say.`,

  // src/lib/talentOnboarding/tools.ts
  contact_company: `Send a message to the company's agent and continue the conversation asynchronously within the user's delegation and sharing permissions. Message content is open-ended; no particular intent or new user message is required. The receipt confirms agent inbox submission, not human readership or a completed connection.

For an introduction, you share the materials to the company agent for its team's consideration.
유저가 소개 또는 연결을 요청해서 이 tool을 통해 회사 에이전트에게 전달한 경우, 유저에게 말을 붙이고(ex. "면접 준비 잘 해봐요!", "양쪽에게 모두 좋은 기회인 것 같아요!" 등), 회사가 바로 인터뷰 날짜를 잡자고 할 수도 있고, 대화할 수 있게 양쪽을 연결해줄 수도 있다.는 식의 구체적 설명을 덧붙여라. 기본적으로 말을 좀 실제 리크루터 사람처럼 말을 길게 해줘.
The company decides whether to proceed; Company-agent replies automatically resume Career's work on this introduction, where Harper can answer from authorized context or contact the candidate with relevant updates or questions. These are supported continuation paths, not evidence that any of them has already happened or a promise of a response time.

Use introductionRootId or replyToMessageId from read_agent_messages for existing correspondence, recommendationId alone for a Role relationship the company already knows, or connectionId from read_company_connections or an ops-contact. To record the candidate's informed acceptance of a presented introduction, use recommendationId and acceptIntroduction=true; this records the candidate's sharing decision and pins prepared materials, otherwise the default profile and public resumes. selectionRef shares the exact selected material versions. Private Brief and Memory are not shared. Do not combine target forms.

relayContent is your message to the company's agent. Preserve the user's meaning, conditions, uncertainty and sharing scope. That scope is what the user asked you to pass on or already shared for this Role. Their compensation figures or expectations and personal circumstances stay out until they agree, and so do questions about these that they asked only you; ask them before taking such a question to the company. Resolve the intended company or Role before sending.`,

  // 프로필·사용자 맥락 관련
  // src/lib/career/profiles/tools.ts
  list_profiles: `List your profile variants and archives, with exact IDs and current revisions. Read a profile for full content.`,

  // src/lib/career/profiles/tools.ts
  read_profile: `Read an exact profile revision, revision history and recorded editing source, including the owned original user message or form response when available. An editing source records provenance, not independent verification of every claim. compareRevision adds another original snapshot; sections narrows profile content. Omit profileId for the default profile.`,

  // src/lib/career/profiles/tools.ts
  update_talent_profile: `Create, copy, edit, choose the default, archive or restore a profile. Role variants do not change the default. Copy can include confirmed edits; expectedRevision selects its source revision.

Other edits save an immutable revision and expectedRevision detects concurrent changes. Use assign_to_role separately to choose introduction materials.`,

  // src/lib/talentOnboarding/tools.ts
  read_talent_context: `Read more of this user's saved Search Brief or Memory when the context already provided is insufficient. Search Memory with a natural-language description of the current task; use refs to retrieve exact rows already mentioned, including any linked private Gmail message/thread identifiers.

This reads only and does not change profile, settings, recommendations, or sharing.`,

  // src/lib/talentOnboarding/tools.ts
  write_talent_context: `Save or correct concise personal facts in Memory and current opportunity-search criteria and premises in Search Brief. Detailed accounts of the candidate's work that need their supporting evidence belong in private Documents.

Save facts stated by the user or supported by verified sources, preserving their subject, source and uncertainty. An inference does not establish personal experience, contribution or preference. When a saved fact is corrected or no longer true, update or delete that row instead of appending a conflicting current fact; keep a past event only when it remains useful as history.

For each new Memory, choose importance 3 if it can materially change matching, 2 if it is useful supporting context, or 1 if it mainly preserves conversational continuity. For a Brief, do not repeat its label in content.

Read the existing rows and the user's meaning together, retrieving related records when needed to distinguish a new fact from a repetition or correction. Preserve exact values needed for reuse, strength, exceptions, uncertainty, and known timing; respect the user's stated retention limits. A reply to an earlier Harper question, including a form response, is handled with this same tool. Read exact prior contact wording when its scope is unclear.

Successful Brief changes automatically refresh matching; do not call a separate re-evaluation tool. Do not duplicate one fact across both collections.

Use the relevant profile, settings, document, feedback, or recommendation tool when that feature already owns the data. Do not call when nothing should be saved.`,

  // src/lib/talentOnboarding/tools.ts
  read_talent_activity_events: `Read this person’s earlier searches, activities or sent-contact questions. scope=searches lists actual search attempts across chats and quiet runs. Use query, since or cursor to recover checked scopes, sources and outcomes without a previous ID. Use scope=contacts with query/cursor for older questions and refs (up to three) for exact wording; a sent question does not prove an answer.

Use when the answer depends on what the user recently changed or did in Career, such as profile preference changes, profile-row memo additions or updates, onboarding completion, or Harper insight updates.`,

  // 이력서·문서 관련
  // src/lib/talentOnboarding/tools.ts
  list_documents: `List this user's active saved documents and generated context documents as paginated metadata with the primary resume first, including document IDs, revisions when available, and descriptions. Use it to resolve earlier document references, discover a saved context named in the system prompt, or answer which documents are saved.

Includes the latest recorded PDF export result/cause when available; a saved document does not prove a successful PDF download. It never returns document text and never returns soft-deleted rows.`,

  // src/lib/talentOnboarding/tools.ts
  read_document: `Read active saved or generated documents. Pass either document_id for one document or document_ids for a batch, using exact IDs from upload context or list_documents. Text reads default to a 4000-character excerpt per document. Set read_all=true for the complete extracted text. This reads extracted text directly and does not require a downloadable file.

Includes the latest recorded PDF export result/cause when available, with its revision; it does not prove receipt on the user's device.

If current upload context already includes content_excerpt, continue from its next_offset instead of rereading offset 0. Binary-only files can be saved but return textAvailable=false.`,

  // src/lib/talentOnboarding/tools.ts
  upsert_document: `Create, update or copy an owned resume or Markdown document as needed for the user's delegated work, respecting explicit limits. Casual career disclosures alone do not authorize writing.

Select action and use type=resume or type=markdown on create; update/copy infer the saved type when omitted. Author the content yourself. Resume content uses structured content or changes; Markdown uses markdown or exact edits.

Read the current document and revision before content updates/copies. Metadata can be changed without rewriting the body, and omitted metadata is preserved.

An uploaded original can be attached as-is. To edit its content, create a separate document from its verified contents. New documents and copies are private unless a visibility change is authorized.

Returns saved facts and a preview/PDF-download link; saving does not generate the PDF, send or submit it.`,

  // 질문·검토 폼 관련
  // src/lib/career/forms/server.ts
  suggest_form: `Save, revise and read action lists, questions or review forms in this conversation. create/update stores an immutable revision. A role or opportunity relatedRef makes the review available on that opportunity's detail page. Use a standalone [[form:formId]] in your assistant message to show the saved item there. References load the latest revision. Reading or displaying never reopens a resolved form or grants consent.

For independent tasks the user can act on one at a time, use kind=suggestion. Each item has a stable id, a task label, optional description, type=action, content={}, and its own positive action {id,label,message}. The button sends that task's message to Harper and checks that row when the choice is recorded. Other rows remain available.

For answers and materials the user reviews together, use kind=form. Items have stable IDs, labels, optional descriptions, renderer types and content. Put the question and its context in label/description. content.value is the editable initial answer; leave unknown answers empty. Available inputs: text, textarea, select (one option), multiselect (several answers to one question), checkbox, consent (a new permission or agreement; only the user can check it), document; markdown displays information and change displays editable before/after text. Select options are content.options [{id,label,description?}]. Use the actual choices supplied by the application when collecting its answers. Form-level positive/negative actions identify the user's selected action. Forms without actions can collect ordinary answers. Use [[forms:[formId,formId]]] for several review forms answered together.

The response contains the exact reviewed revision, values, explicit action choice and pinned document revision. Unselected actions and unchecked boxes are not consent. Saving a choice does not itself update Profile, Brief or Memory, or submit/send anything; use the relevant ordinary tools for the authorized action.

Use document items for owned document references. RelatedRefs link the existing role, document, browser or work. update requires expectedRevision. read returns the actual response state and recorded answers. resolve closes a revision when it no longer needs input; a later request to answer it requires an explicit update to a new revision.

answers returns, in one call, the user's earlier submitted answers in this conversation: the newest answer per question, newest first, from up to 30 recent responses. query narrows them to questions whose label, description or answer contains any of its words. Declined reviews, consent checkboxes and documents are left out. A past answer is what the user said for that earlier form; reuse it only when it answers the new question, and it never grants consent or approval.`,

  // 웹 검색·페이지 조회 관련
  // src/lib/agentTools/web.ts
  web_search: `Search the web for information, using search engine.`,
  career_web_search: `Start a new external search to discover sources. For known company facts, inspect existing company research and its references before searching the web for the same information. A remaining gap or an explicit need for fresh evidence can justify a new search.`,

  // src/lib/agentTools/web.ts
  open_url: `Read one URL or several independent URLs; a failed page does not discard the others. maxAgeHours=0 requests a fresh page; the result reports whether the provider actually fetched it.`,

  // 이메일 관련
  // src/lib/talentOnboarding/tools.ts
  search_connected_gmail: `Search the currently authenticated user's connected Gmail inbox for the user's requested or delegated Career work. query searches metadata/snippets or full content; page_token continues the same query. thread_id reads the complete exact thread including sent replies, independently of discovery filters. Use known personal facts, earlier search coverage and the current task to choose a date range or source. Read a full thread when a reply, correction or missing detail affects the work.

The server determines the user and connected account; never ask for or infer an account ID. A successful result contains normalized email metadata and optional plain-text content. A non-ok result means the inbox was not checked.`,

  // src/lib/career/emailWriting/tool.ts
  write_email: `Send an email or reply in an existing Gmail thread using an exact reply_to_message_ref from authenticated mail reads.
Use existing scoped delegation and approvals; use a review form when the user asked to review or authority is unresolved. Provide a stable purpose + target effect_key and reuse it across retries and browser/email alternatives.
For an existing opportunity/responsibility, use its reference and observed revision to reuse receipts across conversations. A reply checks the current full thread before sending. A stale thread returns control to you; read the new correspondence before deciding. After authorized ongoing contact, manage_work wait with waiting_on.kind=gmail_thread and the actual thread_id records the external dependency. This does not authorize extra messages.
Gmail permission is required; if unavailable, explain and show [[integration:gmail]].
An uncertain send may already have reached Gmail; inspect Gmail instead of retrying the send.`,

  // src/lib/career/background/delivery.ts
  deliver_career_email: `Prepare/deliver, read, retry, or cancel this background invocation's single Harper email. Delivered email is also saved in Career history; a separate chat copy is unnecessary. Recipient and sender are fixed by the server. A prepared email is immutable; retry reuses its exact body/key after you interpret current user messages.

Pending delivery suspends this original turn. Context changes return control to you, never rewrite or automatically replace the email. Cancel stops later attempts and does not recall prior delivery. Omit delivery when no contact is useful.`,

  // 일정·후속 작업 관련
  // src/lib/career/schedules/tools.ts
  list_schedules: `List the user’s saved future work, including paused/completed schedules. Read before modifying a matching existing promise.`,

  // src/lib/career/schedules/tools.ts
  read_schedule: `Read one owned schedule and its current revision, instructions, recurrence, next occurrence and last invocation.`,

  // src/lib/career/schedules/tools.ts
  upsert_schedule: `Save, update, pause, resume or cancel future Career work. Use a recurring day interval or calendar cron rule for continuing work; a no-send check retains its next occurrence. Clear both repetition fields for one-time work. Pausing/cancelling preserves the schedule. Resume the same schedule with timing suited to current context. Changes made by a background occurrence to its own schedule apply to future occurrences; changes from outside that occurrence can invalidate its current instructions.

Updating an existing schedule requires its revision. Never create duplicate schedules just to change timing.`,

  // 사용자 설정 관련
  // src/lib/talentOnboarding/tools.ts
  update_setting: `Update Harper subscription scope from an explicit latest user request. stop_external stops good-fit external/public postings but keeps direct-connection opportunities; stop_all stops all Harper matching contact; resume restarts recommendations/contact.

For generic stop/unsubscribe, ask one scope clarifier instead of calling. Not for batch size, cadence, profile facts, matching memory, or searches.`,

  // src/lib/talentOnboarding/languageSettingTool.ts
  update_language_setting: `Permanently change the user's saved Harper language, which chat, email and notifications all use. Call only for a clear request to use a language from now on, such as '앞으로 영어로 해줘'.

Do not call for a request about this reply only, such as '이번만 영어로 답해줘'; write that reply in the requested language.

For an unclear request such as '한글로 대답해봐', do not call; write that reply in the requested language and ask once whether to keep using it.

Writing in another language or describing language ability, such as '영어로 미팅은 어렵습니다', is not a request.`,

  // 통화·커리어 상담 관련
  // src/lib/talentOnboarding/tools.ts
  record_call_answers: `Record the caller's responses to the current call's numbered questions before moving on. Not knowing, uncertainty, refusal, and choosing to skip are valid responses. Use the conversation to decide which questions a response addresses; one utterance may address several. Update a recorded question when the caller corrects it.

The result contains saved responses and remaining question numbers; do not claim a response is saved if the tool fails. This records context only and does not contact a company or end the call.`,

  // src/lib/talentOnboarding/tools.ts
  end_call: `End the current live voice call. When you have enough context to start the first opportunity search, set complete_onboarding=true to persist the final answers and complete onboarding before disconnecting. Explicit uncertainty or a wish not to disclose can be part of that context. Separate final confirmation or hangup approval is not required.

If the caller asks to stop with onboarding unfinished, or this is another call mode, set complete_onboarding=false to end only the call. An explicit stop takes priority over further questions. This tool does not change recommendation, email, account, or profile settings.`,

  // src/lib/talentOnboarding/tools.ts
  read_career_coaching_list: `Read the prepared catalog of career-coaching topics when the user explicitly wants coaching and needs help choosing what to discuss. The tool has no inputs and no side effects. Its result is ready-to-read text, not structured topic data.`,

  // src/lib/talentOnboarding/tools.ts
  manage_career_coaching_activity: `Manage one user-visible focused career-coaching conversation. The default is ordinary Career chat. Do not use it for an ordinary career question or advice request, role/company evaluation, job recommendation, settings or document task, isolated emotional remark, vague dissatisfaction, complex topic alone, or old coaching history. When uncertain, answer normally without proposing coaching.

Every new activity must use suggest first after one honest topic is clear; never use start to create a new activity. Ask the user to choose 5, 10, or 20 minutes before suggesting unless they already provided one. If they do not answer that question but continue or ask to proceed, choose one of those three durations. No other duration is valid.

Use start only for an existing suggested activity after the user chooses chat or call, including through the exact activity-card action. Start requires channel; topic and duration carry over from the suggestion, and agenda is optional. An explicit start action on the exact current active call activity may re-open a call whose client connection was interrupted.

Never use update or end when no current activity snapshot is present; an end mentioned in history has already happened. For a suggested activity, update only a confirmed topic or suggested duration. For an active activity, update only a material confirmed change to topic, planned duration, agenda, or channel.

Use end when the user clearly finishes, stops, or dismisses the current activity. This tool changes the visible activity lifecycle only; use shared context tools for durable career facts.`,

  // ============================================================================
  // ======================== 현재 미사용 — 15개 설명 ============================
  // ============================================================================
  // 현재 Career 제품 경로에서는 사용하지 않습니다.
  // 아래 설명의 코드 참조가 남아 있어도 현재 제품 도구로 분류하지 않습니다.

  // 회사 리포트 관련
  // src/lib/career/companySnapshot.ts
  search_company_web: `Search the public web with Exa for company evidence. Choose the query, search mode, source filters, date range, and returned content needed for the current report.`,

  // 기존 이력서 작성 관련
  // src/lib/talentOnboarding/tools.ts
  generate_resume: `Create, edit, or privately copy a resume only on explicit request or clear acceptance of Harper's specific offer; career disclosures alone are not consent. Read the current structured document before update or copy; uploaded originals stay unchanged.

Saves editable JSON for preview; PDF is created on download. Does not change Profile/Memory or share/submit the resume. Continue the conversation with the result.`,

  // 기존 지원 준비 세션 관련
  // src/lib/career/simulation/sessionTool.ts
  manage_simulation_session_saved: `Find saved Apply with Harper preparations with action=list, then resume one on the user's request with action=resume and its sessionMessageId. Returns a compact index, not document bodies.

Resuming restores saved answers, suggestions and documents in this conversation; it does not submit or restart a website browser. End an active application first when the user asks to switch. Use before starting a new preparation when the user wants to continue earlier work.`,

  // src/lib/career/simulation/sessionTool.ts
  manage_simulation_session_active: `Manage the current application-simulation session: select an action, record progress backed by the conversation, correct session facts, propose one next action, add a user-requested action or end the session. Does not edit documents or save long-term memory. Only use for the current active session.

For preparation mode, use respond with actionId and response to save the user’s explicit decision or answer, Use upsert_document to save ordinary documents and cover letters needed by this delegated application; no extra permission question is needed. Show the saved document UI, not a long draft in chat. web_search/open_url can verify public information within this mode.

Use revise_item with newAction to update an existing preparation item by its stable ID or add a user-requested item. Existing answers are retained; reconsiderResponse=true clears only that item’s answer when a correction invalidates it. Documents are checked for ownership. These operations do not submit applications.

For propose, supply actionId, title, reason and request. For update_action, supply actionId, status and an evidence-based reason. completed means the action was addressed through a successful edit or useful bullet/direction suggestion; it does not require the user to have applied the suggestion. The reason records the actual edit or concrete suggestion and distinguishes guidance from an applied change.

For save_fact, supply text and use factId only when correcting an existing fact.

A clear instruction to stop or start another task authorizes end directly; a recorded switch request is optional and needs no separate confirmation. Use request_switch only for a proposed change the user has not chosen; cancel_switch clears it.

For end, text may contain a concise evidence-grounded closing summary. Ending preserves the session and documents without submitting. Continue a requested next task using the normal tools in the same turn. After a change, continue the conversation from the returned state.`,

  // src/lib/career/simulation/sessionTool.ts
  manage_simulation_session_preparation: `Manage application preparations. list returns a compact index of saved preparations; resume restores an exact sessionMessageId after ending any other active application.

inspect checks the current application's live form and access again, including after a failed or stale inspection; it waits for the result, preserves answers and documents, and never fills or submits. Use save_application to save answers for the new observation before applying; the prepared resume remains available.

end saves the current preparation and leaves the mode WITHOUT submitting; saved answers, suggestions and documents can be resumed later. It stops an active website browser; resuming preparation does not restart that browser or repeat a submission.

A clear request to stop or start another application authorizes end directly, without request_switch or another confirmation. request_switch is only for a proposed change the user has not chosen; cancel_switch keeps this application active. Continue a requested switch in the same turn.

save_fact records a confirmed session fact; factId identifies a correction/removal. Use shared Profile/Brief/Memory tools for durable user information, manage_application_suggestions for suggestions and ready_for_role for resume edits.`,

  // src/lib/career/simulation/suggestions.ts
  manage_application_suggestions: `Resolve or revise preparation suggestions. Existing id addresses an item; suggestion replaces it or creates one without id. accept settles an authorized change, ignore removes it from execution, ask publishes it in the question composer and ends the turn.

For an answered question, use ignore and accept any resulting grounded change. Saved button choices remain settled unless the user subsequently changes them.

This tool records decisions; ready_for_role writes the actual resume. Save useful partial work before publishing a new essential question.`,

  // src/lib/career/simulation/suggestionWriter.ts
  finish_application_suggestions: `Return the completed resume review as independently reviewable suggestions. Use an empty array when the review finds no useful changes or questions.`,

  // src/lib/career/simulation/applicationInput.ts
  request_application_information: `Request decisions, missing facts or documents in the application composer. Use question without options to collect writing ideas, motivation or experience notes; use material only to request or select an actual file.

Reference existing preparation action IDs to reuse their evidence and edit examples; an explicit different kind creates a new question from that action without overwriting its history; supply kind/title/description/options for additional questions.

For an additional change, include target/reason and edits grounded in confirmed source facts; unknown experience belongs in a question, not a finished edit example. For a final resume selection, use a material item with documentPurpose=final_resume.

Only ask when the answer changes content or the next operation. One pending batch is allowed; replace=true explicitly replaces it, preserving answers to unchanged items.

This tool saves a question batch and ends the current turn to wait for the user. Do not execute other work after it.`,

  // src/lib/career/simulation/readyForRole.ts
  ready_for_role: `Save the resume for the current role using content or scoped changes YOU authored. This tool performs no LLM writing. Use reuse/create/copy/update.

First tailoring preserves the original: create from the full uploaded source or copy a generated source with its current revision; later edits update workingResume. Resume readiness is independent of the website inspection. Returns the saved document and revision.

Application answers and attachments are saved separately with save_application. Does not submit or grant consent.`,

  // src/lib/career/simulation/saveApplication.ts
  save_application: `Save the completed private application answers and attachment choices YOU wrote from the observed form after the role's resume is saved and delivered. Also save available materials for manual application when assisted submission is unavailable. Does not write or modify the resume, run an LLM, or submit.

On later edits, include only fields the user asked to change; omitted fields retain their saved values, including user edits. Unknown personal facts and unapproved consent stay blank.

Save ordinary supporting documents with upsert_document first. Call with empty application_fields for a files-only handoff when no fields were observed.`,

  // 기존 지원 브라우저·제출 관련
  // src/lib/career/simulation/applicationBrowserActions.ts
  perform_application_browser_action_read: `Read the public application page. Inspect reads the main document and any frames you explicitly selected. It returns controls, instructions and an unread frame index, without opening frame contents.

Only if the application form is embedded, inspect with its observed frameRef. Other frames need no inspection. A frame read failure preserves readable content and appears in readErrors.

Navigate only the supplied URL or a link actually observed in the latest snapshot. Click may follow an observed link or a button outside forms; form controls and submit buttons are blocked. No candidate data, files, code execution, input actions or approval commands are available.`,

  // src/lib/career/simulation/applicationBrowserActions.ts
  perform_application_browser_action_operate: `Inspect and operate the current application browser through observed element refs. Reads default to the main document; only select an observed frameRef with inspect when the application form is embedded. Subsequent snapshots refresh the main document and explicitly selected frames; readErrors identify inaccessible scopes, never proof of missing fields.

Use fill_fields to fill, select, check and attach multiple confirmed fields from the same current snapshot in one call. Each field uses action, ref and its value/checked/documentId. A batch cannot navigate, click or submit; it stops at an error or held website request. Inspect the returned snapshot before continuing with remaining fields; never replay a batch. Use documentId only from supplied attachments.

Website requests after personal input are held for user approval. A pendingRequest pauses this browser task; do not retry the action. Executable code, arbitrary HTTP calls and approval commands are unavailable.`,

  // src/lib/career/simulation/applicationFormInspection.ts
  report_application_form: `Finish public read-only inspection. Return all current observed application input refs, including personal details, documents, links, custom questions, choices and consent. Exact labels, types, instructions and limits are copied from the browser by the server.

Exclude non-application controls and inaccessible/hidden controls. An empty list is valid only after checking the form or accurately reporting unavailable access. Preserve conditional-field limitations.`,

  // src/lib/career/simulation/applicationBrowser.ts
  apply_for_role: `Submit the current role's saved application using its prepared answers and selected files, only after the user asks to submit that version. This request authorizes website entry, attachments and final submission without another confirmation. Prepare and show known required materials first.

Reuses an in-progress run; retries a failed attempt when no submission was sent. Returns the recorded outcome when submission succeeded or may have happened. Set restart=true only when the user explicitly requests a NEW attempt knowing that prior outcome. Resuming saved preparation preserves the prior outcome. A saved-stage applied label alone is not a website receipt.

Without a saved reviewed application, the packet must still be shown and approved before transmission. Login/CAPTCHA are unsupported. Yields only while a run or genuinely new required input is pending; otherwise use the returned facts to answer the user.`,

  // src/lib/career/simulation/applicationBrowserServer.ts
  report_application_outcome: `Report the observed application outcome. Success requires an actual confirmation page, receipt or confirmation number after approved submission.

If the site says an application already exists, report uncertain with that exact observed evidence; do not claim this run submitted it or try submitting again.

Login/CAPTCHA are failures. A click or turn completion is not success. Include the real final URL, observed evidence and actual blocker; never claim mailbox access.`,
} as const;
