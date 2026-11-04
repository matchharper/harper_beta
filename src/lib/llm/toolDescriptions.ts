/**
 * Career 도구의 최상위 function.description 원본. 도구 이름으로 찾아 수정합니다.
 * 위쪽은 현재 사용, 아래쪽은 현재 미사용 설명입니다.
 * 사용 여부는 현재 Career 제품 경로 기준이며 디버깅·평가·구 실행 처리는 제외합니다.
 * 입력 필드 설명과 handbook 본문은 각 schema/guide에 둡니다.
 * 동적 설명은 실행 모듈을 import하지 않고 필요한 사실만 인자로 받습니다.
 * 같은 이름의 기존 지원 도구는 saved/active/preparation, read/operate로 구분합니다.
 */
export const TOOL_DESCRIPTIONS = {
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
  list_matchings: `Read matching workspaces and exact global list revision. A matching preserves a complete criteria snapshot; metadata archive does not reject roles or stop schedules.`,

  // src/lib/career/matching/tools.ts
  read_matching: `Read frozen criteria beside current Brief, current/previous memberships, feedback, runs and private evaluations. Evaluations cover the entire matching, independently of the run history page, unless runId narrows the scope. Return the top 30 non-expired evaluations by default, total and remaining non-expired evaluation counts, and a count of expired roles; expired external roles are omitted from evaluation and membership lists. Use evaluationCursor for further results and runCursor for history; scores must never be disclosed.`,

  // src/lib/career/matching/tools.ts
  upsert_matching: `Create with the complete Search Brief plus scope; use a new matching when meaningfully changing criteria. This snapshot does not update the current Search Brief: save changes to ongoing search preferences through write_talent_context first.

Keeping old results or asking for a separate list does not itself mean a one-off exploration; preserve the old Brief only when the user's meaning keeps that ongoing direction.

Update only title/description; archive/restore preserves results, decisions and schedules. Read revision before modifying.`,

  // src/lib/career/matching/tools.ts
  search_opportunities: `Retrieve and evaluate external roles without publishing. External search requires matchingId and retrieval plan or exact roleIds; search and resume wait for evaluation and return the top 30 non-expired evaluations by mutual fit, total and remaining non-expired evaluation counts, the expired role count, a next-page cursor, and any partial failures. Expiration is checked when reading results, including saved runs; expired roles are returned only as a count. They use the stored Behavior Context without a refresh job.

Read retrieves a saved run or another result page; pass the returned evaluationCursor as cursor with the same source and runId, and use limit for the page size (default 30). Resume retries an incomplete run; cancel stops it. Evaluation limit controls how many roles are evaluated, independently of the result page size (existing retrieval supports up to 500). External retrieval evaluationLimit defaults to 400 when omitted. Private assessment is for your judgment only.`,

  // src/lib/talentOnboarding/tools.ts
  get_role_context: `Read exact roles and current recommendation/progress facts by roleId, including internal roles not yet recommended. Public role details can inform discussion and preparation. Use for research, comparison, recommendation or introduction work when current context is insufficient.

Includes company facts, existing recommendation decisions, meetings and a page of role activities. Use activityOffset for older activity pages when activityPage.hasMore is true; include_jd adds the full job description.`,

  // src/lib/talentOnboarding/tools.ts
  read_recommended_opportunities: `Read the user's existing recommended public AND Harper-connected opportunities, including recovering a roleId for Apply with Harper from a provided posting URL. Use postingUrl for an exact URL lookup regardless of the company name's language.

Treat feedback=negative and rejected as Talent-side rejection records, not company rejections. For archived and stopped processes, follow progress.message and treat progress.stopReason as authoritative.`,

  // src/lib/career/matching/tools.ts
  upsert_opportunities: `Publish selected evaluated roles or manage membership independently of feedback/progress. add/update/archive/restore/replace/reset never accept, reject, erase saved state or contact companies.

matchingId chooses one list; omitted means default list. allLists true explicitly targets every list for reset/archive.

add/restore/replace/reset require the exact current list revision supplied in matching context or by read_matching/list_matchings; read again after reset or another edit. New external publication requires both roleId and its exact evaluationId from completed evaluation results. Historical fit-cache entries have no publication reference; search_opportunities with exact roleIds obtains one. Internal publication requires its roleId.`,

  // src/lib/talentOnboarding/tools.ts
  update_recommended_opportunity_feedback: `Record a decision on one exact recommendation: dislike declines, keep saves an internal role for later, and like saves external interest. Internal introduction acceptance uses contact_company with the exact recommendation after the candidate has reviewed the Role and asks to be introduced. That tool pins prepared materials or the default profile and public documents and submits to the company agent. apply_to_internal_role saves an initially requested internal opportunity.`,

  // 외부 공고·지원 관련
  // src/lib/talentOnboarding/tools.ts
  save_job_posting: `Import one external public job posting from its URL into this user's Jobs. Use for a requested save or to save an external posting the user asked to apply to when it is not yet in their Jobs. The application request includes this preparation; a separate save confirmation is unnecessary.

Creates or reuses the posting and the user's recommendation, preserving existing application progress. Returns roleId, recommendationId and savedStage. Use the returned roleId to continue the requested application with the application tools and handbook; saving alone does not submit an application. Harper-connected/internal roles use the internal role tools.

If extraction is incomplete, the result includes the retrieved page body and actual retrieval failures. Read that body as source data, identify the exact job title and hiring company, then continue the authorized save with the same URL and those fields. Ask the user only for facts unavailable from the source; do not treat an empty summary as an unreadable page.`,

  // src/lib/career/browser/tool.ts
  use_browser: `Operate a persistent browser primarily for job applications. Write the actual task yourself, including the user's requested outcome and authority.

run starts or continues a task and returns a durable execution receipt. Pending runs suspend only their owning work; read the completed observation when resumed. When human-only interaction is needed, it also makes the browser available to the user.

read/list inspect current or interrupted executions when needed. handoff interrupts the active task at its current page for a user-requested takeover; it does not navigate to login. release stops an idle browser while preserving workspace files; close also clears transferred files.

Browsers are short-lived and may expire while waiting for the user. Preserve observed questions, answers and pinned attachments; restore them in a new browser and recheck account, fields and current conditions. A saved session does not guarantee preserved login or page state. Prepare mode cannot submit; execute mode requires actual user authority and a stable effect_key shared with any email alternative. Separate work uses separate browser workspaces.

Do not use for ordinary search when web_search/open_url suffice. An uncertain run may have acted externally: read it rather than resubmitting.

Active sessions appear as stacked previews above the chat composer. Include [[browser:SESSION_ID]] in your message to expand a specific session for the user; this only changes its presentation, not control or authorization. Viewer credentials are delivered only to the user interface.`,

  // Harper 내부 공고·지원 관련
  // src/lib/talentOnboarding/tools.ts
  get_internal_roles: `Find current internal Harper-connected roles. Default mode is direct title/company lookup or exact lookup by role_id. When an exact role ID is known, pass role_id without needing keywords.

With matchedOnly=true, return the user’s available suggestions. Results can be narrowed by a public company name. This is read-only.`,

  // src/lib/career/internalApplications/tools.ts
  apply_to_internal_role: `For initial interest in an exact internal Role, including a request from a public job page to introduce the candidate, save/reuse the private opportunity immediately. The result includes public Role/company facts and its roleId for a posting card. It contains no internal hiring status or private company criteria.

This first step does not request an introduction or share with the company. Present the Role in context with its posting card so the candidate can inspect it. A subsequent explicit request or introduction button authorizes contact_company(acceptIntroduction=true). Use get_internal_roles and upsert_opportunities for proactive internal recommendations.`,

  // src/lib/career/internalApplications/tools.ts
  assign_to_role: `Read, replace, or clear the preparation materials for an internal Role. Read first and use its assignment revision as expectedRevision for set/clear (0 when none exists). Set snapshots exact profile/document revisions; documents-only freezes the current default profile.

The result includes selectionRef for the exact selected versions. Clear changes preparation only, not accepted sharing. An accepted introduction shares updates only through a later authorized contact_company with that selectionRef.`,

  // 회사 탐색·팔로우·연락 관련
  // src/lib/career/companies/tools.ts
  search_companies: `Find company workspaces by company name, website or LinkedIn URL. Results include names, LinkedIn URLs and company_workspace_id for following; use offset to read more matches.`,

  // src/lib/career/companies/tools.ts
  follow_company: (coverage: string) =>
    `List, read, follow, update or unfollow company subscriptions. action=follow accepts a companies array, each with company_workspace_id or company_name and an optional instruction. A company name alone is sufficient, including companies absent from the directory; search_companies is optional. A batch saves each follow independently and reports individual failures; successful items remain saved. action=read with follow_id reads the follow facts and pages current roles with saved assessments (offset pagination); it does not run a new search or reevaluate roles. action=list reads the user's subscriptions, exact scopes and revisions; use it before changing a follow. List defaults to active follows, with include_unfollowed and offset for history and pagination. Use the current follow_id and expected_revision for update/unfollow.

Company scope includes all linked organizations; workspace scope includes only that workspace. Name-only follows have no linked local role inventory. ${coverage}

This does not grant company sharing permission or affect company search ranking.`,

  // src/lib/talentOnboarding/tools.ts
  read_company_connections: `Read companies and Roles with existing mutual connections or agent introduction correspondence for this user. An agent request is not yet a mutual connection. This includes an accepted company Request Intro, a Harper recommendation actually handed to the company, and a company contact that reached the user.

Use it when the user wants Harper to ask, follow up, clarify, pass along information, or identify which connected company they mean. The result reports durable relationship facts and the latest relay transport status without deciding what Harper should say.`,

  // src/lib/talentOnboarding/tools.ts
  contact_company: `Communicate with the company's agent within the user's delegated purpose and sharing permissions. Send questions, information, requests or replies asynchronously; the receiving agent acts for its company. The receipt confirms agent inbox submission, not human readership or a completed connection.

Use introductionRootId or replyToMessageId from read_agent_messages for existing correspondence, or connectionId for a legacy mutual connection or ops-contact. To start an authorized introduction, use recommendationId and acceptIntroduction=true; this records the candidate's sharing decision and pins prepared materials, otherwise the default profile and public resumes. selectionRef shares the exact selected material versions. Private Brief and Memory are not shared. Do not combine target forms.

relayContent is your message to the company's agent. Preserve the user's meaning, conditions, uncertainty and sharing scope. Resolve the intended company or Role before sending.`,

  // 프로필·사용자 맥락 관련
  // src/lib/career/profiles/tools.ts
  list_profiles: `List your profile variants and archives, with exact IDs and current revisions. Read a profile for full content.`,

  // src/lib/career/profiles/tools.ts
  read_profile: `Read an exact profile revision and revision history. compareRevision adds another original snapshot for comparison; sections narrows the source. Omit profileId for the default profile.`,

  // src/lib/career/profiles/tools.ts
  update_talent_profile: `Create, copy, edit, choose the default, archive or restore a profile. Role variants do not change the default. Copy can include confirmed edits; expectedRevision selects its source revision.

Other edits save an immutable revision and expectedRevision detects concurrent changes. Use assign_to_role separately to choose introduction materials.`,

  // src/lib/talentOnboarding/tools.ts
  read_talent_context: `Read more of this user's saved Search Brief or Memory when the context already provided is insufficient. Search Memory with a natural-language description of the current task; use refs to retrieve exact rows already mentioned.

This reads only and does not change profile, settings, recommendations, or sharing.`,

  // src/lib/talentOnboarding/tools.ts
  write_talent_context: `Save or correct user facts and context worth reusing after onboarding. Memory is the default collection for information about the user that can help future conversations or tasks. Put current opportunity-search criteria and premises that the user can review in Search Brief.

Save facts stated by the user or supported by verified sources, preserving their subject, source and uncertainty. An inference does not establish personal experience, contribution or preference. When a saved fact is corrected or no longer true, update or delete that row instead of appending a conflicting current fact; keep a past event only when it remains useful as history.

For each new Memory, choose importance 3 if it can materially change matching, 2 if it is useful supporting context, or 1 if it mainly preserves conversational continuity. For a Brief, do not repeat its label in content.

Read the existing rows and the user's meaning together, retrieving related records when needed to distinguish a new fact from a repetition or correction. Preserve exact values needed for reuse, strength, exceptions, uncertainty, and known timing; respect the user's stated retention limits. A reply to an earlier Harper question, including a form response, is handled with this same tool. Read exact prior contact wording when its scope is unclear. Save a one-role exception as a scoped Brief fact, never as a global preference.

Successful Brief changes automatically refresh matching; do not call a separate re-evaluation tool. Do not duplicate one fact across both collections.

Use the relevant profile, settings, document, feedback, or recommendation tool when that feature already owns the data. Do not call when nothing should be saved.`,

  // src/lib/talentOnboarding/tools.ts
  read_talent_activity_events: `Read concise activity summaries or actual sent-contact questions for this talent. Use scope=contacts with query/cursor for older questions and refs (up to three) for exact wording; a sent question does not prove an answer.

Use when the answer depends on what the user recently changed or did in Career, such as profile preference changes, profile-row memo additions or updates, onboarding completion, or Harper insight updates.`,

  // 이력서·문서 관련
  // src/lib/talentOnboarding/tools.ts
  list_documents: `List this user's active saved documents and generated context documents as paginated metadata including each document's description. Use it to resolve earlier document references, discover a saved context named in the system prompt, or answer which documents are saved.

Includes the latest recorded PDF export result/cause when available; a saved document does not prove a successful PDF download. It never returns document text and never returns soft-deleted rows.`,

  // src/lib/talentOnboarding/tools.ts
  read_document: `Read one bounded excerpt from one active saved or generated document's extracted text. Use the exact document_id from current upload context or list_documents. This reads extracted text directly and does not require a downloadable file.

Includes the latest recorded PDF export result/cause when available, with its revision; it does not prove receipt on the user's device.

If current upload context already includes content_excerpt, continue from its next_offset instead of rereading offset 0. Binary-only files can be saved but return textAvailable=false.`,

  // src/lib/talentOnboarding/tools.ts
  upsert_document: `Create, update or copy an owned resume or Markdown document as needed for the user's delegated work, respecting explicit limits. Casual career disclosures alone do not authorize writing.

Select action and use type=resume or type=markdown on create; update/copy infer the saved type when omitted. Author the content yourself. Resume content uses structured content or changes; Markdown uses markdown or exact edits.

Read the current document and revision before content updates/copies. Metadata can be changed without rewriting the body, and omitted metadata is preserved.

Uploaded originals stay unchanged; create a separate document from their verified contents. New documents and copies are private unless a visibility change is authorized.

Returns saved facts and a preview/PDF-download link; saving does not generate the PDF, send or submit it.`,

  // 질문·검토 폼 관련
  // src/lib/career/forms/server.ts
  suggest_form: `Create, revise, read, list or present saved interactive forms. Multiple independent forms can remain open and receive answers while you work.

Use suggestion for itemwise edits/questions in the chat composer. Within suggestion, change items are proposals with positive/negative decision buttons; text/textarea items are questions with an answer field and skip control. Each item has a label for its title and a description explaining the question or proposed change and why it matters.

Use form for a prefilled editable review card in the conversation with final action buttons. Each item has a stable id, arbitrary label, optional description, renderer type and content. Users can also reply in their own words or skip suggestion items without choosing a supplied action.

Each answered suggestion item is saved and resumes its linked work without waiting for other items or forms. Use document items for selectable attachments. Put execution references in relatedRefs; visible items contain the information the user reviews.

Proposal buttons belong to individual change items; form-level buttons belong to review forms. Positive/negative actions carry the exact user message selected on click.

A partial suggestion response or a review-form action records the exact reviewed revision, edited values and selected messages in the conversation, then resumes you to carry out the chosen actions with the appropriate tools. Recording a response does not update Profile, Search Brief or Memory, or execute the chosen action.

Revisions are immutable; update requires expectedRevision. read includes recorded responses. present redisplays an exact saved revision. resolve closes an exact revision when a conversational answer, changed request or existing delegation removes the need for a click; it does not execute the requested work. Ordinary chat remains available while forms are open.`,

  // 웹 검색·페이지 조회 관련
  // src/lib/agentTools/web.ts
  web_search: `Search the web for information, using search engine.`,

  // src/lib/agentTools/web.ts
  open_url: `Open a specific website URL and return page content.`,

  // 이메일 관련
  // src/lib/talentOnboarding/tools.ts
  search_connected_gmail: `Search the currently authenticated user's connected Gmail inbox for the user's requested or delegated Career work. query searches metadata/snippets or full content; page_token continues the same query. thread_id reads the complete exact thread including sent replies, independently of discovery filters. Automatic background search results are already retrieved evidence; fetch full threads when snippets do not establish current facts.

The server determines the user and connected account; never ask for or infer an account ID. A successful result contains normalized email metadata and optional plain-text content. A non-ok result means the inbox was not checked.`,

  // src/lib/career/emailWriting/tool.ts
  write_email: `Send an email.
Use existing scoped delegation and approvals; use a review form when the user asked to review or authority is unresolved. In delegated work, provide a stable effect_key and reuse it across retries and browser/email alternatives.
Gmail permission is required; if unavailable, explain and show [[integration:gmail]].
An uncertain send may already have reached Gmail; inspect Gmail instead of retrying the send.`,

  // src/lib/career/background/delivery.ts
  deliver_career_email: `Prepare/deliver, read, retry, or cancel this background invocation's single Harper email. Recipient and sender are fixed by the server. A prepared email is immutable; retry reuses its exact body/key after you interpret current user messages.

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
  end_call: `End the current live voice call. When the required onboarding topics are answered, set complete_onboarding=true to save the final answers and complete onboarding before disconnecting; separate final confirmation or hangup approval is not required.

If the caller asks to stop with onboarding unfinished, or this is another call mode, set complete_onboarding=false to end only the call. An explicit stop takes priority over further questions. This tool does not change recommendation, email, account, or profile settings.`,

  // src/lib/talentOnboarding/tools.ts
  read_career_coaching_list: `Read the prepared catalog of career-coaching topics when the user explicitly wants coaching and needs help choosing what to discuss. The tool has no inputs and no side effects. Its result is ready-to-read text, not structured topic data.`,

  // src/lib/talentOnboarding/tools.ts
  manage_career_coaching_activity: `Manage one user-visible focused career-coaching conversation. The default is ordinary Career chat. Do not use it for an ordinary career question or advice request, role/company evaluation, job recommendation, settings or document task, isolated emotional remark, vague dissatisfaction, complex topic alone, or old coaching history. When uncertain, answer normally without proposing coaching.

Every new activity must use suggest first after one honest topic is clear; never use start to create a new activity. Ask the user to choose 5, 10, or 20 minutes before suggesting unless they already provided one. If they do not answer that question but continue or ask to proceed, choose one of those three durations. No other duration is valid.

Use start only for an existing suggested activity after the user chooses chat or call, including through the exact activity-card action. An explicit start action on the exact current active call activity may re-open a call whose client connection was interrupted.

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
