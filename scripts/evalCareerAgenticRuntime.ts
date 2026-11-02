import { config } from "dotenv";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Ajv from "ajv";

config({ path: ".env.local", quiet: true });
// No imported server client can access the real database even before the network guard.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-agentic-runtime";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { user: id(1), profile: id(2), tailored: id(3), copy: id(4), role: id(11), external: id(12), failed: id(13), doc: id(21), matching: id(31), newMatching: id(32), recommendation: id(41), oldRecommendation: id(42), evaluation: id(51), run: id(61), schedule: id(71), follow: id(81), workspace: id(91) };
const clone = <T>(value: T): T => structuredClone(value);

async function main() {
  const fixture = JSON.parse(readFileSync(`${task}/cases-v10.json`, "utf8"));
  const gold = JSON.parse(readFileSync(`${task}/gold-v10.json`, "utf8"));
  const frozen = JSON.parse(readFileSync(`${task}/manifest-v10.json`, "utf8"));
  for (const [name, digest] of Object.entries(frozen.hashes)) assert.equal(hash(readFileSync(`${task}/${name}`)), digest);
  assert.deepEqual(fixture.cases.map((c: any) => c.id), gold.cases.map((c: any) => c.id));
  if (process.argv.includes("--validate-only")) { console.log(`Validated ${fixture.cases.length} frozen cases and gold.`); return; }
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt >= 0 ? new Set(process.argv[onlyAt + 1].split(",")) : null;
  const cases = fixture.cases.filter((c: any) => !only || only.has(c.id));
  assert.ok(cases.length > 0);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `${task}/runs/${runId}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  writeFileSync(`${dir}/runtime.log`, "", { mode: 0o600 });
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"] as const) console[level] = (...values: unknown[]) => appendFileSync(`${dir}/runtime.log`, values.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ") + "\n");
  const context = new AsyncLocalStorage<{ caseId: string; model: string }>();
  const originalFetch = globalThis.fetch;
  const requests: any[] = [], blocked: any[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const scope = context.getStore();
    if (!(url.hostname === "api.openai.com" && ["/v1/responses", "/v1/chat/completions"].includes(url.pathname)) && !(url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages")) {
      blocked.push({ caseId: scope?.caseId, host: url.hostname, path: url.pathname });
      throw new Error("Evaluation blocks non-provider network requests");
    }
    assert.ok(scope, "Provider call must belong to a frozen case");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    assert.equal(body?.model, scope.model, "Unexpected model/fallback");
    const requestNo = requests.length + 1;
    const record: any = { caseId: scope.caseId, requestNo, model: body.model, reasoning: body.reasoning ?? body.thinking ?? body.reasoning_effort, outputConfig: body.output_config, maxOutputTokens: body.max_output_tokens ?? body.max_tokens, temperature: body.temperature, promptSha256: hash(JSON.stringify(body)) };
    requests.push(record);
    save(`request-${requestNo}`, body);
    const start = Date.now();
    const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
    const response = await originalFetch(input, { ...init, signal });
    const text = await response.clone().text();
    record.elapsedMs = Date.now() - start; record.status = response.status;
    try { const parsed = JSON.parse(text); record.usage = parsed.usage; } catch { /* Raw SSE remains available for inspection. */ }
    save(`response-${requestNo}`, { status: response.status, body: text });
    return response;
  }) as typeof fetch;
  try {
    const { buildCareerOpportunityFeedbackFollowUpTurnInstruction } = await import("../src/lib/career/prompts");
    const { formatSavedOpportunityDecision, formatOpportunityDecisionReceipt } = await import("../src/lib/career/opportunityFeedbackEvent");
    const { formatOpportunityFeedbackPromptContext } = await import("../src/lib/talentOnboarding/activityEvents");
    const { runCareerChatAssistant } = await import("../src/lib/career/llm");
    const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
    const { resolveCareerTextChatModel } = await import("../src/lib/career/textChatModelConfig");
    const { CareerCapabilityRuntime, CareerReplyContinuation } = await import("../src/lib/career/capabilities/runtime");
    const { renderCareerBackgroundInvocation } = await import("../src/lib/career/background/prompt");
    const { formatCareerMatchingResult } = await import("../src/lib/career/matching/formatters");
    const { formatProfileToolResult, applyProfileEdits } = await import("../src/lib/career/profiles/tools");
    const { formatInternalApplicationToolResult } = await import("../src/lib/career/internalApplications/tools");
    const { formatCareerSchedules } = await import("../src/lib/career/schedules/server");
    const { formatCompanySearch, formatCompanyFollows } = await import("../src/lib/career/companies/server");
    const { formatCareerEmailReceipt } = await import("../src/lib/career/background/delivery");
    const { careerFormDraftSchema } = await import("../src/lib/career/forms/schema");
    const { formatCareerFormForModel } = await import("../src/lib/career/forms/format");
    const { withTalentToolAssistantInstruction } = await import("../src/lib/talentOnboarding/tools");
    const { formatRelayableCompanyTalentConnections } = await import("../src/lib/companyTalentRequests/server");
    const ajv = new Ajv({ strict: false, allowUnionTypes: true });
    const sourcePaths = ["scripts/evalCareerAgenticRuntime.ts", "src/lib/career/llm.ts", "src/lib/career/llmTools.ts", "src/lib/career/capabilities/runtime.ts", "src/lib/career/capabilities/registry.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/toolPolicyPrompt.ts", "src/lib/career/prompts/conversationSections.ts", "src/lib/career/prompts/rawPrompts.ts", "src/lib/career/prompts/cases/lifecyclePrompts.ts", "src/lib/career/opportunityFeedbackEvent.ts", "src/lib/career/textChatModelConfig.ts", "src/lib/llm/responsesChatAdapter.ts", "src/lib/career/background/prompt.ts", "src/lib/career/matching/formatters.ts", "src/lib/career/matching/tools.ts", "src/lib/career/internalApplications/tools.ts", "src/lib/career/background/delivery.ts", ...readdirSync("src/lib/career/handbooks").filter(p => p.endsWith(".ts")).map(p => `src/lib/career/handbooks/${p}`)];
    save("manifest", { task, datasetVersion: "v10", runId, createdAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: true, dirtyDiffSha256: hash(execFileSync("git", ["diff", "--binary"], { maxBuffer: 40 * 1024 * 1024 })), sources: Object.fromEntries(sourcePaths.map(p => [p, hash(readFileSync(p))])), fixtureHashes: frozen.hashes, selected: cases.map((c: any) => c.id), timeoutMs: 300_000, requestTimeoutMs: 120_000, concurrency: 2, privacy: "Synthetic inputs; provider-only network; in-memory execution; no headers or credentials saved" });

    const runCase = async (scenario: any) => {
      const background = scenario.mode === "background";
      const modelConfig = background ? { model: "gpt-6-luna", openAIResponsesReasoningEffort: "high" as const, chatCompletionReasoningEffort: "high" as const } : resolveCareerTextChatModel(undefined);
      return context.run({ caseId: scenario.id, model: modelConfig.model }, async () => {
        const calls: any[] = [], errors: string[] = [], checkpoints: any[] = [];
        const state: any = {
          revision: "list-1", matchingId: ids.matching, profileWrites: [], assignments: [], memberships: [], emails: [], followWrites: [], scheduleWrites: [], settingWrites: [], forms: [], contextWrites: [], conflictInjected: false, queued: false, childReady: false, emailContextChanged: false,
          brief: [{ ref: 1, label: "직무", content: "플랫폼 엔지니어" }, { ref: 2, label: "근무지역", content: "서울, 주 2회 출근 가능" }, { ref: 3, label: "기본연봉", content: "연 9천만 원 이상" }],
        };
        state.decisions = []; state.formalRecommendation = Boolean(scenario.formalRecommendation);
        if (scenario.preparedAssignment) state.assignments.push({ id: id(101), role_id: ids.role, revision: 1, action: "set", profile_id: ids.tailored, profile_revision: 2, documents: [{ id: ids.doc, revision: 3, file_name: "プロジェクト説明書", extracted_text: "서비스 SLO 설계와 장애 대응" }] });
        if (scenario.event?.source === "internal" && scenario.event.decision === "positive" && !scenario.preparedAssignment)
          state.assignments.push({ id: id(102), role_id: ids.role, revision: 1, action: "set", profile_id: ids.profile, profile_revision: 4, documents: [] });
        const savedOpportunity: any = { id: ids.recommendation, roleId: scenario.externalTarget ? ids.external : ids.role, sourceType: scenario.externalTarget ? "external" : "internal", opportunityType: scenario.event?.intro ? "intro_request" : scenario.externalTarget ? "external" : "internal", title: "플랫폼 엔지니어", companyName: "아틀라스", feedback: scenario.event?.decision ?? null, feedbackAt: scenario.event ? fixture.requestTime : null, feedbackReason: scenario.event?.reason ?? null, isAccepted: scenario.event?.decision === "positive" && !scenario.externalTarget, savedStage: scenario.event?.decision === "positive" && !scenario.externalTarget ? "connected" : null, isExpired: false, acceptanceMaterial: scenario.event?.decision === "positive" && !scenario.externalTarget ? { materialId: state.assignments.at(-1)?.id, assignmentRevision: state.assignments.at(-1)?.revision } : undefined, internalProgress: scenario.event?.decision === "positive" && !scenario.externalTarget ? { code: scenario.event.intro ? "company_shared" : "accepted", message: scenario.event.intro ? "소개 이메일 발송 영수증이 확인됨. 회사 열람/답변은 없음." : "소개 수락 저장. 회사 전달 영수증은 아직 없음." } : null };
        const feedbackInstruction = scenario.event ? [buildCareerOpportunityFeedbackFollowUpTurnInstruction({ preferredLocale: "ko", trigger: scenario.event.source === "internal" ? "immediate_internal_feedback" : scenario.event.allCleared ? "all_recommended_opportunities_cleared" : "delayed_external_feedback" }), formatOpportunityFeedbackPromptContext([{ eventId: "saved-event-1", createdAt: fixture.requestTime, action: scenario.event.decision, summary: `Saved ${scenario.event.source} opportunity ${ids.recommendation} decision ${scenario.event.decision}.${scenario.event.reason ? ` User reason: ${scenario.event.reason}` : " No reason supplied."}` }]), formatSavedOpportunityDecision(savedOpportunity)] : [];
        const snapshot: any = { talentUser: { name: "윤서", headline: "Platform Engineer", bio: "6년차 플랫폼 엔지니어. Kubernetes 운영과 배포 자동화를 담당했다.", location: "서울", resume_links: [] }, talentExperiences: [{ id: 501, role: "Platform Engineer", company_name: "Orbit Example", start_date: "2020-03-01", end_date: null, description: "Kubernetes 클러스터 운영, 배포 자동화 담당. 팀 리드 경험이나 인원 수는 확인되지 않았다." }], talentEducations: [{ id: 601, school: "예시대학교", degree: "컴퓨터공학 학사", start_date: "2013-03-01", end_date: "2017-02-01" }], talentExtras: [] };
        const profiles: any[] = [
          { profileId: ids.profile, title: "기본 프로필", revision: 4, isDefault: true, snapshot: clone(snapshot) },
          { profileId: ids.tailored, title: "플랫폼용", purpose: "플랫폼 직무 지원", revision: 2, isDefault: false, snapshot: { ...clone(snapshot), talentUser: { ...snapshot.talentUser, bio: "SLO 설계와 장애 대응 개선을 수행한 플랫폼 엔지니어." } } },
        ];
        const schedule: any = { id: ids.schedule, title: "주간 커리어 점검", instruction: "새로운 기회와 진행 상황을 확인하고 유용할 때만 연락한다.", talent_id: ids.user, conversation_id: null, target_refs: {}, timezone: "Asia/Seoul", next_run_at: "2026-11-02T00:00:00Z", recurrence: "0 9 * * 1", status: "active", revision: 2, directive_revision: 1, last_run_id: null };
        if (scenario.dueOnce) { schedule.recurrence = null; schedule.next_run_at = null; }
        if (scenario.daily) { schedule.recurrence = "0 9 * * *"; schedule.next_run_at = "2026-10-31T00:00:00Z"; }
        const follow: any = { id: ids.follow, talent_id: ids.user, company_db_id: 101, company_workspace_id: ids.workspace, scope: "workspace", instruction: "플랫폼 채용 공고", revision: 2, company: { name: "아틀라스" }, workspace: { company_name: "Atlas Platform" }, followed_at: fixture.requestTime, unfollowed_at: null, scan_state: {} };
        const frozenMatchings: any[] = [{ id: ids.matching, title: "서울 플랫폼 엔지니어", revision: 1, criteria: { brief: clone(state.brief), scope: "external roles" } }];
        const matching = (matchingId = state.matchingId) => clone(frozenMatchings.find(m => m.id === matchingId));
        const evaluation = (runId = ids.run, source?: "external" | "internal") => (background && !scenario.availableUnpublishedEvaluation ? { runId, source: source ?? "external", status: "completed", roleIds: [], evaluations: [], failures: [], listRevision: state.revision } : { runId, source: source ?? (background && scenario.id === "background_follow" ? "internal" : "external"), status: scenario.id.includes("partial") ? "partial" : "completed", roleIds: [scenario.id === "background_follow" ? ids.role : ids.external], evaluations: [{ id: ids.evaluation, role_id: scenario.id === "background_follow" ? ids.role : ids.external, stage: scenario.id === "background_follow" ? 2 : undefined, assessment: { fit: { mutualFit: 88, roleFit: 87 }, decision: "Useful platform engineering match.", evidence: "Kubernetes ownership and SLO experience align; no company introduction accepted." }, evaluated_at: fixture.requestTime, role: { name: "플랫폼 엔지니어", company_workspace: { company_name: "아틀라스" } } }], failures: scenario.id.includes("partial") ? [{ roleId: ids.failed, error: "Source unavailable; not assessed." }] : [], listRevision: state.revision });
        const resourceContext = () => [
          ...feedbackInstruction,
          scenario.scenarioContext ?? "",
          scenario.formalRecommendation ? formatSavedOpportunityDecision(savedOpportunity) : "",
          `Search Brief:\n${state.brief.map((b: any) => `[${b.ref}] ${b.label}: ${b.content}`).join("\n")}`,
          `Profiles: 기본 프로필 ${ids.profile} revision 4 (default); 플랫폼용 ${ids.tailored} revision 2 (history 1,2). Full rows through read_profile.`,
          `Document index: 프로젝트 설명서 documentId=${ids.doc}, revision=3; owned Markdown document with SLO examples.`,
          scenario.id === "company_ambiguous" ? "No company has been selected in this conversation. Company name identity has not been resolved." : `Role index: 아틀라스 플랫폼 엔지니어 internal Role ${ids.role}; external Role ${ids.external}. ${savedOpportunity.isAccepted ? "The saved acceptance below is authoritative." : "No company sharing has been accepted."}`,
          `Matching index: ${ids.matching}, 서울 플랫폼 엔지니어; frozen Brief is the original Seoul criteria. ${scenario.availableUnpublishedEvaluation ? `Last evaluation run ${ids.run}; ${scenario.id.includes("partial") ? "partial" : "completed"}; unpublished evidence available.` : "No evaluation results or runs await review; no new roles."} ${scenario.existingTargetDecision === "dislike_connected" ? `Existing previous recommendation ${ids.oldRecommendation} now resolves to current Intro recommendation ${ids.recommendation}, feedback=dislike; saved_stage=connected.` : scenario.formalRecommendation ? `Current recommendation ${ids.recommendation}; role ${savedOpportunity.roleId}; feedback ${savedOpportunity.feedback ?? "none"}; internal acceptance ${savedOpportunity.isAccepted}.` : "The target Role has not been recommended, saved, rejected, applied to or shared before."}`,
          `Schedules:\n${formatCareerSchedules([schedule])}\nSeparate project retrospective schedule exists and is unrelated.`,
          !scenario.hasExistingFollow ? "No company follows are saved." : `Follows: ${ids.follow}, revision 2, Atlas Platform workspace ${ids.workspace}, companyId 101; follows stored job postings only.`,
          background ? renderCareerBackgroundInvocation({ id: id(99), talent_id: ids.user, conversation_id: id(98), status: "handed_off", trigger: scenario.id === "background_follow" ? "company_follow" : "career_schedule", created_at: fixture.requestTime, trigger_payload: { instruction: scenario.message, purpose: scenario.id === "background_quiet" ? "No new roles, company changes, unread requests, or pending work. Existing weekly check remains scheduled." : undefined, ...(scenario.id === "background_follow" || scenario.id === "background_partial" ? { evaluationId: ids.run, roleIds: [scenario.id === "background_follow" ? ids.role : ids.external], evaluationEvidence: { source: scenario.id === "background_follow" ? "internal" : "external", evaluationIds: [ids.evaluation] } } : {}), sourceEvents: [{ sourceKind: "schedule", sourceId: ids.schedule, revision: 2, instruction: scenario.message, targetRefs: {} }] } }) : "",
          scenario.id === "background_changed" ? "Prepared email exists with delivery ID email-1, status context_changed. A previous transport attempt failed; no provider receipt is stored. Read it and decide from current user context." : "",
        ].filter(Boolean).join("\n\n");
        const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: scenario.id === "schedule_dst" ? "en" : "ko", background, hasActiveGmailIntegration: false });
        const validators = new Map(selected.tools.map(t => [t.function.name, ajv.compile(t.function.parameters)]));
        const executeTool = async ({ name, input }: { name: string; input: Record<string, unknown> }) => {
          const entry: any = { name, input: clone(input) }; calls.push(entry);
          try {
            const validate = validators.get(name); assert.ok(validate, `No production schema: ${name}`);
            if (!validate(input)) throw new Error(`Tool input contract: ${ajv.errorsText(validate.errors)}`);
            const { _uiStatusMessage, ...args } = input as any;
            let raw: any = {}, modelOutput = "";
            if (name === "list_profiles") {
              raw = { profiles: profiles.map(p => ({ id: p.profileId, title: p.title, current_revision: p.revision, is_default: p.isDefault, purpose: p.purpose, updated_at: fixture.requestTime })), nextCursor: null }; modelOutput = formatProfileToolResult(name, raw);
            } else if (name === "read_profile") {
              const p = profiles.find(p => p.profileId === (args.profileId ?? ids.profile)); assert.ok(p, "Profile unavailable"); raw = clone(p);
              if (args.revision === 1 && p.profileId === ids.tailored) { raw.revision = 1; raw.snapshot = clone(snapshot); }
              raw.history = [{ revision: 2, created_at: fixture.requestTime }, { revision: 1, created_at: "2026-10-20T01:00:00Z" }]; raw.nextHistoryCursor = null;
              if (args.compareRevision === 1) raw.comparison = { ...clone(p), revision: 1, snapshot: clone(snapshot) };
              modelOutput = formatProfileToolResult(name, raw);
            } else if (name === "update_talent_profile") {
              const p = profiles.find(p => p.profileId === (args.profileId ?? ids.profile)); assert.ok(p, "Profile unavailable");
              if (args.expectedRevision !== undefined) assert.equal(args.expectedRevision, p.revision, "Profile revision conflict");
              const next = { ...clone(p), title: args.title ?? p.title, purpose: args.purpose ?? p.purpose, snapshot: applyProfileEdits(p.snapshot, args, `evaluation:${calls.length}`) };
              if (["copy", "create"].includes(args.action)) { next.profileId = ids.copy; next.revision = 1; next.isDefault = false; profiles.push(next); } else { next.revision++; Object.assign(p, next); }
              state.profileWrites.push(clone(args)); raw = next; modelOutput = formatProfileToolResult(name, raw);
            } else if (name === "assign_to_role") {
              assert.equal(args.roleId, ids.role);
              if (args.action === "read") raw = { current: state.assignments.at(-1) ?? null, acceptedMaterials: savedOpportunity.isAccepted ? [{ id: ids.recommendation, shared_material_id: state.assignments.at(-1)?.id, feedback: "like", saved_stage: "connected" }] : [] };
              else { assert.equal(args.expectedRevision, 0, "Read assignment revision before writing"); const material = { id: id(101), role_id: ids.role, revision: 1, action: args.action, profile_id: args.profileId, profile_revision: args.profileRevision, documents: (args.documents ?? []).map((d: any) => ({ id: d.documentId, revision: d.revision, file_name: "프로젝트 설명서", storage_path: "synthetic-only" })) }; state.assignments.push(material); raw = material; }
              modelOutput = formatInternalApplicationToolResult(name, raw);
            } else if (name === "apply_to_internal_role") {
              assert.equal(args.roleId, ids.role);
              if (scenario.id === "closed_role") { raw = { status: "unavailable", error: "internal_role_unavailable" }; modelOutput = "This internal Role is closed. No evaluation, review recommendation, acceptance or company sharing was created."; }
              else { state.formalRecommendation = true; raw = { runId: ids.run, source: "internal", status: "completed", roleIds: [ids.role], evaluatedProfile: { profileId: ids.profile, revision: 4 }, coverage: { recommendations: [{ recommendationId: ids.recommendation, roleId: ids.role, created: true, feedback: null, savedStage: null }] }, evaluations: [{ id: ids.evaluation, role_id: ids.role, stage: 2, assessment: { fit: { candidateFit: 42, companyFit: 36, mutualFit: 39 }, criteria: [{ name: "Ownership", label: "uncertain", criterionDefinition: "Company-private: evidence of independently owning platform reliability and coordinating others; do not quote private employer text." }] }, evaluated_at: fixture.requestTime }], companyShared: false }; modelOutput = formatInternalApplicationToolResult(name, raw); }
            } else if (name === "get_role_context" || name === "get_internal_roles") {
              if (name === "get_internal_roles" && background && !scenario.availableUnpublishedEvaluation) {
                modelOutput = "No unpresented reviewed or newly available internal roles. Shared source scan is unchanged. No next cursor.";
                entry.result = { modelOutput }; return withTalentToolAssistantInstruction(entry.result);
              }
              const requested = args.roleIds ?? (name === "get_internal_roles" ? [ids.role] : [ids.role, ids.external]);
              modelOutput = [requested.includes(ids.role) ? `Role ${ids.role}: 아틀라스 플랫폼 엔지니어; internal; ${scenario.id === "closed_role" ? "closed" : "active"}. Public JD: Kubernetes/SLO ownership; 8 years preferred, leadership helpful. Current candidate has 6 years. Private employer details are reasoning-only, never quote them. ${savedOpportunity.isAccepted ? "Introduction already accepted." : "No introduction accepted."} Project and leadership scope can be clarified from the candidate's actual experience.` : "", requested.includes(ids.external) ? `External role ${ids.external}: 아틀라스 플랫폼 엔지니어; active; 서울; base salary 1억; public requirements Kubernetes/SLO. Onsite frequency and years-of-experience requirements are not supplied.` : "", "No further page."].filter(Boolean).join("\n");
            } else if (name === "read_document" || name === "list_documents") {
              modelOutput = `Document ${ids.doc}; revision 3; 프로젝트 설명서. User-authored evidence: 서비스 SLO를 정의하고 장애 대응 runbook을 개선했다. 팀 규모/리드 인원은 미기재. No rendered attachment has been sent.`;
            } else if (name === "read_recommended_opportunities") {
              modelOutput = state.formalRecommendation ? formatSavedOpportunityDecision(savedOpportunity) : scenario.existingTargetDecision === "dislike_connected" ? `Current recommendation ${ids.recommendation}; internal Role ${ids.role}; 아틀라스 플랫폼 엔지니어; feedback dislike; saved stage connected. Supersedes historical ${ids.oldRecommendation}. Existing decision remains. No other results.` : state.memberships.length ? `Recommendation ${ids.recommendation}; Role ${state.memberships.at(-1).items?.[0]?.roleId ?? ids.external}; current; feedback none. Career URL https://matchharper.com/career/history?historyTab=new&id=${state.memberships.at(-1).items?.[0]?.roleId ?? ids.external}. No further page.` : "No existing recommendations for this role. No next cursor.";
            } else if (name === "read_company_connections") {
              const connections = savedOpportunity.isAccepted && scenario.event?.intro ? [{
                companyName: savedOpportunity.companyName, roleName: savedOpportunity.title,
                connectionId: `recommendation:${ids.recommendation}`, recommendationId: ids.recommendation,
                origin: "company_request_intro" as const, positionState: "소개 이메일 발송 후 회사와 대화 가능",
                establishedAt: "2026-10-30 16:00", latestCompanyContactAt: null,
                latestRelayAt: null, latestRelayStatus: null, recentContacts: [],
              }] : [];
              raw = { ok: true };
              modelOutput = formatRelayableCompanyTalentConnections(connections);
            } else if (name === "update_recommended_opportunity_feedback") {
              assert.ok(state.formalRecommendation, "No formal recommendation exists");
              assert.ok(args.opportunityId === ids.recommendation || args.roleId === savedOpportunity.roleId, "Decision needs exact recommendation/role");
              assert.ok(!scenario.event, "A saved button decision must not be executed again");
              if (scenario.expectedFeedback) assert.equal(args.feedback, scenario.expectedFeedback);
              if (["accept_short", "accept_assigned", "external_save_yes"].includes(scenario.id)) assert.equal(args.feedback, "like");
              if (args.materialId !== undefined) { assert.equal(args.materialId, state.assignments.at(-1)?.id ?? null); assert.equal(args.assignmentRevision, state.assignments.at(-1)?.revision ?? 0); }
              state.decisions.push(clone(args)); savedOpportunity.feedback = args.feedback === "like" ? "positive" : args.feedback === "dislike" ? "negative" : "keep";
              savedOpportunity.isAccepted = !scenario.externalTarget && args.feedback === "like";
              state.acceptedMaterial = savedOpportunity.isAccepted ? clone(state.assignments.at(-1) ?? { profile_id: ids.profile, profile_revision: 4 }) : null;
              raw = { ok: true, feedback: args.feedback, accepted: savedOpportunity.isAccepted, companyShared: false, opportunity: { id: ids.recommendation, roleId: savedOpportunity.roleId, sourceType: savedOpportunity.sourceType, feedback: savedOpportunity.feedback } };
              modelOutput = formatOpportunityDecisionReceipt({ opportunity: savedOpportunity, feedback: args.feedback, companyShared: false, updatedAt: fixture.requestTime });
            } else if (name === "suggest_form") {
              if (args.action === "create") { const form = { ...careerFormDraftSchema.parse(args.form), formId: state.forms.length + 1, revision: 1 }; state.forms.push(form); raw = form; }
              else raw = state.forms.find((f: any) => f.formId === args.formId) ?? { forms: state.forms };
              modelOutput = raw.formId ? formatCareerFormForModel(raw) : "No saved forms.";
            } else if (name === "read_talent_activity_events") { modelOutput = scenario.scenarioContext || "No prior contact, recommendation delivery, or application activity events. No next cursor.";
            } else if (name === "read_talent_context") { modelOutput = `Search Brief:\n${state.brief.map((b: any) => `[${b.ref}] ${b.label}: ${b.content}`).join("\n")}\nMemory: no additional confirmed preference. No next cursor.`;
            } else if (name === "write_talent_context") {
              state.contextWrites.push(clone(args));
              for (const change of args.changes) { const at = state.brief.findIndex((b: any) => b.ref === change.ref); if (change.op === "update" && at >= 0) state.brief[at] = { ...state.brief[at], ...change }; else if (change.op === "add" && change.collection === "brief") state.brief.push({ ...change, ref: state.brief.length + 1 }); else if (change.op === "delete" && at >= 0) state.brief.splice(at, 1); }
              modelOutput = `Saved context changes. Current Brief:\n${state.brief.map((b: any) => `[${b.ref}] ${b.label}: ${b.content}`).join("\n")}`;
            } else if (name === "update_setting") { state.settingWrites.push(args); modelOutput = `Setting applied: ${args.action}. stop_external changes only external recommendation delivery; explicit schedules and internal introductions are preserved.`;
            } else if (name === "search_companies") {
              raw = { companies: scenario.id === "company_ambiguous" ? [
                { companyDbId: 101, companyWorkspaceId: null, name: "아틀라스 (소프트웨어)", scope: "company", website: "https://atlas-software.example", linkedin: null },
                { companyDbId: 102, companyWorkspaceId: null, name: "아틀라스 (바이오)", scope: "company", website: "https://atlas-biotech.example", linkedin: null },
              ] : [{ companyDbId: 101, companyWorkspaceId: ids.workspace, name: "Atlas Platform", scope: "workspace", website: "https://atlas-platform.example", linkedin: "https://www.linkedin.com/company/atlas-platform/" }], nextOffset: null };
              modelOutput = formatCompanySearch(raw.companies, null);
            } else if (name === "web_search") {
              modelOutput = "Public news source: Atlas newsroom https://atlas-platform.example/news . No new announcements since the last shared check. Following stored company roles does not include public news; a separate general schedule can periodically check this public URL.";
            } else if (name === "open_url") {
              const pages: Record<string, string> = {
                "https://www.linkedin.com/company/atlas-platform/": "Atlas Platform company page. Software and platform infrastructure. Official website: https://atlas-platform.example . This page provides company identity; it does not contain an application form or submission destination.",
                "https://atlas-platform.example/news": "Atlas Platform newsroom. No new announcements since the last shared check. This page has no careers link, application form or recruiting contact.",
                "https://atlas-platform.example": "Atlas Platform official company site. Public newsroom: https://atlas-platform.example/news . No application URL or recruiting contact is supplied in this captured page.",
              };
              modelOutput = `Page ${args.url}\n${pages[args.url] ?? "No captured page is available for this URL. Page content and application destination remain unverified."}`;
            } else if (name === "follow_company" && args.action === "list") { modelOutput = formatCompanyFollows(scenario.hasExistingFollow || state.followWrites.length ? [follow] : []);
            } else if (name === "follow_company") { state.followWrites.push(args); raw = { ...follow, ...args, revision: follow.revision + 1, unfollowed_at: args.action === "unfollow" ? fixture.requestTime : null }; Object.assign(follow, raw); modelOutput = formatCompanyFollows([raw]);
            } else if (name === "list_schedules" || name === "read_schedule") { modelOutput = formatCareerSchedules([schedule]);
            } else if (name === "upsert_schedule") {
              if (args.action !== "create") { assert.equal(args.schedule_id, ids.schedule); assert.equal(args.expected_revision, schedule.revision); }
              state.scheduleWrites.push(args); Object.assign(schedule, args, { id: args.action === "create" ? id(72) : ids.schedule, revision: schedule.revision + 1 }); modelOutput = `Schedule saved.\n${formatCareerSchedules([schedule])}`;
            } else if (name === "list_matchings") { raw = { matchings: clone(frozenMatchings), defaultListRevision: state.revision, allListsRevision: state.revision, nextCursor: null }; modelOutput = formatCareerMatchingResult(raw);
            } else if (name === "read_matching") { raw = { matching: matching(args.matchingId), currentBrief: state.brief, listRevision: state.revision, memberships: scenario.existingTargetDecision === "dislike_connected" ? [{ recommendation_id: ids.recommendation, original_recommendation_id: ids.oldRecommendation, role_id: ids.role, archived_at: fixture.requestTime, recommendation: { feedback: "dislike", saved_stage: "connected" }, role: { name: "아틀라스 Platform" } }] : [], runs: !scenario.availableUnpublishedEvaluation ? [] : [{ id: ids.run, status: evaluation().status, candidate_role_ids: [ids.external, ids.failed], evaluation_ids: [ids.evaluation], created_at: fixture.requestTime }], evaluations: scenario.availableUnpublishedEvaluation ? evaluation().evaluations : [] }; modelOutput = formatCareerMatchingResult(raw);
            } else if (name === "upsert_matching") { assert.equal(args.action, "create"); state.matchingId = ids.newMatching; state.createdMatching = clone(args); frozenMatchings.push({ id: ids.newMatching, revision: 1, title: args.title, criteria: clone(args.criteria) }); raw = { matching: matching(), listRevision: state.revision }; modelOutput = formatCareerMatchingResult(raw);
            } else if (name === "search_opportunities") {
              if (args.action === "search" || (!args.runId && !args.action)) { assert.equal(args.matchingId, state.matchingId, "External search uses selected matching"); if (scenario.id === "same_search" && !state.queued) { state.queued = true; raw = { runId: id(62), source: "external", status: "queued", careerContinuation: { kind: "external_evaluation", id: id(62) } }; } else raw = evaluation(undefined, args.source); }
              else { assert.ok(args.runId === ids.run || (scenario.id === "same_search" && args.runId === id(62)), "Read an existing evaluation run"); raw = evaluation(args.runId, args.source); }
              modelOutput = formatCareerMatchingResult(raw);
            } else if (name === "upsert_opportunities") {
              if (scenario.id === "restore_conflict" && !state.conflictInjected) { state.conflictInjected = true; state.revision = "list-2"; throw new Error("List changed; read its current revision"); }
              assert.equal(args.expectedRevision, state.revision, "Current list revision required");
              for (const item of args.items ?? []) { assert.ok(item.roleId || item.recommendationId, "An exact roleId or recommendationId is required"); if (item.roleId === ids.role && !item.recommendationId && scenario.existingTargetDecision !== "dislike_connected") { assert.deepEqual(item.evaluationIds, [ids.evaluation], "Internal publication requires evaluationIds"); assert.equal(item.sourceRunId, ids.run); } if (item.roleId) assert.ok([ids.role, ids.external].includes(item.roleId)); if (item.evaluationId) assert.equal(item.evaluationId, ids.evaluation); }
              state.memberships.push(args); state.revision = `list-${state.memberships.length + 3}`; raw = { action: args.action, recommendationIds: args.action === "reset" ? [] : [ids.recommendation], listRevision: state.revision }; modelOutput = formatCareerMatchingResult(raw);
            } else if (name === "deliver_career_email") {
              const receipt: any = { id: "email-1", status: "context_changed", payload: { emailPayload: { subject: "추천 공고" }, bodyMarkdown: "원래 준비한 메일 본문" } };
              if (scenario.id === "background_changed") { state.emailContextChanged = true; if (args.action === "cancel") receipt.status = "cancelled"; modelOutput = `${formatCareerEmailReceipt(receipt)}\nNew actual user message 2026-10-30 16:01: 이번 달은 이메일을 보내지 마. 다음 달에 다시 판단해줘. No new attempt was sent.`; raw = { status: receipt.status }; }
              else if (args.action === "read") modelOutput = "This invocation has no prepared email.";
              else if (args.action === "cancel") modelOutput = "No pending email to cancel.";
              else { state.emails.push(args); raw = { status: "sent", deliveryId: "email-1" }; modelOutput = formatCareerEmailReceipt({ ...receipt, status: "sent", sent_at: fixture.requestTime, payload: { resendEmailId: "synthetic-receipt", emailPayload: { subject: args.subject }, bodyMarkdown: args.body } }); }
            } else throw new Error(`Synthetic executor not configured for ${name}`);
            entry.result = { ...raw, modelOutput };
            return withTalentToolAssistantInstruction(entry.result);
          } catch (error) { entry.error = error instanceof Error ? error.message : String(error); throw error; }
        };
        const start = Date.now();
        let reply = "", failure: string | undefined;
        const signal = AbortSignal.timeout(300_000);
        const options: any = { mode: "progressive", replyId: `eval:${scenario.id}`, eligibleTools: selected.tools, preloads: background ? ["schedules", "career_delivery"] : [], selection: background ? { handbookIds: ["proactive_career"], capabilityIds: [] } : undefined, abortSignal: signal, continuation: background ? { channel: "background", backgroundRunId: id(99), sourceMessageCursor: 1 } : { channel: "career", sourceMessageId: 1 }, checkpoint: async (checkpoint: any) => { checkpoints.push(checkpoint); }, promptArgs: () => ({ channel: "chat", backgroundInvocation: background, isOnboardingDone: true, profile: null, structuredProfileText: "윤서, 6년차 플랫폼 엔지니어. Kubernetes 운영·배포 자동화. 세부 경력은 read_profile로 조회 가능.", talentContextSection: resourceContext(), requestTime: new Date(fixture.requestTime), timeZone: "Asia/Seoul", currentPreferences: { preferredLocale: scenario.id === "schedule_dst" ? "en" : "ko", talentSettingStatus: "active", getExternalRecommendation: true, getInternalRecommendation: true } }) };
        try {
          let runtime = new CareerCapabilityRuntime(options);
          for (;;) {
            const step = runtime.resolveStep(false);
            try { reply = await runCareerChatAssistant({ primaryModel: modelConfig.model, chatCompletionReasoningEffort: modelConfig.chatCompletionReasoningEffort, openAIResponsesReasoningEffort: modelConfig.openAIResponsesReasoningEffort, responseLocale: scenario.id === "schedule_dst" ? "en" : "ko", messages: [...(scenario.history ?? []), ...(scenario.mode === "chat" ? [{ role: "user", content: scenario.message }] : scenario.mode === "feedback" ? [{ role: "user", content: "Continue the user's delegated work using the new execution result supplied in the runtime context." }] : [])], tools: step.tools, systemBlocks: step.systemBlocks, toolRuntime: runtime, abortSignal: signal, usageLabel: `eval/career-agentic-runtime/${scenario.id}`, executeTool }); break; }
            catch (error) { if (!(error instanceof CareerReplyContinuation)) throw error; assert.ok(!state.childReady, "Unexpected repeated synthetic child wait"); state.childReady = true; runtime = new CareerCapabilityRuntime({ ...options, resume: error.checkpoint }); }
          }
        } catch (error) { failure = error instanceof Error ? error.message : String(error); }
        const expected = gold.cases.find((g: any) => g.id === scenario.id);
        for (const name of expected.requiredTools) if (!calls.some(c => c.name === name && !c.error)) errors.push(`Required successful tool missing: ${name}`);
        for (const alternatives of expected.requiredAnyTools ?? []) if (!calls.some(c => alternatives.includes(c.name) && !c.error)) errors.push(`Required successful read missing: ${alternatives.join(" or ")}`);
        for (const name of expected.forbiddenTools) if (calls.some(c => c.name === name)) errors.push(`Forbidden tool called: ${name}`);
        for (const boundary of expected.forbiddenActions ?? []) if (calls.some(c => c.name === boundary.tool && boundary.actions.includes(c.input.action))) errors.push(`Forbidden mutation: ${boundary.tool}`);
        if (failure) errors.push(failure);
        for (const call of calls) if (call.error?.startsWith("Synthetic executor not configured for ")) errors.push(call.error);
        if (scenario.id === "profile_copy" && (profiles[0].snapshot.talentUser.headline !== snapshot.talentUser.headline || !profiles.some(p => p.profileId === ids.copy && p.snapshot.talentUser.headline === "Platform Engineer / Infra"))) errors.push("Copy/original preservation failed");
        if (scenario.id === "role_materials" && !state.assignments.some((m: any) => m.profile_id === ids.tailored && m.profile_revision === 2 && m.documents.some((d: any) => d.id === ids.doc && d.revision === 3))) errors.push("Exact assignment missing");
        if (scenario.id === "company_workspace" && !state.followWrites.some((f: any) => f.scope === "workspace" && f.company_workspace_id === ids.workspace)) errors.push("Exact workspace follow missing");
        if (scenario.id === "unfollow" && !state.followWrites.some((f: any) => f.action === "unfollow" && f.follow_id === ids.follow)) errors.push("Unfollow missing");
        if (scenario.id === "schedule_dst" && !state.scheduleWrites.some((s: any) => s.timezone === "America/New_York" && new Date(s.next_run_at).toISOString() === "2026-11-02T14:00:00.000Z" && s.recurrence)) errors.push("DST next occurrence/timezone missing");
        if (scenario.id === "schedule_change" && !state.scheduleWrites.some((s: any) => s.action === "update" && s.recurrence === null && new Date(s.next_run_at).toISOString() === "2026-11-13T06:00:00.000Z")) errors.push("Existing one-time schedule change missing");
        if (scenario.id === "stop_external" && !state.settingWrites.some((s: any) => s.action === "stop_external")) errors.push("External-only stop missing");
        if (scenario.id === "reset_current" && !state.memberships.some((m: any) => m.action === "reset" && m.allLists === true)) errors.push("All current lists not reset");
        
        if (scenario.id === "background_changed" && state.emails.length) errors.push("Email sent despite latest stop instruction");
        const result = { history: scenario.history ?? [], event: scenario.event ?? null, caseId: scenario.id, mode: scenario.mode, model: modelConfig.model, user: scenario.message, elapsedMs: Date.now() - start, calls, reply, state, checkpointCount: checkpoints.length, structuralErrors: errors, manualReview: "pending" };
        save(scenario.id, result); save(`${scenario.id}-checkpoints`, checkpoints);
        process.stdout.write(JSON.stringify({ caseId: scenario.id, model: modelConfig.model, elapsedMs: result.elapsedMs, toolCalls: calls.length, structuralErrors: errors }) + "\n");
        return result;
      });
    };
    const results: any[] = [];
    let index = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (index < cases.length) results.push(await runCase(cases[index++])); }));
    save("results", results); save("requests", requests); save("blocked-network", blocked);
    save("summary", { cases: results.length, structuralPass: results.filter(r => !r.structuralErrors.length).length, manualReview: "pending", requests: requests.length, models: [...new Set(requests.map(r => r.model))], partial: Boolean(only), datasetVersion: "v10" });
    process.stdout.write(`Artifacts: ${dir}\n`);
    if (results.some(r => r.structuralErrors.length)) process.exitCode = 1;
  } finally {
    save("requests", requests); save("blocked-network", blocked);
    globalThis.fetch = originalFetch;
    Object.assign(console, originalConsole);
  }
}

main().catch(error => { process.stderr.write(String(error instanceof Error ? error.stack : error) + "\n"); process.exitCode = 1; });
