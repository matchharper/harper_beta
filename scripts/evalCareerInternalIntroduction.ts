import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { database, profile, toolContext, owner, role, rec } from "./lib/careerIntroductionTestStore";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-internal-introduction";
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const clone = <T>(v: T): T => structuredClone(v);
const option = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };

async function main() {
  const version = option("--dataset", "v5");
  const fixture = JSON.parse(readFileSync(`${task}/cases-${version}.json`, "utf8"));
  const gold = JSON.parse(readFileSync(`${task}/gold-${version}.json`, "utf8"));
  const frozen = JSON.parse(readFileSync(`${task}/manifest-${version}.json`, "utf8"));
  for (const [name, digest] of Object.entries(frozen.hashes)) assert.equal(hash(readFileSync(`${task}/${name}`)), digest);
  const repeat = Number(option("--repeat", "1"));
  assert.ok(Number.isInteger(repeat) && repeat > 0);
  const only = option("--only", "").split(",").filter(Boolean);
  assert.ok(only.every(id => fixture.cases.some((c:any) => c.id===id)), "Unknown requested case ID");
  const cases = fixture.cases.filter((c: any) => !only.length || only.includes(c.id));
  if (process.argv.includes("--validate-only")) { console.log(`Validated ${cases.length} conversations.`); return; }
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${option("--label", "run")}`;
  const dir = `${task}/runs/${runId}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  const savedConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"] as const) console[level] = (...args: any[]) => appendFileSync(`${dir}/runtime.log`, args.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n", { mode: 0o600 });
  const scope = new AsyncLocalStorage<{ caseId: string; turn: number; model: string }>();
  const originalFetch = globalThis.fetch;
  const requests: any[] = [], blocked: any[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const current = scope.getStore();
    if (!(url.hostname === "api.openai.com" && ["/v1/responses", "/v1/chat/completions"].includes(url.pathname)) && !(url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages")) {
      blocked.push({ host: url.hostname, path: url.pathname, ...current });
      throw new Error("Evaluation blocks non-provider network");
    }
    assert.ok(current);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, current.model);
    const index = requests.length + 1;
    const record: any = { ...current, index, promptHash: hash(JSON.stringify(body)), reasoning: body.reasoning ?? body.reasoning_effort, started: Date.now() };
    requests.push(record); save(`request-${index}`, body);
    let response: Response;
    try {
      response = await originalFetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(120_000)]) });
    } catch (error) {
      record.failure = error instanceof Error ? { name: error.name, message: error.message, cause: String(error.cause ?? "") } : String(error);
      throw error;
    }
    const raw = await response.clone().text();
    record.elapsedMs = Date.now() - record.started; record.status = response.status;
    save(`response-${index}`, { status: response.status, body: raw });
    return response;
  };
  try {
    const { runCareerChatAssistant } = await import("../src/lib/career/llm");
    const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
    const { resolveCareerTextChatModel } = await import("../src/lib/career/textChatModelConfig");
    const { CareerCapabilityRuntime } = await import("../src/lib/career/capabilities/runtime");
    const { buildCareerOpportunityFeedbackFollowUpTurnInstruction } = await import("../src/lib/career/prompts");
    const { formatSavedOpportunityDecision, formatOpportunityDecisionReceipt } = await import("../src/lib/career/opportunityFeedbackEvent");
    const { formatOpportunityFeedbackPromptContext } = await import("../src/lib/talentOnboarding/activityEvents");
    const { formatTalentMessageContentForLlmPrompt } = await import("../src/lib/career/opportunityFeedbackNote");
    const { CAREER_PROFILE_TOOLS, formatProfileToolResult } = await import("../src/lib/career/profiles/tools");
    const { CAREER_INTERNAL_APPLICATION_TOOLS, formatInternalApplicationToolResult } = await import("../src/lib/career/internalApplications/tools");
    const { readRoleMaterials } = await import("../src/lib/career/roleMaterials/store");
    const { careerFormDraftSchema } = await import("../src/lib/career/forms/schema");
    const { formatCareerFormForModel } = await import("../src/lib/career/forms/format");
    const { formatRelayableCompanyTalentConnections } = await import("../src/lib/companyTalentRequests/server");
    const { formatCareerSchedules } = await import("../src/lib/career/schedules/server");
    const { buildInternalRecommendationProgress } = await import("../src/lib/talentOpportunity");
    const {agentContactReceipt,decodeMaterialSelection}=await import("../src/lib/agentContacts/contracts");
    const {workRpc,readWork,listWork,formatWork,workContext}=await import("../src/lib/career/work/store");
    const { withTalentToolAssistantInstruction } = await import("../src/lib/talentOnboarding/tools");
    const model = resolveCareerTextChatModel(undefined);
    const sources = ["scripts/evalCareerInternalIntroduction.ts", "scripts/lib/careerIntroductionTestStore.ts", "src/lib/career/llm.ts", "src/lib/career/llmTools.ts", "src/lib/career/textChatModelConfig.ts", "src/lib/career/prompts/mainPrompts.ts", "src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/conversationSections.ts", "src/lib/career/prompts/toolPolicyPrompt.ts", "src/lib/career/prompts/cases/lifecyclePrompts.ts", "src/lib/career/opportunityFeedbackEvent.ts", "src/lib/llm/toolDescriptions.ts", "src/lib/career/internalApplications/tools.ts", "src/lib/agentContacts/contracts.ts", "src/lib/agentContacts/toolContracts.ts", "src/lib/career/work/tools.ts", "src/lib/career/work/store.ts", "supabase/migrations/20261103125930_career_concurrent_work.sql", "src/lib/career/profiles/tools.ts", "src/lib/career/profiles/store.ts", "src/lib/career/roleMaterials/store.ts", "supabase/migrations/20261029182857_career_profile_versions_and_role_materials.sql", ...readdirSync("src/lib/career/handbooks").filter(n => n.endsWith(".ts")).map(n => `src/lib/career/handbooks/${n}`)];
    save("manifest", { runId, datasetVersion: version, model, repeat, sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: true, sources: Object.fromEntries(sources.map(p => [p, hash(readFileSync(p))])), fixtureHashes: frozen.hashes, selected: cases.map((c: any) => c.id), timeoutMs: 300_000, concurrency: 2, boundary: "Real profile/material SQL and tool executors; stubbed acceptance downstream; synthetic reads/forms; no company transport." });
    const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
    const ajv = new Ajv({ strict: false, allowUnionTypes: true });
    const validators = new Map(selected.tools.map(t => [t.function.name, ajv.compile(t.function.parameters)]));
    const runCase = async (scenario: any, iteration: number) => {
      const key = `${scenario.id}-r${iteration}`;
      const db = await database({workRuntime:version==='v5'});
      const calls: any[] = [], turns: any[] = [], forms: any[] = [], schedules: any[] = [], errors: string[] = [];
      let accepted = false, decisionCount = 0, turnNumber = 0;
      const currentOpportunity: any = { id: rec, roleId: role, sourceType: "internal", isInternal: true, status: "active", recommendedAt: fixture.requestTime, opportunityType: "internal_recommendation", title: fixture.role.name, companyName: fixture.role.company, feedback: null, feedbackAt: null, feedbackReason: null, isAccepted: false, savedStage: null, isExpired: false };
      let activeWorkId:string|undefined;
      const context = () => ({ ...toolContext(db, `${key}:turn${turnNumber}`), userMessageId:turnNumber+1,workId:activeWorkId,conversationId: "00000000-0000-4000-8000-000000000099" } as any);
      try {
        const p = scenario.profile;
        await db.query("update talent_users set name=$1,headline=$2,bio=$3,location='서울' where user_id=$4", [p.name, p.headline, p.bio, owner]);
        await db.query("insert into talent_experiences(id,talent_id,company_name,role,start_date,description) values(501,$1,'Orbit Example','Platform Engineer','2020-03-01',$2)", [owner, p.experience]);
        const initialProfile = await profile(db);
        let preparedProfile: any = null;
        if (scenario.preparedProfile) {
          preparedProfile = await CAREER_PROFILE_TOOLS.update_talent_profile.execute!({ action: "copy", profileId: initialProfile.profileId, expectedRevision: initialProfile.revision, title: "노바클라우드 소개용", purpose: "노바클라우드 플랫폼 역할 소개", talentUser: { bio: scenario.preparedProfile.bio }, rows: [{ type: "experience", operation: "update", rowId: 501, fields: { description: scenario.preparedProfile.experience } }] }, context());
          await CAREER_INTERNAL_APPLICATION_TOOLS.assign_to_role.execute!({ roleId: role, action: "set", expectedRevision: 0, profileId: preparedProfile.profileId, profileRevision: preparedProfile.revision }, context());
        }
        const accept = async (args: any) => {
          const result = await db.query<any>("select accept_talent_internal_role_recommendation_v2($1,$2,$3,null,null,$4) result", [owner, rec, role, { materialId: args.materialId ?? null, assignmentRevision: args.assignmentRevision ?? null }]);
          assert.equal(result.rows[0].result.status, "accepted");
          await db.query("update talent_opportunity_recommendation set feedback='like',saved_stage=$2 where id=$1", [rec, version === "v1" ? "pending_connection" : "connected"]);
          accepted = true;
          const pin = await db.query<any>("select m.* from talent_role_materials m join talent_opportunity_recommendation r on r.shared_material_id=m.id where r.id=$1", [rec]);
          Object.assign(currentOpportunity, { feedback: "positive", feedbackAt: fixture.requestTime, isAccepted: true, savedStage: "pending_connection", acceptanceMaterial: { materialId: pin.rows[0].id, assignmentRevision: pin.rows[0].revision }, internalProgress: { code: "accepted", message: "소개를 수락했으며 Harper가 회사에 소개할 예정입니다. 회사 전달이나 응답 기록은 아직 없습니다." } });
          if (version !== "v1") {
            currentOpportunity.savedStage = "connected";
            currentOpportunity.internalProgress = buildInternalRecommendationProgress({ item: currentOpportunity, tags: [], events: [],agentIntroductionRootId:version==="v5"?"00000000-0000-4000-8000-000000000010":undefined });
          }
        };
        if (scenario.mode === "button" && version !== "v5") await accept({});
        const history: any[] = scenario.initialInterest ? [] : [{ role: "assistant", content: `서윤님, ${fixture.role.company}의 ${fixture.role.name} 포지션은 Kubernetes 운영과 장애 대응 경험을 살릴 수 있는 기회예요. 회사에 소개해 드릴까요?\n\n[posting](${role})` }, ...(scenario.historyUser ? [{ role: "user", content: scenario.historyUser }] : [])];
        for (const message of scenario.turns) {
          const event = scenario.mode === "button" && turnNumber === 0;
          if(version==='v5') await db.query("insert into talent_messages(id,user_id,conversation_id,role,message_type,content,payload,created_at) values($1,$2,$3,'user',$4,$5,$6,$7)",[
            turnNumber+1,owner,context().conversationId,event?'agent_introduction_action':'chat',message ?? '노바클라우드의 플랫폼 엔지니어 역할에 저를 소개해주세요.',event?{recommendationId:rec,roleId:role}:{},new Date(new Date(fixture.requestTime).getTime()+turnNumber*300_000).toISOString()]);
          const turnCallsStart = calls.length;
          const executeTool = async ({ name, input }: { name: string; input: Record<string, unknown> }) => {
            const entry: any = { turn: turnNumber, name, input: clone(input) }; calls.push(entry);
            try {
              const validate = validators.get(name); assert.ok(validate, `Missing production schema: ${name}`);
              if (!validate(input)) throw new Error(`Invalid tool input: ${ajv.errorsText(validate.errors)}`);
              const { _uiStatusMessage, ...args } = input as any;
              let raw: any, modelOutput = "";
              if(version==='v5' && name==='manage_work') {
                if(args.action==='start' && activeWorkId) throw new Error('Continue this work; independent work is delegated from the conversation.');
                if(args.action==='list') {raw=await listWork(context(),args.before,args.include_closed);modelOutput=raw.works.map(formatWork).join('\n\n')||'No delegated work.';}
                else {
                  raw=args.action==='read' ? await readWork(context(),String(args.work_id)) : await workRpc(context(),String(args.action),{...args,source_refs:args.source_refs ?? [turnNumber+1],caller_work_id:activeWorkId ?? null});
                  modelOutput=formatWork(raw);
                }
              } else if (CAREER_PROFILE_TOOLS[name]) {
                raw = await CAREER_PROFILE_TOOLS[name].execute!(args, context()); modelOutput = formatProfileToolResult(name, raw);
              } else if (name === "assign_to_role") {
                raw = await CAREER_INTERNAL_APPLICATION_TOOLS.assign_to_role.execute!(args, context()); modelOutput = formatInternalApplicationToolResult(name, raw);
              } else if (version === "v5" && name === "contact_company") {
                assert.equal(args.recommendationId,rec); assert.equal(args.acceptIntroduction,true);
                assert.ok(!(scenario.initialInterest && turnNumber===0),'Initial exploration is not introduction acceptance');
                assert.equal(accepted,false,"Duplicate introduction");
                const pinned=await db.query<any>("select pin_agent_contact_material_v1($1,$2,$3,$4,$5) AS id",[owner,role,`${key}:${turnNumber}:contact`,decodeMaterialSelection(args.selectionRef)??null,{userMessageId:turnNumber+1}]);
                await db.query("update talent_opportunity_recommendation set shared_material_id=$2 where id=$1",[rec,pinned.rows[0].id]);
                await accept(args); decisionCount++;
                raw=agentContactReceipt({id:"00000000-0000-4000-8000-000000000010",root_id:"00000000-0000-4000-8000-000000000010",role_id:role,recommendation_id:rec,material_id:pinned.rows[0].id,direction:"to_company",cancelled_at:null} as any);
                modelOutput=raw.modelOutput;
              } else if(version === "v5" && name === "apply_to_internal_role") {
                assert.equal(args.roleId,role);
                raw={recommendationId:rec,visible:true,role:{roleId:role,name:fixture.role.name,companyName:fixture.role.company,description:fixture.role.description,companyDescription:"클라우드 주문 서비스를 만드는 팀"},postingRoleIds:[role],status:"queued",companyShared:false};
                modelOutput=formatInternalApplicationToolResult(name,raw);
              } else if (name === "update_recommended_opportunity_feedback") {
                if(version === "v5") throw new Error("Internal acceptance must use contact_company");
                assert.ok(args.opportunityId === rec || args.roleId === role, "Wrong recommendation");
                assert.equal(args.feedback, "like"); assert.equal(accepted, false, "Duplicate acceptance");
                await accept(args); decisionCount++;
                raw = { ok: true, accepted: true, companyShared: false };
                modelOutput = formatOpportunityDecisionReceipt({ opportunity: currentOpportunity, feedback: "like", companyShared: false, updatedAt: fixture.requestTime });
              } else if (name === "read_recommended_opportunities") {
                modelOutput = `${formatSavedOpportunityDecision(currentOpportunity)}\nPublic role: ${fixture.role.description}\nNo other opportunities. No next cursor.`;
              } else if (name === "get_role_context" || name === "get_internal_roles") {
                modelOutput = `Role ${role}: ${fixture.role.company} / ${fixture.role.name}; internal.\nPublic details: ${fixture.role.description}\n${formatSavedOpportunityDecision(currentOpportunity)}\nNo next cursor.`;
              } else if (name === "read_talent_context") {
                modelOutput = "Search Brief: 서울 플랫폼 엔지니어, 주 2회 출근 가능. Memory: No other confirmed experience. No next cursor.";
              } else if (name === "read_document" || name === "list_documents") {
                modelOutput = "No uploaded documents or additional experience evidence. No next cursor.";
              } else if (name === "read_talent_activity_events") {
                modelOutput = `Current opportunity state: ${formatSavedOpportunityDecision(currentOpportunity)}\nNo company delivery, reply, or interview activity recorded.`;
              } else if (name === "read_agent_messages") {
                modelOutput=accepted ? `Introduction 00000000-0000-4000-8000-000000000010 for Role ${role}: accepted by the company agent for asynchronous processing. No response recorded.` : "No agent messages.";
              } else if (name === "read_company_connections") {
                modelOutput = formatRelayableCompanyTalentConnections([]);
              } else if (name === "list_schedules") {
                modelOutput = formatCareerSchedules(schedules);
              } else if (name === "upsert_schedule") {
                raw = { ...args, id: `00000000-0000-4000-8000-${String(800 + schedules.length).padStart(12, "0")}`, revision: 1, status: "active" };
                schedules.push(raw); modelOutput = formatCareerSchedules([raw]);
              } else if (name === "suggest_form") {
                if (args.action === "create") { raw = { ...careerFormDraftSchema.parse(args.form), formId: forms.length + 1, revision: 1 }; forms.push(raw); }
                else if (args.action === "update") { const i = forms.findIndex(f => f.formId === args.formId); assert.ok(i >= 0); assert.equal(args.expectedRevision, forms[i].revision); raw = { ...careerFormDraftSchema.parse(args.form), formId: args.formId, revision: forms[i].revision + 1 }; forms[i] = raw; }
                else raw = forms.find(f => f.formId === args.formId);
                modelOutput = raw ? formatCareerFormForModel(raw) : forms.map(formatCareerFormForModel).join("\n\n") || "No saved forms.";
              } else throw new Error(`Unconfigured evaluation executor: ${name}`);
              entry.result = { raw, modelOutput };
              return withTalentToolAssistantInstruction({ ...raw, modelOutput });
            } catch (e) { entry.error = e instanceof Error ? e.message : String(e); throw e; }
          };
          const profileIndex = (await db.query<any>("select id,title,current_revision,is_default from talent_profiles where talent_id=$1 order by created_at", [owner])).rows;
          const defaultNow = await profile(db);
          const extraContext = [
            `Profile index:\n${profileIndex.map(p => `${p.title}; profileId=${p.id}; revision=${p.current_revision}; default=${p.is_default}`).join("\n")}`,
            "Full profile rows are available through read_profile. No additional uploaded documents.",
            `Public role ${role}: ${fixture.role.company} / ${fixture.role.name}. ${fixture.role.description}`,
            version==='v5' ? await workContext(context()) : '',
            formatSavedOpportunityDecision(currentOpportunity),
            event && version !== "v5" ? buildCareerOpportunityFeedbackFollowUpTurnInstruction({ preferredLocale: "ko", trigger: "immediate_internal_feedback" }) : "",
            event && version !== "v5" ? formatOpportunityFeedbackPromptContext([{ eventId: `event:${key}`, createdAt: fixture.requestTime, action: "positive", summary: `User accepted ${fixture.role.company} ${fixture.role.name} through the introduction button.` }]) : "",
            forms.length ? `Existing forms:\n${forms.map(formatCareerFormForModel).join("\n\n")}` : "",
          ].filter(Boolean).join("\n\n");
          const signal = AbortSignal.timeout(300_000);
          const currentTurnTime = new Date(new Date(fixture.requestTime).getTime() + turnNumber * 300_000);
          const dynamicContext = ["v3", "v4", "v5"].includes(version);
          const runtime = new CareerCapabilityRuntime({ mode: "progressive", replyId: `${key}:turn${turnNumber}`, eligibleTools: selected.tools, preloads: [], abortSignal: signal, promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: `${p.name}; ${p.years} 플랫폼 엔지니어.\n${defaultNow.snapshot.talentUser.bio}`, talentContextSection: dynamicContext ? "Search Brief: 서울 플랫폼 엔지니어. Memory: No additional confirmed facts." : extraContext, ...(dynamicContext ? { runtimeInstruction: extraContext } : {}), requestTime: currentTurnTime, timeZone: "Asia/Seoul", currentPreferences: { preferredLocale: "ko", talentSettingStatus: "active", getExternalRecommendation: true, getInternalRecommendation: true } }) });
          const step = runtime.resolveStep(false);
          const projectMessage = (item: any, index: number) => ["v4","v5"].includes(version) ? { role: item.role, content: formatTalentMessageContentForLlmPrompt({ ...item, created_at: item.created_at ?? new Date(new Date(fixture.requestTime).getTime() - 300_000 + index * 60_000).toISOString() }, { includeCreatedAt: true, preferredLocale: "ko", timeZone: "Asia/Seoul" }) } : item;
          const messages = history.map(projectMessage).filter(item => item.content.trim());
          if(event && version === "v5") messages.push(projectMessage({role:"user",message_type:"agent_introduction_action",content:"노바클라우드의 플랫폼 엔지니어 역할에 저를 소개해주세요.",payload:{recommendationId:rec,roleId:role,feedbackReason:scenario.historyUser ?? null},created_at:currentTurnTime.toISOString()},history.length));
          else if (!event) messages.push(projectMessage({ role: "user", content: message, created_at: currentTurnTime.toISOString() }, history.length));
          else if (version !== "v4" || messages.at(-1)?.role !== "user") messages.push({ role: "user", content: "Continue the user's delegated work using the new execution result supplied in the runtime context." });
          let reply = "", failure: string | undefined;
          const started = Date.now();
          try {
            reply = await scope.run({ caseId: key, turn: turnNumber, model: model.model }, () => runCareerChatAssistant({ primaryModel: model.model, chatCompletionReasoningEffort: model.chatCompletionReasoningEffort, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort, responseLocale: "ko", messages, tools: step.tools, systemBlocks: step.systemBlocks, toolRuntime: runtime, abortSignal: signal, usageLabel: `eval/internal-introduction/${key}`, executeTool }));
          } catch (e) { failure = e instanceof Error ? e.message : String(e); errors.push(failure); }
          if (!event) history.push({ role: "user", content: message, created_at: currentTurnTime.toISOString() });
          history.push({ role: "assistant", content: reply, created_at: new Date(currentTurnTime.getTime() + 60_000).toISOString() });
          turns.push({ turn: turnNumber, event, user: message, reply, failure, elapsedMs: Date.now() - started, calls: calls.slice(turnCallsStart) });
          if(version==='v5') {
            const pending=(await db.query<any>("select * from talent_external_operations where kind='career_invocation' and parent_id is not null and status='ready' order by created_at,id")).rows;
            for(const invocation of pending) {
              const work=await readWork(context(),invocation.parent_id);
              if(invocation.request.cleanup===true || ['completed','cancelled'].includes(work.status)) {
                await db.query("update talent_external_operations set status='completed' where id=$1",[invocation.id]);
                continue;
              }
              activeWorkId=invocation.parent_id;
              const delegatedContext=await workContext(context(),activeWorkId);
              const childStart=calls.length;
              const childRuntime=new CareerCapabilityRuntime({mode:'progressive',replyId:`${key}:work:${invocation.id}`,eligibleTools:selected.tools,preloads:[],abortSignal:signal,promptArgs:()=>({channel:'chat',isOnboardingDone:true,profile:null,structuredProfileText:`${p.name}\n${defaultNow.snapshot.talentUser.bio}`,talentContextSection:'Search Brief: 서울 플랫폼 엔지니어. Memory: No additional confirmed facts.',runtimeInstruction:[extraContext,formatSavedOpportunityDecision(currentOpportunity),delegatedContext].join('\n\n'),requestTime:currentTurnTime,timeZone:'Asia/Seoul',currentPreferences:{preferredLocale:'ko',talentSettingStatus:'active',getInternalRecommendation:true,getExternalRecommendation:true}})});
              const childStep=childRuntime.resolveStep(false);
              const childReply=await scope.run({caseId:key,turn:turnNumber,model:model.model},()=>runCareerChatAssistant({primaryModel:model.model,chatCompletionReasoningEffort:model.chatCompletionReasoningEffort,openAIResponsesReasoningEffort:model.openAIResponsesReasoningEffort,responseLocale:'ko',messages:[...messages,{role:'assistant',content:reply}],tools:childStep.tools,systemBlocks:childStep.systemBlocks,toolRuntime:childRuntime,abortSignal:signal,usageLabel:`eval/internal-introduction/${key}/work`,executeTool}));
              turns.push({turn:turnNumber,event:true,workId:activeWorkId,user:null,reply:childReply,calls:calls.slice(childStart)});
              if(childReply) history.push({role:'assistant',content:childReply,created_at:new Date(currentTurnTime.getTime()+90_000).toISOString()});
              await db.query("update talent_external_operations set status='completed' where id=$1",[invocation.id]);
              activeWorkId=undefined;
            }
          }
          save(key, { caseId: scenario.id, iteration, turns, errors });
          process.stdout.write(JSON.stringify({ caseId: key, turn: turnNumber, toolCalls: calls.length - turnCallsStart, failure }) + "\n");
          turnNumber++;
        }
        const finalProfiles = (await db.query<any>("select p.id,p.title,p.is_default,p.current_revision,r.snapshot from talent_profiles p join talent_profile_revisions r on r.profile_id=p.id and r.revision=p.current_revision where p.talent_id=$1", [owner])).rows;
        const materials = await readRoleMaterials({ admin: context().admin, userId: owner, roleId: role });
        const pinned = (await db.query<any>("select m.* from talent_role_materials m join talent_opportunity_recommendation r on r.shared_material_id=m.id where r.id=$1", [rec])).rows[0];
        const expected = gold.cases.find((c: any) => c.id === scenario.id);
        if(expected.requiresApply && !calls.some(c=>c.name==='apply_to_internal_role' && !c.error)) errors.push('Initial interest did not save the opportunity');
        if (decisionCount !== expected.requiredDecisionCount) errors.push(`Acceptance count ${decisionCount}, expected ${expected.requiredDecisionCount}`);
        if (expected.requiresProfileWrite && !calls.some(c => c.name === "update_talent_profile" && !c.error)) errors.push("Requested profile edit was not executed");
        if (expected.requiresForm && !forms.length) errors.push("Requested question form was not created");
        if (expected.preservePrepared && (pinned?.profile_id !== preparedProfile.profileId || Number(pinned?.profile_revision) !== preparedProfile.revision)) errors.push("Prepared profile was not pinned");
        const lastProfileWrite = calls.filter(c => c.name === "update_talent_profile" && !c.error).at(-1)?.result.raw;
        if (expected.requiresProfileWrite && scenario.mode === "chat" && lastProfileWrite && (pinned?.profile_id !== lastProfileWrite.profileId || Number(pinned?.profile_revision) !== lastProfileWrite.revision)) errors.push("Requested profile update was not included in the accepted material");
        if (expected.noMutation && calls.some(c => c.name === "update_talent_profile" || c.name === "assign_to_role" && c.input.action !== "read")) errors.push("Unrequested profile/material mutation");
        for (const call of calls) if (call.error) errors.push(`${call.name}: ${call.error}`);
        const result = { caseId: scenario.id, iteration, model, initialProfile, preparedProfile, turns, calls, forms, schedules, finalProfiles, materials, pinned, decisionCount, structuralErrors: errors, semanticReview: "pending" };
        save(key, result); return result;
      } finally { await db.close(); }
    };
    const jobs = Array.from({ length: repeat }, (_, i) => cases.map((c: any) => ({ scenario: c, iteration: i + 1 }))).flat();
    const results: any[] = []; let cursor = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (cursor < jobs.length) { const job = jobs[cursor++]; results.push(await runCase(job.scenario, job.iteration)); } }));
    save("results", results); save("requests", requests); save("blocked-network", blocked);
    save("summary", { conversations: results.length, turns: results.reduce((n, r) => n + r.turns.length, 0), structuralPass: results.filter(r => !r.structuralErrors.length).length, semanticReview: "pending", requests: requests.length, models: [model.model] });
    process.stdout.write(`Artifacts: ${dir}\n`);
    if (results.some(r => r.structuralErrors.length)) process.exitCode = 1;
  } finally { globalThis.fetch = originalFetch; Object.assign(console, savedConsole); save("requests", requests); save("blocked-network", blocked); }
}
main().catch(e => { process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exitCode = 1; });
