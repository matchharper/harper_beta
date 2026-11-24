import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import annotationData from "./annotations.json";
import sourceBindings from "./sources.json";
import type { CareerLlmMap, MapCall, MapComponent, MapNode, MapScenario } from "./types";
import { readMapSource } from "./source";
import { renderAuxiliaryPrompts } from "./auxiliary";
import { buildCareerConversationPromptPlan } from "@/lib/career/prompts/conversationPlan";
import { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import { CAREER_CAPABILITIES, CAREER_CORE_TOOLS, CAREER_CAPABILITY_LOADER, getCareerCapabilityMode } from "@/lib/career/capabilities/registry";
import { CAREER_HANDBOOKS, CAREER_HANDBOOK_LOADER, isCareerHandbookAvailable } from "@/lib/career/handbooks/registry";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import { buildAnthropicSystemBlocks, buildAnthropicTools } from "@/lib/career/llm";
import { DEFAULT_CAREER_TEXT_CHAT_MODEL } from "@/lib/career/textChatModelConfig";
import { careerBackgroundPreload, getScheduledCareerModelOptions } from "@/lib/career/background/scheduledModel";
import { CAREER_BACKGROUND_INSTRUCTION, renderCareerBackgroundInvocation } from "@/lib/career/background/prompt";
import { adaptEmailPromptBlocks } from "@/lib/email/runtime/prompt";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import type { CareerPromptBlock } from "@/lib/career/prompts/types";

const annotations: {
  components: Record<string, Omit<MapComponent, "text"> & {text?: string}>;
  scenarios: MapScenario[];
  groups: string[];
  inputTypes: CareerLlmMap["inputTypes"];
} = annotationData;

const directory = path.join(process.cwd(), "src/lib/ops/careerLlmMap");
const fixture = {
  channel: "chat" as const, isOnboardingDone: true, profile: null,
  structuredProfileText: "[설명용 자리표시자] 사용자의 확인된 프로필과 선택한 이력서 버전.",
  talentContextSection: "[설명용 자리표시자] 전체 Search Brief와 Memory. 원본 내용·중요도·날짜를 보존.",
  currentPreferences: {preferredLocale: "ko"}, requestTime: new Date("2026-11-12T00:00:00Z"),
  timeZone: "Asia/Seoul", gmailCapability: "not_connected" as const,
};
const dataKeys = new Set(["profile_context", "future_matching_insights", "email_thread_context", "career_coaching_activity"]);
const mixedKeys = new Set(["dynamic_state", "visible_actions", "capability_catalog", "handbook_catalog", "tool_policy", "gmail_capability"]);

/** Executes pure prompt/schema assembly with fixtures, never a model or tool executor. */
export async function buildCareerLlmMap(): Promise<CareerLlmMap> {
  const components: Record<string, MapComponent> = {};
  const unavailable: string[] = [];
  const plans: Record<string, string[]> = {};
  const calls: Record<string, MapCall> = {};
  for (const [id, value] of Object.entries(annotations.components)) {
    if (id.startsWith("b:")) continue;
    components[id] = {text: "", ...value};
  }
  for (const [id, title] of Object.entries({cache_gpt: "GPT system 메시지 조립", cache_request: "OpenAI Responses 요청 조립", cache_claude: "Claude system 캐시 경계", cache_tools: "Claude 도구 캐시 경계"})) {
    components[id] = {id, title, text: "", summary: title, source: "", kind: "현재 코드", group: "캐시 근거", inputType: "conditional"};
  }
  // Source changes are read per refresh, including uncommitted local edits.
  await Promise.all(Object.entries(sourceBindings).map(async ([id, binding]) => {
    const c = components[id];
    if (!c) return;
    try {
      Object.assign(c, await readMapSource(binding), {kind: "현재 코드를 직접 읽은 원문"});
    } catch (error) {
      c.text = error instanceof Error ? error.message : String(error);
      c.kind = "현재 소스 확인 불가";
      unavailable.push(id);
    }
  }));
  // Dynamic context explanations also expose their current implementation instead
  // of retaining copied SQL, sample scheduler instructions or old line numbers.
  for (const id of ["processing_instruction", "background_context", "event:daily", "event:checkin", "event:schedule_once", "event:schedule_repeat", "loaded_guidance", "loaded_tools", "history", "results"]) {
    const c = components[id];
    const source = c.source.match(/(?:src|supabase)\/[\w/.-]+\.(?:ts|sql)/)?.[0];
    if (!source) continue;
    try { Object.assign(c, await readMapSource({path: source}), {kind: "현재 코드를 직접 읽은 원문"}); }
    catch { c.text = "이 서버에서 현재 소스를 찾을 수 없습니다."; c.kind = "현재 소스 확인 불가"; unavailable.push(id); }
  }
  for (const [id, prompt] of Object.entries(renderAuxiliaryPrompts())) Object.assign(components[id], prompt);
  components.background_instruction.text = CAREER_BACKGROUND_INSTRUCTION;
  for (const book of CAREER_HANDBOOKS) {
    const id = "h:" + book.id;
    components[id] = {id, title: components[id]?.title ?? book.id, summary: book.description, text: book.body, source: "src/lib/career/handbooks/registry.ts", kind: "현재 업무 지침 원문", group: "업무 지침", inputType: "conditional"};
  }
  function toolComponent(tool: TalentChatTool) {
    const id = "t:" + tool.function.name;
    components[id] = {id, title: tool.function.name, summary: tool.function.description ?? "", text: JSON.stringify(tool, null, 2), source: "src/lib/career/llmTools.ts → src/lib/talentOnboarding/tools.ts", kind: "현재 도구 schema", group: "도구", inputType: "tools"};
    return id;
  }
  function toolGroup(id: string, tools: readonly TalentChatTool[], title: string) {
    components[id] = {id, title, summary: title, text: JSON.stringify(tools, null, 2), members: tools.map(toolComponent), source: "src/lib/career/capabilities/runtime.ts → resolveStep", kind: "현재 조립한 도구 정의", group: "도구 묶음", inputType: "tools"};
    return id;
  }
  const allTools = resolveCareerChatTools({isOnboardingDone: true, hasActiveGmailIntegration: true}).tools;
  allTools.forEach(toolComponent);
  toolGroup("tools_core", allTools.filter(t => (CAREER_CORE_TOOLS as readonly string[]).includes(t.function.name)), "기본 도구");
  toolGroup("tools_chat", resolveCareerChatTools({isOnboardingDone: false}).tools, "온보딩 채팅 도구");
  toolGroup("tools_voice", resolveCareerChatTools({channel: "voice", isOnboardingDone: true}).tools, "통화 도구");
  for (const capability of CAREER_CAPABILITIES) {
    const names: readonly string[] = capability.tools.map(([name]) => name);
    const id = toolGroup("c:" + capability.id, allTools.filter(t => names.includes(t.function.name)), components["c:" + capability.id]?.title ?? capability.id);
    components[id].summary = capability.summary;
  }

  function assemble(mode: string, node: MapNode, stage: string, callId: string, gmailConnected = false) {
    const background = ["background", "scheduled"].includes(mode);
    const voice = mode.startsWith("voice");
    const onboarding = mode.includes("onboarding");
    const selected = resolveCareerChatTools({background, channel: voice ? "voice" : "chat", isOnboardingDone: !onboarding, hasActiveGmailIntegration: gmailConnected, allowedToolNames: node.noTools ? [] : node.directTools});
    const promptArgs = {...fixture, gmailCapability: gmailConnected ? "available" as const : fixture.gmailCapability, channel: voice ? "voice" as const : "chat" as const, isOnboardingDone: !onboarding, backgroundInvocation: background, scheduledWork: mode === "scheduled", toolNames: selected.toolNames,
      runtimeInstruction: gmailConnected ? renderCareerBackgroundInvocation({
        id: "example", talent_id: "example", conversation_id: null, trigger: "gmail_connected", status: "handed_off", trigger_payload: {}, created_at: fixture.requestTime.toISOString(),
      }) : background ? CAREER_BACKGROUND_INSTRUCTION + "\n\n[설명용 데이터] 이번 사건·예약의 목적과 참조." : mode === "continuation" ? "[설명용 데이터] 이어서 처리할 사용자 요청과 완료 결과." : undefined};
    const emailAdapter = (blocks: CareerPromptBlock[]) => adaptEmailPromptBlocks(blocks, {subject: "[설명용] 사용자가 보낸 메일 제목", thread: "[설명용] 이 메일에 포함된 앞선 대화", attachments: []}, "[설명용] 동일 고객의 추천과 메일 원문 참조").map((block, i) => ({...block, key: block.key ?? `email_context_${i}`}));
    let blocks: CareerPromptBlock[];
    let tools: TalentChatTool[];
    if (voice || onboarding || node.directTools) {
      blocks = buildCareerConversationPromptPlan(promptArgs).promptBlocks;
      tools = selected.tools;
    } else {
      const runtime = new CareerCapabilityRuntime({mode: getCareerCapabilityMode(), eligibleTools: selected.tools, promptArgs: () => promptArgs, ...(mode === "email" ? {adaptPromptBlocks: emailAdapter} : {}),
        preloads: background ? careerBackgroundPreload({scheduledWork: mode === "scheduled"}).capabilityIds : []});
      if (background) runtime.handbooks.load([...careerBackgroundPreload({scheduledWork: mode === "scheduled"}).handbookIds], "selector");
      // Cases describe example selections. Validate against the current registry;
      // newly registered tools/books are enumerated without editing this page.
      for (const capability of CAREER_CAPABILITIES) if ((node.tools ?? []).includes(capability.id)) runtime.loaded.add(capability.id);
      for (const book of CAREER_HANDBOOKS) if ((node.books ?? []).includes(book.id) && isCareerHandbookAvailable(book.id, background, mode === "scheduled")) runtime.handbooks.load([book.id], "selector");
      const step = runtime.resolveStep(false);
      blocks = step.systemBlocks; tools = step.tools;
    }
    const rows = blocks.map(block => {
      const id = `b:${block.key}:${createHash("sha256").update(block.text).digest("hex").slice(0, 12)}`;
      const old = Object.values(annotations.components).find(c => c.key === block.key);
      components[id] = {...old, id, title: old?.title ?? block.key, summary: old?.summary ?? block.key, text: block.text, source: "src/lib/career/prompts/conversationPlan.ts → src/lib/career/capabilities/runtime.ts", kind: "현재 조립 결과 · 개인 정보는 자리표시자", group: "공통 입력", key: block.key, cacheable: block.cacheable, inputType: dataKeys.has(block.key) ? "data" : mixedKeys.has(block.key) ? "mixed" : ["career_main", "chat_core"].includes(block.key) ? "fixed" : "conditional"};
      return {id, label: "system"};
    });
    if (!plans[mode]) plans[mode] = rows.map(r => r.id);
    const cacheEnds = buildAnthropicSystemBlocks(blocks).flatMap((block, i) => "cache_control" in block ? [rows[i].id] : []);
    for (const extra of node.extra ?? []) if (components["p:" + extra]) rows.push({id: "p:" + extra, label: ["return", "return_onboarding"].includes(extra) ? "messages · 앱 이벤트의 현재 생성 코드" : "조건부 입력의 현재 생성 코드"});
    rows.push({id: "history", label: "messages · 실제 대화는 실행마다 다름"});
    if (stage !== "first") rows.push({id: "loaded_guidance", label: "선택한 지침에 따른 동작 · 현재 코드"});
    if (stage === "result") rows.push({id: "results", label: "messages · 도구 결과 처리 코드"});
    const assigned = new Set<string>();
    const displayedTools: string[] = [];
    const groups = [
      {key: "tools_core", title: "기본 도구", names: [...CAREER_CORE_TOOLS] as readonly string[]},
      {key: "loaders", title: "필요한 도구·지침 불러오기", names: [CAREER_CAPABILITY_LOADER, CAREER_HANDBOOK_LOADER]},
      ...CAREER_CAPABILITIES.map(capability => ({key: "c:" + capability.id, title: components["c:" + capability.id].title, names: capability.tools.map(([name]) => name) as readonly string[]})),
      {key: voice ? "tools_voice" : "tools_chat", title: voice ? "통화 도구" : "채팅 도구", names: tools.map(tool => tool.function.name)},
    ];
    for (const group of groups) {
      const members = tools.filter(tool => !assigned.has(tool.function.name) && group.names.includes(tool.function.name));
      if (!members.length) continue;
      members.forEach(tool => assigned.add(tool.function.name));
      const id = toolGroup("tools:" + group.key + ":" + createHash("sha256").update(JSON.stringify(members)).digest("hex").slice(0, 12), members, group.title);
      components[id].key = group.key;
      displayedTools.push(id);
    }
    if (tools.length && stage !== "first") displayedTools.push("loaded_tools");
    return {rows, tools: displayedTools, cacheEnds, cacheToolNames: buildAnthropicTools(tools).flatMap(tool => tool.cache_control ? [tool.name] : []), mode, note: "현재 코드로 조립한 대표 입력. 사용자 자료·실제 선택 결과는 설명용입니다.", diff: []};
  }
  for (const mode of ["chat", "background", "scheduled", "email", "onboarding", "voice", "voice_onboarding", "continuation"]) assemble(mode, {kind: "main", title: mode}, "first", mode);
  const scenarios: MapScenario[] = annotations.scenarios;
  for (const scenario of scenarios) for (const [index, node] of scenario.nodes.entries()) {
    if (node.kind !== "main") continue;
    const mode = node.mode === "background" && scenario.commonBackground ? "scheduled" : node.mode ?? "chat";
    for (const stage of ["first", "loaded", "result"]) {
      const key = `${scenario.id}:${index}:${stage}`;
      calls[key] = assemble(mode, node, stage, key, scenario.id === "gmail");
    }
  }
  const result: CareerLlmMap = {components, plans, calls, scenarios, groups: annotations.groups, inputTypes: annotations.inputTypes, unavailable: unavailable.sort(), defaultModel: DEFAULT_CAREER_TEXT_CHAT_MODEL, scheduledModel: getScheduledCareerModelOptions().assistantModel, revision: "", captured: "서버의 현재 코드 · 설명용 입력"};
  result.revision = createHash("sha256").update(JSON.stringify(result)).update(await careerLlmMapDocument()).digest("hex").slice(0, 16);
  return result;
}

export async function careerLlmMapDocument() {
  const [base, template, compose] = await Promise.all(["base.html", "map.html", "compose.js"].map(file => readFile(path.join(directory, file), "utf8")));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${base}<style>html,body{margin:0;padding:0}body{overflow:auto}.map-tooltip{position:fixed;z-index:10000;max-width:380px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--foreground);font:13px/1.5 sans-serif;pointer-events:none}</style></head><body>${template.replace("__CAREER_COMPOSE__", compose)}</body></html>`;
}
