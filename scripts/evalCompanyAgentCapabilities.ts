/** Actual production model loop + isolated synthetic tool adapter. NOT delivery E2E. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { normalizeInterviewDuration, buildMeetingRequestIdempotencyKey } from "../src/lib/meetings/scheduleDraft";
import { prepareDirectCandidateMessage } from "../src/lib/companyTalentRequests/directMessage";
import { parseCompanyDataChanges, resolveCompanyDataMutation } from "../src/lib/org/agent/companyDataMutation";
import { companyDataTargetKey } from "../src/lib/org/agent/companyDataCatalog";
import { humanizeOrgRoleStatus, humanizeOrgWorkMode, humanizeOrgEmploymentType } from "../src/lib/org/pipelineStage";
import type { OrgAgentLoopDependencies } from "../src/lib/org/agent/chat";
import type { OrgAgentConversationInput } from "../src/lib/org/agent/conversationInput";
import { WorkspaceBillingError } from "../src/lib/org/billing/types";
import { readFrozenDataset, evaluateContactLifecycle, fixtureRoleName, evaluationExecutionComplete, createEvaluationReadAdmin } from "./lib/companyAgentEvaluationContract";

async function main() {
const root = path.resolve(__dirname, "..");
const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
const sha = (x: string | Buffer) => createHash("sha256").update(x).digest("hex");
const version = process.argv.find((v) => v.startsWith("--dataset="))?.split("=")[1] ?? "v6";
if (!/^v[1-9][0-9]*$/.test(version)) throw Error("Invalid dataset version");
const frozen = JSON.parse(readFileSync(path.join(task, `manifest-${version}.json`), "utf8"));
for (const [file, hash] of Object.entries(frozen.files)) {
  if (sha(readFileSync(path.join(task, file))) !== hash) throw Error(`Frozen input changed: ${file}. Create a new dataset version.`);
}
const dataset = readFrozenDataset(task, `cases-${version}.json`, frozen.files);
const option = (name: string) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const mode = option("mode") ?? "progressive";
const streaming = option("stream") === "true";
const copyMode = option("copy") ?? "synthetic";
const responseLocale = option("response-locale") ?? null;
if (responseLocale !== null && responseLocale !== "ko" && responseLocale !== "en") {
  throw Error("response-locale must be ko or en");
}
if (!["synthetic", "real"].includes(copyMode)) throw Error("copy must be synthetic or real");
if (mode !== "full" && mode !== "progressive") throw Error("mode must be full or progressive");
const runId = option("run") ?? `${new Date().toISOString().replaceAll(":", "-")}-${mode}`;
if (!/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Invalid run ID");
const runDir = path.join(task, "runs", runId);
// Never overwrite a previous run, including a partial or failed run.
mkdirSync(runDir, { mode: 0o700 });
chmodSync(runDir, 0o700);
const save = (file: string, value: unknown) => writeFileSync(path.join(runDir, file), JSON.stringify(value, null, 2), { mode: 0o600 });
config({ path: path.join(root, ".env.local"), quiet: true });
process.env.OPENAI_API_KEY ||= "unused-by-gemini-evaluation";
process.env.ORG_AGENT_CAPABILITY_MODE = mode;
if (!process.env.OPENROUTER_API_KEY) throw Error("OPENROUTER_API_KEY required");
const realFetch = globalThis.fetch;
let providerCallSequence = 0;
const providerCaptures: Promise<void>[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const allowed = copyMode === "real" ? ["openrouter.ai", "api.anthropic.com", "api.openai.com"] : ["openrouter.ai"];
  if (!allowed.includes(url.hostname)) throw Error(`Evaluation network blocked: ${url.hostname}`);
  // Keep secondary writer calls as evidence too, without request headers/keys.
  // A syntactically valid body is not automatically a semantically valid email.
  const sequence = ++providerCallSequence;
  const startedAt = new Date().toISOString();
  const request = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  try {
    const response = await realFetch(input, init);
    // Capture alongside consumption; awaiting the clone here buffers SSE and
    // invalidates time-to-first-text measurements.
    providerCaptures.push(response.clone().text().then((raw) => {
      save(`provider-${sequence}.json`, { endpoint: `${url.origin}${url.pathname}`, startedAt, request, status: response.status, response: raw });
    }).catch((error) => {
      save(`provider-${sequence}.json`, { endpoint: `${url.origin}${url.pathname}`, startedAt, request, status: response.status, error: String(error) });
    }));
    return response;
  } catch (error) {
    save(`provider-${sequence}.json`, { endpoint: `${url.origin}${url.pathname}`, startedAt, request, error: String(error) });
    throw error;
  }
}) as typeof fetch;
// A throwing adapter is also passed below. No production executor or DB read
// is reachable through the synthetic path.
const { runOrgAgentToolLoop, runOrgAgentCompletion, appendRequiredPresentations } = await import("../src/lib/org/agent/chat");
const { ORG_AGENT_GEMINI_FLASH_MODEL, isOrgAgentModelId, getOrgAgentReasoningEffort } = await import("../src/lib/org/agent/modelConfig");
const evaluationModel = option("model") ?? ORG_AGENT_GEMINI_FLASH_MODEL;
if (!isOrgAgentModelId(evaluationModel) || !evaluationModel.includes("/")) {
  throw Error("A supported OpenRouter company-side model is required");
}
const { conversationCompatibilityText } = await import("../src/lib/org/agent/conversationInput");
const { parseOrgAgentContactRef } = await import("../src/lib/org/agent/contacts");
const copy = copyMode === "real" ? await import("../src/lib/companyTalentRequests/copy") : null;
const { candidateContactWritingEvidence } = await import("../src/lib/companyTalentRequests/writingEvidence");
const { enforceOrgAgentReplyInvariants, getOrgAgentRequiredPresentationTexts, selectRecentlyPresentedContactDraftReferences, captureOrgAgentContactDraftState } = await import("../src/lib/org/agent/toolState");
const { readMatchingRunHistory } = await import("../src/lib/companyFirstSearch/history");
const { formatMatchingRunHistory } = await import("../src/lib/org/agent/promptFormat");
const { executeOrgAgentTool } = await import("../src/lib/org/agent/toolExecution");
const { buildCompanyIntroTalentRead } = await import("../src/lib/org/agent/data");
const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/lib/org/agent", "src/lib/org/slackMemberAccess.ts", "src/lib/companyFirstSearch/history.ts", "src/lib/companyTalentRequests", "src/lib/serviceAnswerExamples.ts", "src/lib/serviceAnswerExampleCache.ts", "src/lib/org/serviceFaq.ts", "src/lib/llm", "src/i18n/org", "src/app/api/internal/org-agent/slack-turn/route.ts", "src/app/api/org/locale/route.ts", "scripts/evalCompanyAgentCapabilities.ts", "scripts/lib/companyAgentEvaluationContract.ts"], { cwd: root, encoding: "utf8" }).trim().split("\n").sort();
const sourceFingerprint = sha(sourceFiles.map((file) => `${file}:${sha(readFileSync(path.join(root, file)))}`).join("\n"));
const manifest: any = {
  task: "company-side-conversational-qa", datasetVersion: version, runId, createdAt: new Date().toISOString(),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dirty: true, sourceFingerprint, datasetFiles: frozen.files,
  model: evaluationModel, provider: "OpenRouter", reasoning: getOrgAgentReasoningEffort(evaluationModel), temperature: evaluationModel === "anthropic/claude-haiku-5.5" ? null : 0.5,
  mode, streaming, responseLocale, timeoutMsPerTurn: 120_000, layer: "real-model-production-loop-synthetic-tools",
  copyMode, copyModelContract: "Direct send preserves main-agent final copy via production prepareDirectCandidateMessage. Review drafts use existing copy.ts (Claude, Luna fallback). No delivery or DB calls.",
  rawArtifactPath: runDir, metricSummary: "Pending manual semantic review; structural execution is not a quality pass.",
  selected: option("case") ?? "all", results: [],
};
save("manifest.json", manifest);
save("source-snapshot.json", sourceFiles.map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") })));
const deadAdmin = new Proxy({}, { get() { throw Error("DB access forbidden in model-behavior evaluation"); } });
const workspaceId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
for (const scenario of dataset.scenarios) for (const variant of scenario.variants) {
  const unit = `${scenario.id}-${variant.id}`;
  if (option("case") && !option("case")!.split(",").some(prefix => unit.startsWith(prefix))) continue;
  const candidates = [...dataset.candidates, ...(variant.additionalCandidate ? [variant.additionalCandidate] : [])].map((c: any) => ({ ...c, ...(variant.candidateOverrides?.[c.talentId] ?? {}) }));
  const role = { ...dataset.role, ...variant.roleOverride };
  const allRoles = [role, ...(variant.additionalRoles ?? [])];
  const roles = variant.workspaceRoleIds ? variant.workspaceRoleIds.map((id: string) => { const r = allRoles.find((r: any) => r.roleId === id); if (!r) throw Error("Unknown fixture Role"); return r; }) : allRoles;
  const visibleCandidates = roles.length ? candidates : [];
  const readAdmin = variant.readTables ? createEvaluationReadAdmin(variant.readTables) : null;
  const matchingHistoryText = readAdmin && Object.hasOwn(variant.readTables, "company_first_search_runs")
    ? formatMatchingRunHistory(await readMatchingRunHistory({ admin: readAdmin as any, workspaceId })) : null;
  const history: OrgAgentConversationInput[] = (variant.history ?? []).map((m: any, i: number) => ({ id: i + 1, createdAt: dataset.clock, speaker: m.role === "user" ? "팀원 A" : "Harper", source: m.source ?? (m.role === "user" ? "company" : "harper"), references: m.references ?? "", complete: true, ...m }));
  const messageMetadata: Array<{ role: string; metadata: unknown }> = history.map((m) => ({ role: m.role, metadata: {} }));
  const trace: any[] = [], effects: any[] = [], outputs: any[] = [], completions: any[] = [];
  const contacts = new Map<string, any>((variant.contacts ?? []).map((c: any) => [c.contactId, { roleId: role.roleId, revision: 1, ...c }]));
  const meetings = new Map<string, any>((variant.meetings ?? []).map((m: any) => [m.scheduleId, { ...m }]));
  const decisions = new Map<string, any>();
  let meetingSequence = 800;
  let contactSequence = 400 + contacts.size, currentSourceId = 0;
  const injectedFaults = new Set<number>();
  const candidate = (id: unknown) => {
    const found = candidates.find((c: any) => c.talentId === id);
    if (!found) throw Error("Unknown synthetic candidate ID");
    return found;
  };
  const assertRole = (id: unknown) => { if (!roles.some((r: any) => r.roleId === id)) throw Error("Unknown synthetic role ID"); };
  const publicCandidate = (c: any, r = role) => ({ ...c, email: null, roleId: r.roleId, roleName: r.name, fitSummary: c.evidence, stageLabel: ({ intro_requested: "Intro Requested", company_intro: "먼저 제안 가능한 후보", connected: "연결됨", pending_connection: "연결 대기" } as Record<string, string>)[c.stage] ?? c.stage });
  const positions = (c: any) => (c.roleIds ?? [role.roleId]).map((id: string) => { const r = roles.find((r: any) => r.roleId === id); if (!r) throw Error("Unknown candidate position"); return publicCandidate(c, r); });
  const contactIndex = (c: any) => ({ contactRef: `contact:${c.contactId}`, kind: "contact", talentId: c.talentId,
    candidateName: candidate(c.talentId).name, roleId: c.roleId, roleName: roles.find((r: any) => r.roleId === c.roleId)?.name,
    state: c.status, initiatedBy: "팀원 A", activityAt: c.updatedAt ?? c.sentAt ?? c.createdAt ?? dataset.clock });
  const page = (items: any[], x: any) => {
    const offset = Math.max(0, x.offset ?? 0), limit = Math.min(x.limit ?? 20, variant.pageSize ?? 100);
    return { items: items.slice(offset, offset + limit), offset, limit, hasMore: offset + limit < items.length, totalCount: items.length, returnedCount: items.slice(offset, offset + limit).length };
  };
  const readCandidate = (c: any, includeProfile: boolean) => {
    if (["company_intro", "intro_requested"].includes(c.stage)) {
      return buildCompanyIntroTalentRead(positions(c).map((p: any) => ({
        ...p, talent: c, recommendationId: `synthetic-rec-${c.talentId}`,
        companyIntro: { status: c.stage === "company_intro" ? "ready" : "awaiting_talent",
          requestedAt: c.stage === "intro_requested" ? "2026-09-20T02:59:00Z" : null,
          candidateSentAt: c.stage === "intro_requested" ? "2026-09-20T03:00:00Z" : null,
          harperRecommendation: c.harperRecommendation ?? null },
      })) as any, variant.followupAt ? [{ talent_id: c.talentId, role_id: role.roleId,
        kind: "internal_followup_sent", created_at: variant.followupAt }] as any : []);
    }
    const profile = includeProfile && c.stage !== "intro_requested";
    return ({
    candidate: publicCandidate(c), candidatePreferredLanguage: "Korean", profileIncluded: profile,
    profile: profile ? { bio: c.evidence, experiences: [], education: [], extras: [] } : null,
    positions: positions(c).map((p: any) => ({ ...p, recommendationId: `synthetic-rec-${c.talentId}`, candidateAccepted: c.stage !== "intro_requested", candidateSentAt: c.stage === "intro_requested" ? "2026-09-20T03:00:00Z" : null, companyIntroStatus: c.stage === "intro_requested" ? "awaiting_talent" : null, updatedAt: dataset.clock })),
    recentProgress: c.stage === "intro_requested" && variant.followupAt ? [{ at: variant.followupAt, roleId: role.roleId, roleName: role.name, kind: "Harper 자동 팔로업 발송", text: "기존 제안의 응답 확인 연락 발송", metadata: { sentChannel: "email", followupIndex: 1 } }] : [],
    requestHistory: [...contacts.values()].filter((r) => r.talentId === c.talentId).map((r) => ({ requestId: r.contactId, createdAt: r.createdAt, candidateEmailSentAt: r.sentAt, candidateEmailState: r.status, candidateResponseReceivedAt: r.candidateResponse?.receivedAt, candidateResponseState: r.candidateResponse ? "received" : "none", roleName: roles.find((role: any) => role.roleId === r.roleId)?.name, topic: r.requestContext, candidateEmailSubject: r.subject, candidateEmailBody: r.body, status: r.status, cancelable: ["draft", "queued"].includes(r.status) })), harperSharedInformation: [], meetingHistory: [...meetings.values()].filter(m => m.talentId === c.talentId).map(m => ({ ...m, roleName: role.name, meetingPurpose: m.purpose, coordinationState: m.status, invitationState: m.deliveryState })), resumeAvailability: { available: false },
    });
  };
  const executeTool: NonNullable<OrgAgentLoopDependencies["executeTool"]> = async (args) => {
    const x: any = args.input;
    const traceEntry: any = { name: args.name, input: x };
    trace.push(traceEntry);
    try {
    let result: any;
    const fault = (phase: string) => {
      for (const [i, f] of (variant.faults ?? []).entries()) {
        if ((!f.repeat && injectedFaults.has(i)) || f.phase !== phase || f.tool !== args.name || (f.action && f.action !== x.action) || (f.talentId && f.talentId !== x.talentId)) continue;
        injectedFaults.add(i);
        if (f.billingCode === "credits_exhausted") throw new WorkspaceBillingError(f.billingCode);
        throw Error(f.message ?? "Injected transport failure; check persisted state before retrying");
      }
    };
    fault("before");
    if (args.name === "get_talents") {
      const q = String(x.query ?? "").toLowerCase();
      const list = visibleCandidates.flatMap(positions).filter((c: any) => (!q || `${c.name} ${c.headline} ${c.roleName}`.toLowerCase().includes(q)) && (!x.roleId || c.roleId === x.roleId) && (!x.currentCompanyStageId || c.stage === x.currentCompanyStageId));
      result = { ...page(list.map((c: any) => ({
        candidate: { talentId: c.talentId, name: c.name, email: c.email, headline: c.headline },
        role: { roleId: c.roleId, name: c.roleName },
        currentCompanyStage: { id: c.stage, label: c.stageLabel },
        stage: c.stage, stageLabel: c.stageLabel, fitSummary: c.evidence,
      })), x), total: list.length, selectedStage: x.currentCompanyStageId ?? null };
    } else if (args.name === "read_talent") {
      if (x.roleId) assertRole(x.roleId);
      const list = (x.talentIds ?? [x.talentId]).map((id: string) => readCandidate(candidate(id), x.includeProfile === true));
      result = x.talentIds ? { items: list, requestedCount: list.length, returnedCount: list.length, notFoundTalentIds: [] } : list[0];
    } else if (args.name === "read_role") {
      assertRole(x.roleId);
      const selected = roles.find((r: any) => r.roleId === x.roleId);
      const people = candidates.flatMap(positions).filter((c: any) => c.roleId === x.roleId && (!x.stage || c.stage === x.stage)).map((c: any) => ({ ...c, currentStageId: c.stage, currentStageLabel: c.stageLabel }));
      result = { role: { ...selected, status: humanizeOrgRoleStatus(selected.status), workMode: humanizeOrgWorkMode(selected.workMode), employmentTypes: (selected.employmentTypes ?? []).map(humanizeOrgEmploymentType) }, fieldCompleteness: { role_request: { included: true, complete: true }, role_criteria: { included: true, complete: true } }, availableStages: [{ id: "pending_connection", label: "연결 대기" }, { id: "connected", label: "연결됨" }, ...(variant.stages ?? [])], stageCounts: [], countsComplete: true, people: page(people, { offset: x.peopleOffset, limit: x.peopleLimit }) };
    } else if (args.name === "prepare_candidate_connection" || args.name === "decide_candidate_connection" || args.name === "decide_company_intro") {
      assertRole(x.roleId); const c = candidate(x.talentId);
      const intro = args.name === "decide_company_intro";
      if (intro ? c.stage !== "company_intro" : c.stage !== "pending_connection") throw Error("Invalid decision target state");
      if (x.processStageId || x.nextStageId) throw Error("Synthetic Role has no custom stages");
      const key = `${intro}:${x.roleId}:${x.talentId}:${x.decision}`;
      const previous = decisions.get(key);
      const recipients = x.introRecipientEmails ?? x.introEmails ?? previous?.recipients ?? ["user@example.invalid"];
      const appeal = x.companyAppeal ?? previous?.appeal;
      if (intro && x.decision === "request_intro" && !appeal) {
        result = { status: "missing_inputs", candidateName: c.name, roleName: role.name, missingInputs: ["companyAppeal"] };
      } else if (!previous || previous.sourceId === currentSourceId || args.name === "prepare_candidate_connection") {
        decisions.set(key, { sourceId: currentSourceId, recipients, appeal });
        result = { status: "confirmation_required", candidateName: c.name, roleName: role.name, decision: x.decision, currentStage: c.stage, connectionMethod: x.connectionMethod ?? "intro_email", introEmails: recipients, introRecipientEmails: recipients, companyAppeal: appeal, nextStageName: "연결됨", requestedStage: "connected", nextProcess: intro ? "후보자가 수락하면 소개 이메일로 연결하고 연결됨으로 이동" : "수락하면 소개 이메일로 연결하고 연결됨으로 이동" };
      } else {
        c.stage = intro ? "intro_requested" : "connected";
        effects.push({ name: args.name, input: x, stage: c.stage });
        result = { status: intro ? "requested" : "updated", candidateName: c.name, roleName: role.name, decision: x.decision, connectionMethod: x.connectionMethod ?? "intro_email", stage: c.stage, introRecipientEmails: recipients, introEmails: recipients, nextStageName: "연결됨", candidateMessageSent: false, nextProcess: intro ? "후보자에게 회사의 제안을 전달하고 수락 시 소개 이메일로 연결" : "소개 이메일로 양쪽을 연결" };
      }
    } else if (args.name === "move_candidate_stage") {
      assertRole(x.roleId); const c = candidate(x.talentId);
      if (c.stage !== x.expectedCurrentStageId) throw Error("Stale candidate stage");
      if (!["connected", "pending_connection"].includes(x.targetStageId)) throw Error("Unknown stage in synthetic Role");
      const previousStageLabel = publicCandidate(c).stageLabel;
      if (x.scheduleInterview) {
        let meeting = x.meetingScheduleId ? meetings.get(x.meetingScheduleId) : null;
        if (x.meetingScheduleId && (!meeting || meeting.talentId !== c.talentId)) throw Error("Unknown candidate meeting");
        if (!meeting) {
          const purpose = String(x.meetingPurpose ?? "").trim();
          if (!purpose) {
            result = { status: "meeting_setup_required", candidateName: c.name, roleName: role.name, draftBlocker: "meeting_stage_missing", meetingDraft: { config: { durationMinutes: 60, meetingPurpose: null } }, stageLabel: previousStageLabel };
          } else {
            const key = buildMeetingRequestIdempotencyKey({ workspaceId, recommendationId: `synthetic-rec-${c.talentId}`, sourceCompanyMessageId: currentSourceId });
            meeting = [...meetings.values()].find(m => m.key === key);
            if (!meeting) {
              const id = `00000000-0000-4000-8000-${String(++meetingSequence).padStart(12, "0")}`;
              meeting = { scheduleId: id, talentId: c.talentId, key, purpose, durationMinutes: normalizeInterviewDuration(x.meetingDurationMinutes), status: "awaiting_talent", deliveryState: "queued" };
              meetings.set(id, meeting);
            }
          }
        }
        if (meeting) {
          c.stage = x.targetStageId;
          effects.push({ name: args.name, input: x, scheduleId: meeting.scheduleId, purpose: meeting.purpose, durationMinutes: meeting.durationMinutes });
          result = { status: "updated", candidateName: c.name, roleName: role.name, previousStageLabel, stageLabel: publicCandidate(c).stageLabel, scheduleId: meeting.scheduleId, meeting: { purpose: meeting.purpose, durationMinutes: meeting.durationMinutes, offerWindowDays: 14 }, delivery: { change: x.meetingScheduleId ? "already_scheduled" : "scheduled", delayMinutes: x.meetingDeliveryMode === "immediate" ? 0 : 5, scheduledAt: dataset.clock, sentAt: null } };
        }
      } else { c.stage = x.targetStageId; effects.push({ name: args.name, input: x }); result = { status: "updated", candidateName: c.name, roleName: role.name, previousStageLabel, stageLabel: publicCandidate(c).stageLabel }; }
    } else if (args.name === "start_role_creation") {
      effects.push({ name: args.name, input: x });
      result = { status: "started", roleTitle: x.roleTitle, transferredMessageCount: x.contextMessageCount, requiredContinuationLink: "<https://example.invalid/synthetic-role-thread|새로운 채용 등록 이어가기>" };
      args.state.requiredSlackContinuationLink = result.requiredContinuationLink;
    } else if (args.name === "contact_talent") {
      // No semantic policy in the adapter: it records what the model decided.
      // Only exact IDs/revisions/state are checked, just as a machine contract.
      if (x.presentedDrafts && (x.presentedDrafts !== true || x.action !== "schedule")) throw Error("presentedDrafts must be true and action schedule");
      const presented = x.presentedDrafts === true ? selectRecentlyPresentedContactDraftReferences(messageMetadata).map((r) => ({ contactId: r.contactId, expectedRevision: r.revision })) : null;
      if (x.items || presented) {
        const items = x.items ?? presented;
        if (!Array.isArray(items) || !items.length || items.length > 10) throw Error("Invalid batch contacts");
        const outcomes = [];
        for (const [index, item] of items.entries()) {
          try {
            const result = await executeTool({ ...args, callId: `${args.callId}:${index}`, input: { ...x, ...item, items: undefined, presentedDrafts: undefined } });
            captureOrgAgentContactDraftState({ input: { ...x, ...item }, state: args.state });
            outcomes.push({ ...result, completed: true, index, target: item });
          } catch (error) { outcomes.push({ completed: false, index, target: item, status: "execution_uncertain", reason: String(error), nextAction: "Read the saved contact before retrying only this target." }); }
        }
        const completedCount = outcomes.filter((o) => o.completed).length;
        result = { action: x.action, status: completedCount === items.length ? "batch_complete" : "batch_partial", items: outcomes, requestedCount: items.length, completedCount, incompleteCount: items.length - completedCount };
        traceEntry.result = structuredClone(result); return result;
      }
      if (x.action === "send" || x.action === "create_draft") {
        assertRole(x.roleId); const c = candidate(x.talentId);
        const r = roles.find((r: any) => r.roleId === x.roleId)!;
        if (!(c.roleIds ?? [role.roleId]).includes(x.roleId)) throw Error("Candidate not visible in this Role");
        if (["ended", "deleted"].includes(r.status)) throw Error("Role no longer accepts contacts");
        const duplicate = [...contacts.values()].find((r) => r.roleId === x.roleId && r.talentId === c.talentId && r.sourceMessageId === currentSourceId);
        if (duplicate) { result = { ...duplicate, candidateName: c.name, roleName: r.name, idempotent: true, candidateContactState: duplicate.status, deliveryMode: "immediate" }; traceEntry.result = structuredClone(result); return result; }
        const blocking = [...contacts.values()].find((r) => r.roleId === x.roleId && r.talentId === c.talentId && ["draft", "queued", "failed"].includes(r.status));
        if (blocking) throw Error(`Existing unresolved contact; inspect contact:${blocking.contactId} before changing it`);
        const id = `00000000-0000-4000-8000-${String(++contactSequence).padStart(12, "0")}`;
        const authored = x.action === "send"
          ? prepareDirectCandidateMessage(x, "https://matchharper.com/career/profile?profileSection=links&resumeRequest=synthetic-not-valid")
          : copy ? await copy.generateCandidateContactDraft({
          signal: args.signal,
          verifiedContext: candidateContactWritingEvidence({ stageLabel: publicCandidate(c, r).stageLabel, proposalAwaitingReply: c.stage === "intro_requested" }),
          candidateName: c.name, companyName: "Synthetic Labs", currentInstruction: args.userMessage ?? "",
          deliveryIntent: x.action === "send" ? "direct_reply" : "review_draft", locale: "ko",
          profileUrl: "https://matchharper.com/career/profile?profileSection=links&resumeRequest=synthetic-not-valid",
          recentConversation: conversationCompatibilityText(history), requestContext: String(x.messageContent ?? x.requestContext), requestId: id, roleName: r.name,
        }) : { body: String(x.messageContent ?? x.requestContext), subject: "회사에서 전하는 연락", requestContext: String(x.messageContent ?? x.requestContext) };
        const record = { contactId: id, revision: 1, roleId: r.roleId, talentId: c.talentId, sourceMessageId: currentSourceId, createdAt: dataset.clock, updatedAt: dataset.clock, ...authored, status: x.action === "send" ? "queued" : "draft" };
        contacts.set(id, record); effects.push({ name: args.name, input: x, ...record });
        result = { ...record, candidateName: c.name, roleName: r.name, candidateContactState: record.status, candidateMessageSent: false, deliveryMode: x.action === "send" ? "immediate" : undefined, responseDestination: "this_conversation_after_delivery" };
        if (x.action === "create_draft") { args.state.contactDraftRef = { contactId: id, revision: 1 }; args.state.requiredPresentationText = record.body; }
      } else {
        const presented = x.presentedDrafts ? selectRecentlyPresentedContactDraftReferences(messageMetadata) : [];
        if (x.presentedDrafts && (x.action !== "schedule" || presented.length !== 1)) throw Error("Expected one recently presented draft");
        const id = x.presentedDrafts ? presented[0].contactId : x.contactId;
        const record = contacts.get(id);
        if (!record) throw Error("Unknown contact reference");
        const expectedRevision = x.presentedDrafts ? presented[0].revision : x.expectedRevision;
        if (x.action === "revise_draft" && expectedRevision !== record.revision) throw Error("Missing or stale contact revision");
        let lifecycle = {};
        if (x.action === "revise_draft") {
          if (record.status !== "draft") throw Error("Not a draft");
          const revised = copy ? await copy.reviseCandidateContactDraft({
            signal: args.signal,
            current: record, currentInstruction: args.userMessage ?? "", editInstruction: x.editInstruction, locale: "ko",
            profileUrl: "https://matchharper.com/career/profile?profileSection=links&resumeRequest=synthetic-not-valid",
            recentConversation: conversationCompatibilityText(history), requestId: id,
          }) : { body: `${record.body}\n[요청한 수정: ${x.editInstruction}]` };
          record.revision++; Object.assign(record, revised);
          args.state.contactDraftRef = { contactId: id, revision: record.revision }; args.state.requiredPresentationText = record.body;
        } else lifecycle = evaluateContactLifecycle(record, { ...x, expectedRevision }, dataset.clock);
        record.updatedAt = dataset.clock;
        effects.push({ name: args.name, input: x, ...record });
        result = { ...record, status: x.action === "revise_draft" ? "draft_revised" : record.status, candidateName: candidate(record.talentId).name, roleName: fixtureRoleName(roles, record.roleId), candidateContactState: record.status, candidateMessageSent: false, ...lifecycle };
      }
    } else if (args.name === "change_role_status") { assertRole(x.roleId); const r = roles.find((r: any) => r.roleId === x.roleId)!; const previousStatus = r.status; r.status = x.status; effects.push({ name: args.name, input: x }); result = { status: "updated", role: r, previousStatus }; }
    else if (args.name === "add_candidate_note") { assertRole(x.roleId); const c = candidate(x.talentId); effects.push({ name: args.name, input: x }); result = { status: "created", candidateName: c.name, roleName: role.name, note: x.note }; }
    else if (args.name === "list_contacts") {
      const basis = x.dateBasis ?? "updated";
      const list = [...contacts.values()].filter((c) => {
        const at = basis === "sent" ? c.sentAt : basis === "created" ? c.createdAt : c.updatedAt ?? c.sentAt ?? c.createdAt;
        const q = String(x.query ?? "").toLowerCase();
        return (!x.kind || x.kind === "contact") && (!x.talentId || c.talentId === x.talentId) && (!x.roleId || c.roleId === x.roleId) && (!q || `${candidate(c.talentId).name} ${contactIndex(c).roleName} 팀원 A`.toLowerCase().includes(q)) && (basis !== "sent" || !!at) && (!x.after || at >= x.after) && (!x.before || at < x.before);
      });
      const meetingItems = [...meetings.values()].filter(m => (!x.kind || x.kind === "interview_request") && (!x.talentId || x.talentId === m.talentId) && (!x.roleId || x.roleId === role.roleId) && (!x.query || candidate(m.talentId).name.toLowerCase().includes(String(x.query).toLowerCase()))).map(m => ({ contactRef: `interview_request:${m.scheduleId}`, kind: "interview_request", talentId: m.talentId, candidateName: candidate(m.talentId).name, roleId: role.roleId, roleName: role.name, state: m.status, initiatedBy: "팀원 A", activityAt: dataset.clock }));
      result = { ...page([...list.map(contactIndex), ...meetingItems].sort((a,b) => String(b.activityAt).localeCompare(String(a.activityAt))), x), dateBasis: basis };
    }
    else if (args.name === "read_contact") {
      const refs: string[] = x.contactRefs;
      if (!Array.isArray(refs) || refs.length < 1 || refs.length > 10) throw Error("Invalid contactRefs");
      const parsed = refs.map((ref) => ({ ref, value: parseOrgAgentContactRef(ref) }));
      if (parsed.some((p) => !p.value)) throw Error("Invalid typed contact reference");
      result = { requestedCount: refs.length, notFound: parsed.filter((p) => !contacts.has(p.value!.sourceId) && !meetings.has(p.value!.sourceId)).map((p) => p.ref), items: parsed.filter((p) => p.value?.kind === "contact" && contacts.has(p.value.sourceId)).map((p) => {
        const c = contacts.get(p.value!.sourceId);
        return { contactRef: p.ref, kind: "contact", talentId: c.talentId, candidate: { name: candidate(c.talentId).name }, role: { roleId: c.roleId, name: fixtureRoleName(roles, c.roleId) }, state: c.status, request: c.requestContext,
          draftAction: c.status === "draft" ? { contactId: c.contactId, expectedRevision: c.revision } : null,
          deliveryAction: c.status === "queued" ? { contactId: c.contactId, availableActions: ["immediate", "cancel"] } : null,
          message: { subject: c.subject, body: c.body, sentAt: c.sentAt, scheduledAt: c.scheduledAt ?? null, deliveryState: c.status, sender: { name: "팀원 A" }, recipient: { name: candidate(c.talentId).name } },
          candidateResponse: c.candidateResponse ?? null,
        };
      }) };
      result.items.push(...parsed.filter(p => p.value?.kind === "interview_request" && meetings.has(p.value.sourceId)).map(p => {
        const m = meetings.get(p.value!.sourceId);
        return { contactRef: p.ref, kind: "interview_request", talentId: m.talentId, candidate: { name: candidate(m.talentId).name }, role: { roleId: role.roleId, name: role.name }, state: m.status, meeting: { scheduleId: m.scheduleId, purpose: m.purpose, durationMinutes: m.durationMinutes }, message: { deliveryState: m.deliveryState, scheduledAt: dataset.clock, sentAt: null } };
      }));
    }
    else if (args.name === "read_conversation_history") {
      const threads = variant.threads ?? [];
      result = { type: x.type, threads: x.type === "all" ? threads.map((t: any) => ({ ...t, firstMessages: t.messages.slice(0, 3), messageCount: t.messages.length })) : threads.filter((t: any) => (x.threadIds ?? []).includes(t.threadId)), hasMore: false };

    }
    else if (args.name === "update_data") {
      if (x.proposalId || x.proposalAction || x.baseProposalId) throw Error("Synthetic proposal execution is unsupported");
      const fields: Record<string, string> = {
        role_name: "name", role_location: "locationText", role_work_mode: "workMode",
        role_employment_types: "employmentTypes", role_description: "description",
        role_external_jd_url: "externalJdUrl", salaryRange: "salaryRange",
        role_is_company_first_search: "isCompanyFirstSearch",
      };
      const parsed = parseCompanyDataChanges({ changes: x.changes, summary: x.summary });
      const snapshot = new Map();
      for (const change of parsed.changes) {
        assertRole(change.roleId);
        if (!fields[change.key]) throw Error(`Unsupported synthetic data field: ${change.key}`);
        const r = roles.find((r: any) => r.roleId === change.roleId)!;
        const value = r[fields[change.key]] ?? null;
        snapshot.set(companyDataTargetKey(change.key, change.roleId), { value, expected: value });
      }
      const resolved = resolveCompanyDataMutation({ ...parsed, snapshot, isComplete: () => true });
      if (resolved.confirmationRequired) throw Error("Synthetic proposal execution is unsupported");
      for (const change of resolved.changes) {
        roles.find((r: any) => r.roleId === change.role_id)![fields[change.key]] = change.value;
      }
      effects.push({ name: args.name, input: x, changes: resolved.changes });
      result = { status: resolved.changes.length ? "updated" : "already_reflected", summary: resolved.summary };
    }
    else if (args.name === "request_matching_search") { assertRole(x.roleId); effects.push({ name: args.name, input: x }); result = { status: "queued", requestedRoleName: role.name }; }
    else if (args.name === "get_more_data" && readAdmin) {
      result = await executeOrgAgentTool({ ...args, admin: readAdmin as any });
    }
    else if (args.name === "get_more_data") result = { requestedKinds: x.kinds ?? [], members: { complete: true, items: [], totalCount: 0, returnedCount: 0 } };
    else throw Error(`Fixture adapter has no implementation for ${args.name}; not a success.`);
    if (!(args.name === "get_more_data" && readAdmin)) args.state.toolResults.push({ callId: args.callId, name: args.name, status: "success", summary: "Synthetic tool adapter result" });
    traceEntry.result = structuredClone(result);
    fault("after");
    return result;
    } catch (error) { traceEntry.error = String(error); throw error; }
  };
  let error: string | null = null;
  const started = Date.now();
  for (const userMessage of variant.turns) {
    const currentId = history.length + 1;
    currentSourceId = currentId;
    const context = {
      companyText: "company=Synthetic Labs; workspace_id=" + workspaceId,
      workspace: { workspaceId, companyName: "Synthetic Labs", pitch: "초기 제품을 만드는 팀", companyDescription: "합성 평가 회사", logoUrl: null, homepageUrl: null, linkedinUrl: null },
      roles, completeRoleRequestIds: [],
      rolesText: JSON.stringify(roles.map((r: any) => ({ roleId: r.roleId, name: r.name, status: r.status }))),
      recentRecommendationsText: JSON.stringify(visibleCandidates.flatMap(positions).slice(0, variant.defaultCandidateLimit ?? 20).map((c: any) => variant.compactCandidates ? { talentId: c.talentId, name: c.name, roleId: c.roleId, stage: c.stage } : c)), recentContactsText: "최근 연락의 상세 이력은 read_talent 또는 연락 조회에서 확인 가능",
      conversationMessages: history, conversationText: conversationCompatibilityText(history), summariesText: variant.summary ?? "-", contextNotesText: [roles.length ? `현재 대화 Role: ${variant.currentRoleId === null ? "workspace 전체" : role.roleId}; 기본 후보 목록은 일부이며 전체는 get_talents로 조회` : "역할이 아직 없는 일반 회사 대화", matchingHistoryText].filter(Boolean).join("\n\n"),
      defaultLongTextObservations: [], inProgressRoleCreationsText: "-", pendingUpdateText: "-", recentToolContextText: "-",
    } as unknown as Parameters<typeof runOrgAgentToolLoop>[0]["context"];
    try {
      const result = await runOrgAgentToolLoop({
        actorId, actorLabel: "팀원 A", admin: deadAdmin as any, context,
        conversation: { id: conversationId, company_workspace_id: workspaceId, role_id: variant.currentRoleId === null ? null : roles[0]?.roleId ?? null } as any,
        currentUserMessageId: currentId, mentions: [], model: evaluationModel,
        readAudience: "company_safe", scopeKey: `synthetic-${version}`, source: variant.surface ?? "slack", responseLocale: responseLocale ?? undefined,
        slackThreadId: null, user: { id: actorId, email: "user@example.invalid" } as any,
        userLabel: "팀원 A", userMessage, allowSilentCompletion: variant.allowSilentCompletion === true,
        serviceAnswerExamplesText: variant.serviceAnswerExamplesText ?? null,
        signal: AbortSignal.timeout(120_000),
        ...(streaming ? { onTextDelta: () => {}, onTextReset: () => {} } : {}),
      }, { executeTool, requestTime: new Date(dataset.clock), complete: async (args) => {
        const { signal: _signal, onTextDelta, ...request } = args;
        const call: any = { request: structuredClone(request), streaming: Boolean(onTextDelta), startedAt: new Date().toISOString(), firstTextMs: null, textDeltaCount: 0 };
        completions.push(call);
        call.promptFingerprint = sha(JSON.stringify(call.request));
        const t = Date.now();
        try {
          const result = await runOrgAgentCompletion({ ...args, ...(onTextDelta ? {
            onTextDelta: async (delta: string) => {
              call.firstTextMs ??= Date.now() - t;
              call.textDeltaCount++;
              await onTextDelta(delta);
            },
          } : {}) });
          call.response = result.response;
          return result;
        } catch (error) { call.error = String(error); throw error; }
        finally { call.latencyMs = Date.now() - t; save(`${unit}-completions.json`, completions); }
      } });
      const reply = appendRequiredPresentations({ requiredTexts: getOrgAgentRequiredPresentationTexts(result.state), reply: enforceOrgAgentReplyInvariants(result.state, result.reply) });
      if ("completionError" in result && result.completionError) error = String(result.completionError);
      outputs.push({ userMessage, reply, usage: result.usage, toolResults: result.state.toolResults, billingNotice: result.state.billingNotice ?? null, completionError: "completionError" in result ? result.completionError : null });
      history.push({ id: currentId, role: "user", content: userMessage, speaker: "팀원 A", source: "company", complete: true, references: "" });
      const refs = result.state.contactDraftRefs.length ? result.state.contactDraftRefs : result.state.contactDraftRef ? [result.state.contactDraftRef] : [];
      history.push({ id: currentId + 1, role: "assistant", content: reply, speaker: "Harper", source: "harper", complete: true, toolNames: [...new Set(result.state.toolResults.map((result) => result.name))], references: refs.map((ref) => `candidate_contact_ref{contact_id=${ref.contactId};revision=${ref.revision}}`).join(",") });
      messageMetadata.push({ role: "user", metadata: {} }, { role: "assistant", metadata: { contactDraftRefs: refs } });
    } catch (e) { error = String(e); break; }
  }
  save(`${unit}.json`, { outputs, trace, effects, error, contacts: [...contacts.values()], meetings: [...meetings.values()] });
  const summary = { unit, turns: outputs.length, expectedTurns: variant.turns.length, error, durationMs: Date.now() - started, completionCount: completions.length, promptFingerprint: sha(completions.map((c) => c.promptFingerprint).join("\n")), quality: "pending_manual_review" };
  manifest.results.push(summary); save("manifest.json", manifest);
  console.log(JSON.stringify({ ...summary, replies: outputs.map((o) => o.reply) }));
}
const executionComplete = evaluationExecutionComplete(manifest.results);
await Promise.all(providerCaptures);
manifest.executionStatus = executionComplete ? "complete" : "failed_or_incomplete";
save("manifest.json", manifest);
if (!executionComplete) process.exitCode = 1;
console.log(`Execution: ${manifest.executionStatus}; quality requires separate review. Artifacts: ${runDir}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
