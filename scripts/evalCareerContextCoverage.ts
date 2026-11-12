import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import Module from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
config({ path: ".env.local", quiet: true });
const task = "docs/evaluation/career-context-coverage", command = process.argv[2], arm = process.argv[3] ?? "baseline";
const dir = `${task}/private`, save = (name: string, value: any) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
mkdirSync(dir, { recursive: true, mode: 0o700 });
const modules = Module as any, originalLoad = modules._load;
const require = Module.createRequire(resolve("scripts/evalCareerContextCoverage.ts"));
const baseline = JSON.parse(readFileSync(`${dir}/baseline-sources.json`, "utf8"));
modules._load = function(request: string, parent: any, main: any) {
  if (request === "server-only") return {};
  if (request.endsWith("usageLogging") || request.endsWith("usageLogging.ts")) return { ...originalLoad.call(this, request, parent, main), logLlmTokenUsage: () => {}, logLlmTokenUsageForToolCalls: () => {} };
  {
    let file: string; try { file = modules._resolveFilename(request, parent, main); } catch { return originalLoad.call(this, request, parent, main); }
    if (file.startsWith(resolve("src") + "/") && file.endsWith(".ts")) {
      if (modules._cache[file]) return modules._cache[file].exports;
      const mod = new modules(file, parent); mod.filename = file; mod.paths = modules._nodeModulePaths(resolve(file, "..")); modules._cache[file] = mod;
      mod._compile(ts.transpileModule(arm === "baseline" && baseline[file] ? baseline[file] : readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
      mod.loaded = true; return mod.exports;
    }
  }
  return originalLoad.call(this, request, parent, main);
};
const originalFetch = globalThis.fetch;
let receipts: Record<string, any> = existsSync(`${dir}/reads.json`) ? JSON.parse(readFileSync(`${dir}/reads.json`, "utf8")) : {};
let activeTrace: any;
const apiOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
async function frozenFetch(input: any, init: any = {}): Promise<Response> {
  const url = new URL(String(input)), headers = new Headers(init.headers);
  if (["api.openai.com", "api.anthropic.com"].includes(url.hostname)) {
    if (command !== "run") throw Error("Provider generation only allowed during run");
    const body = init.body ? JSON.parse(String(init.body)) : null;
    activeTrace?.requests.push(body);
    const response = await originalFetch(input, { ...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(120000)]) });
    activeTrace?.responses.push(await response.clone().json().catch(() => ({ status: response.status })));
    return response;
  }
  if (url.origin !== apiOrigin || !url.pathname.startsWith("/rest/v1/")) throw Error(`Evaluation network denied: ${url.hostname}${url.pathname}`);
  let method = init.method ?? "GET";
  if (method === "POST" && url.pathname.startsWith("/rest/v1/rpc/")) {
    const args = JSON.parse(String(init.body));
    if (url.pathname.endsWith("ensure_career_check_in")) {
      const u = new URL(`${apiOrigin}/rest/v1/talent_agent_schedules`);
      u.searchParams.set("select", "*"); u.searchParams.set("talent_id", `eq.${args.p_user_id}`); u.searchParams.set("schedule_key", "eq.career_check_in");
      const result = await frozenFetch(u, { method: "GET", headers }); const rows = await result.json();
      return Response.json(Array.isArray(rows) ? rows[0] ?? null : rows);
    }
    for (const [key,value] of Object.entries(args)) if (value != null) url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    method = "GET"; // PostgREST GET executes in a read-only DB transaction, including RPCs.
  }
  if (method !== "GET" && method !== "HEAD") throw Error(`Production write denied: ${method} ${url.pathname}`);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : null;
  const keyUrl = new URL(url);
  if (keyUrl.pathname.endsWith("/talent_opportunity_recommendation") && keyUrl.searchParams.has("order")) keyUrl.searchParams.set("order", (keyUrl.searchParams.get("order") ?? "").replace(/,id.asc$/, ""));
  if (limit !== 1) keyUrl.searchParams.delete("limit");
  if (keyUrl.searchParams.get("offset") === "0") keyUrl.searchParams.delete("offset");
  keyUrl.searchParams.sort();
  const key = `${method} ${keyUrl} ${headers.get("accept") ?? ""}`;
  if (!receipts[key]) {
    if (command !== "capture") throw Error(`Frozen read missing: ${url.pathname} ${url.searchParams.get("select") ?? "rpc"}`);
    const fetchUrl = new URL(keyUrl); if (limit !== null && limit !== 1) fetchUrl.searchParams.set("limit", "1000");
    headers.set("prefer", "count=exact");
    const response = await originalFetch(fetchUrl, { ...init, method, body: undefined, headers, signal: AbortSignal.timeout(60000) });
    receipts[key] = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
    save("reads", receipts);
  }
  const saved = receipts[key]; let body = saved.body;
  if (limit !== null && limit !== 1) { try { const value = JSON.parse(body); if (Array.isArray(value)) body = JSON.stringify(value.slice(0, limit)); } catch {} }
  return new Response(method === "HEAD" ? null : body, { status: saved.status, headers: saved.headers });
}
globalThis.fetch = frozenFetch;
const runIds: string[] = JSON.parse(readFileSync(`${dir}/selection.json`, "utf8")).runIds;
const readFixtures: [string, Record<string, unknown>][] = [
  ["manage_action_items",{operation:"list"}],["list_matchings",{}],["read_recommended_opportunities",{limit:20}],
  ["manage_work",{action:"list"}],["list_documents",{limit:20}],["list_profiles",{}],["list_schedules",{}],
  ["follow_company",{action:"list"}],["suggest_form",{action:"list"}],["read_profile",{}],
  ["read_talent_context",{collection:"brief"}],["read_talent_context",{collection:"memory",limit:40}],
  ["read_talent_activity_events",{scope:"activity",limit:20}],["read_talent_activity_events",{scope:"contacts",limit:20}],
  ["read_talent_schedules",{}],["read_company_connections",{}],
];
async function main() {
  const { createClient } = require("@supabase/supabase-js");
  const admin: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: frozenFetch } });
  const profile = require("../src/lib/talentOnboarding/profileStore");
  const { fetchTalentSetting } = require("../src/lib/talentOnboarding/stateStore");
  const memory = require("../src/lib/talentOnboarding/talentContexts");
  const activity = require("../src/lib/talentOnboarding/activityEvents");
  const recommendations = require("../src/lib/talentOpportunity");
  const { listCareerActionItems } = require("../src/lib/career/actionItems.server");
  const { readCareerAgentResourceContext } = require("../src/lib/career/agentTurnRuntime.server");
  const { readWorkContext } = require("../src/lib/career/work/store");
  const { fetchTalentCompanyContactContext } = require("../src/lib/companyTalentRequests/server");
  const { fetchRecentMessagesWithSummary } = require("../src/lib/talentOnboarding/conversationSummary");
  const { formatTalentMessageContentForLlmPrompt } = require("../src/lib/career/opportunityFeedbackNote");
  const { renderCareerBackgroundInvocation } = require("../src/lib/career/background/prompt");
  const { executeTalentTool } = require("../src/lib/talentOnboarding/tools");
  if (["capture", "render"].includes(command)) {
    if (command === "capture" && existsSync(`${dir}/cases.json`)) throw Error("Frozen cases already exist");
    const cases: any[] = [];
    const captured = command === "render" ? JSON.parse(readFileSync(`${dir}/cases.json`, "utf8")) : null;
    for (const [i,id] of runIds.entries()) {
      const runResult = await admin.from("opportunity_discovery_run").select("*").eq("id", id).single(); if (runResult.error) throw runResult.error;
      const run = runResult.data, scope = { admin, userId: run.talent_id, conversationId: run.conversation_id };
      const requestTime = captured?.[i]?.requestTime ?? new Date().toISOString();
      // Freeze relative dates only while assembling source context.
      const RealDate = Date; const now = new RealDate(requestTime).getTime();
      globalThis.Date = class extends RealDate { constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); } static now() { return now; } } as DateConstructor;
      let values: any;
      try {
        const [p,setting,mem,acts,recs,actions,resources,work,company,messages,pending,emails] = await Promise.all([
          profile.fetchTalentUserProfile(scope), fetchTalentSetting(scope), memory.fetchTalentContextPromptSnapshot(scope), activity.fetchRecentTalentActivitySummaries({ ...scope, limit: 5 }),
          recommendations.fetchRecentRecommendedOpportunitiesForPrompt({ ...scope, limit: 10 }), listCareerActionItems(scope), readCareerAgentResourceContext(scope), readWorkContext(scope),
          fetchTalentCompanyContactContext({ admin, talentId: scope.userId }), fetchRecentMessagesWithSummary({ ...scope, recentLimit: 16 }), activity.fetchPendingOpportunityFeedbackPromptContext({ ...scope, limit: 10 }),
          admin.from("career_email_messages").select("id,subject,body_text,occurred_at").eq("talent_id", scope.userId).eq("direction", "outbound").eq("status", "sent").order("occurred_at", { ascending: false }).limit(6),
        ]);
        const structured = await profile.fetchTalentStructuredProfile({ ...scope, talentUser: p });
        const emailText = (emails.data ?? []).slice(0,5).map((e: any) => `Sent email ${e.id}: ${e.subject}\n${e.body_text}`).join("\n\n");
        const historyHeading = arm === "baseline" ? "Recent candidate-visible email history:" : `Sent email history (${(emails.data ?? []).length > 5 ? "5 shown; more" : `all ${emails.data?.length ?? 0}`}):`;
        values = { id: `case-${i+1}`, run, requestTime, userId: scope.userId, conversationId: scope.conversationId,
          messages: messages.map((m:any) => ({ role:m.role, content:formatTalentMessageContentForLlmPrompt(m) })).filter((m:any)=>m.content),
          promptArgs: { channel:"chat", isOnboardingDone:!!setting?.is_onboarding_done, backgroundInvocation:true, profile:p, actionItems:actions,
            structuredProfileText:profile.buildTalentProfileContext({profile:p,structuredProfile:structured,setting}), talentContextSection:memory.renderTalentContextPrompt(mem),
            recentRecommendedOpportunitiesText:recommendations.formatRecentRecommendedOpportunitiesForPrompt(recs), recentActivitySummaries:acts, pendingOpportunityFeedbackContext:pending,
            companyTalentRequestText:company, runtimeInstruction:[renderCareerBackgroundInvocation(run), resources,work.text,`${historyHeading}\n${emailText}`].join("\n\n"),
            timeZone:"Asia/Seoul", requestTime, currentPreferences:{ preferredLocale:setting?.preferred_locale ?? "ko",getExternalRecommendation:setting?.get_external_recommendation,profileVisibility:setting?.profile_visibility,talentSettingStatus:setting?.status },
          }, toolFacts: captured?.[i]?.toolFacts ?? {}, toolErrors:captured?.[i]?.toolErrors ?? {} };
        if (command === "capture") {
          for (const [name,input] of readFixtures) {
            const key = `${name}:${input.collection ?? input.scope ?? ""}`;
            try { values.toolFacts[key] = await executeTalentTool({ name,input,channel:"chat",logging:false,persistTelemetry:false,context:{...scope,backgroundInvocation:{runId:run.id},responseLocale:setting?.preferred_locale??"ko"} as any }); }
            catch (error) { values.toolErrors[key] = String(error); }
          }
        }
      } finally { globalThis.Date = RealDate; }
      cases.push(values); console.log(`${values.id}: context captured, ${Object.keys(values.toolErrors).length} unsupported read fixtures`);
      save(`${arm}-inputs`, cases);
    }
    if (command === "capture") { save("cases", cases); save("capture-manifest", {version:1,seed:"context-coverage-20261111-c7f83",capturedAt:new Date().toISOString(),sourceHashes:Object.fromEntries(Object.entries(baseline).map(([p,s])=>[p,createHash("sha256").update(String(s)).digest("hex")]))}); }
    return;
  }
  const { CareerCapabilityRuntime } = require("../src/lib/career/capabilities/runtime");
  const { resolveCareerChatTools } = require("../src/lib/career/llmTools");
  const { runCareerChatAssistant } = require("../src/lib/career/llm");
  const { getScheduledCareerModelOptions } = require("../src/lib/career/background/scheduledModel");
  const { formatPromptText } = require("../src/lib/llm/promptText");
  const cases = JSON.parse(readFileSync(`${dir}/${arm}-inputs.json`, "utf8"));
  const modelOptions = getScheduledCareerModelOptions();
  for (const scenario of cases) {
    const output = `${task}/runs/${process.argv[4] ?? arm}-${scenario.id}.json`; if (existsSync(output)) throw Error(`Refusing to overwrite ${output}`);
    const trace: any = { id:scenario.id, arm, modelOptions, executions:[],requests:[],responses:[], errors:[], simulationEffects:[] }; activeTrace=trace;
    const runtime = new CareerCapabilityRuntime({ mode:"progressive",replyId:`coverage:${arm}:${scenario.id}`,
      eligibleTools:resolveCareerChatTools({channel:"chat",isOnboardingDone:scenario.promptArgs.isOnboardingDone,background:true,hasActiveGmailIntegration:false,responseLocale:scenario.promptArgs.currentPreferences.preferredLocale}).tools,
      preloads:["schedules","career_delivery"], selection:{capabilityIds:[],handbookIds:["proactive_career"],status:"selected",elapsedMs:0},
      promptArgs:()=>({...scenario.promptArgs,requestTime:new Date(scenario.requestTime)}), });
    const executeTool = async ({name,input}:any) => {
      const event:any={name,input};trace.executions.push(event);
      const key=`${name}:${input.collection ?? input.scope ?? ""}`;
      const read=name.startsWith("read_")||name.startsWith("list_")||["list","read"].includes(input.operation??input.action);
      const fixtureInput = readFixtures.find(([tool, args]) => tool === name && (args.collection ?? args.scope ?? "") === (input.collection ?? input.scope ?? ""))?.[1];
      const exactFixture = fixtureInput && Object.keys(input).length === Object.keys(fixtureInput).length &&
        Object.entries(fixtureInput).every(([field, value]) => input[field] === value);
      if (read && exactFixture && scenario.toolFacts[key]) { event.result=scenario.toolFacts[key];return event.result; }
      if (name==="read_schedule") { const row=scenario.toolFacts["list_schedules:"]?.schedules?.find((s:any)=>s.id===input.schedule_id); if(row) return event.result={modelOutput:formatPromptText(row)}; }
      if (["deliver_career_email","contact_user","manage_action_items","upsert_schedule","write_talent_context","update_talent_profile","upsert_opportunities","upsert_matching","suggest_form","manage_work","update_setting"].includes(name) && !read) {
        trace.simulationEffects.push({name,input});
        return event.result={status:"completed",modelOutput:`Isolated evaluation receipt: ${name} ${input.operation??input.action??"write"} recorded in this fixture. No production action was executed.`};
      }
      const message=`Unavailable frozen executor: ${name}`;event.error=message;trace.errors.push(message);throw Error(message);
    };
    try { const step=runtime.resolveStep(false);trace.reply=await runCareerChatAssistant({primaryModel:modelOptions.assistantModel,openAIResponsesReasoningEffort:modelOptions.assistantOpenAIResponsesReasoningEffort,anthropicEffort:modelOptions.assistantAnthropicEffort,
      responseLocale:scenario.promptArgs.currentPreferences.preferredLocale,messages:scenario.messages,tools:step.tools,systemBlocks:step.systemBlocks,toolRuntime:runtime,executeTool,abortSignal:AbortSignal.timeout(300000),usageLabel:`eval/context-coverage/${arm}/${scenario.id}`});trace.status="completed"; }
    catch(error){trace.status="failed";trace.error=String(error);}
    writeFileSync(output,JSON.stringify(trace,null,2),{mode:0o600});console.log(`${arm} ${scenario.id}: ${trace.status}, ${trace.executions.length} business calls, ${trace.errors.length} unsupported`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
