import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

async function main() {
  const root = path.resolve(__dirname, "..");
  const task = path.join(root, "docs/evaluation/company-search-continuation");
  const runId = process.argv[2];
  if (!runId || !/^[a-z0-9-]+$/.test(runId)) throw Error("New run ID required");
  const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const frozen = JSON.parse(readFileSync(path.join(task, "manifest-v1.json"), "utf8"));
  for (const [file, hash] of Object.entries(frozen.files)) {
    if (sha(readFileSync(path.join(task, file))) !== hash) throw Error(`Frozen file changed: ${file}`);
  }
  const dataset = JSON.parse(readFileSync(path.join(task, "cases-v1.json"), "utf8"));
  const dir = path.join(task, "runs", runId);
  mkdirSync(dir, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  config({ path: path.join(root, ".env.local"), quiet: true });
  if (!process.env.OPENROUTER_API_KEY) throw Error("OPENROUTER_API_KEY required");
  // Even accidental initialization cannot reach a production database.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "unused-by-gemini-evaluation";
  const realFetch = globalThis.fetch;
  let sequence = 0;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (url.hostname !== "openrouter.ai") throw Error(`Non-provider network blocked: ${url.hostname}`);
    const n = ++sequence;
    const response = await realFetch(input, init);
    save(`provider-${n}.json`, { request: JSON.parse(init.body), status: response.status, response: await response.clone().text() });
    return response;
  }) as typeof fetch;
  const { runOrgAgentToolLoop, runOrgAgentCompletion } = await import("../src/lib/org/agent/chat");
  const { buildCompanyUpdatePrompt, companyUpdateInitialCapabilities } = await import("../src/lib/org/agent/companyUpdate");
  const { buildCompanyMatchingResultContext } = await import("../src/lib/companyFirstSearch/resultContext");
  const { formatCompanyRoleSearch } = await import("../src/lib/companyFirstSearch/agenticSearch");
  const sources = ["src/lib/org/agent/chat.ts", "src/lib/org/agent/companyUpdate.ts", "src/lib/org/agent/capabilities/policies.ts",
    "src/lib/org/agent/capabilities/resolver.ts", "src/lib/org/agent/promptFormat.ts", "src/lib/org/agent/prompts.ts",
    "src/lib/companyFirstSearch/resultContext.ts", "src/lib/companyFirstSearch/agenticSearch.ts",
    "src/app/api/internal/company-first/result-notice/route.ts", "scripts/evalCompanySearchContinuation.ts"];
  save("manifest.json", { dataset: frozen, sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: true, sourceHashes: Object.fromEntries(sources.map(file => [file, sha(readFileSync(path.join(root, file)))])),
    model: "google/gemini-3.8-flash", provider: "OpenRouter", reasoning: "medium", temperature: 0.5, timeoutMs: 180000 });
  const roleId = "00000000-0000-4000-8000-000000000004";
  const role = { roleId, name: "Frontend Engineer", status: "active", request: "React/TypeScript, React Native 앱 실무. 근속 1년 미만 회사 이력이 있으면 제외.",
    information: { testOnly: true, testFixture: "company-search-continuation-v1" } };
  const roleFacts = [{ id: roleId, name: role.name, automaticSearchEnabled: true }];
  for (const item of dataset.cases) {
    const effects: any[] = [], trace: any[] = [], completions: any[] = [];
    const candidates = ["지윤", "도윤"].map((name, i) => ({
      talentId: `00000000-0000-4000-8000-00000000001${i + 1}`, name, headline: "Frontend Engineer", location: "서울",
      recentExperience: [{ role: "React/React Native 앱 개발", company_name: "합성 제품 회사", start_date: "2022-01-01", end_date: "2026-01-01" },
        ...((i || item.noSuitable) ? [{ role: "프론트엔드 개발", company_name: "합성 이전 회사", start_date: "2021-01-01", end_date: "2021-06-01" }] : [])],
      recentEducation: [], currentCompanyRelationship: { hasCompanyHistory: false, newPairAvailable: true, introStatus: null, hasSharedProgress: false },
      evaluation: { briefVersion: "brief-2", stage: 2, assessment: { candidateFit: 80, companyFit: 85, mutualFit: 82,
        criteria: [{ name: "앱·웹 개발", criterionDefinition: "React/TypeScript 웹 및 React Native 앱 실무", label: "excellent" },
          { name: "재직 기간", criterionDefinition: "1년 미만 재직 회사 이력이 있으면 제외", label: i || item.noSuitable ? "conflict" : "good" }] } },
    }));
    const selection: any = { roleId, briefVersion: "brief-2", view: "selection", run: null, total: 2, counts: { stage2Evaluated: 20 },
      criteria: { "재직 기간": { conflict: item.noSuitable ? 20 : 19, good: item.noSuitable ? 0 : 1 } }, items: [], nextOffset: null,
      selection: { currentBriefVersion: "brief-2", poolVersion: "pool-1", currentPoolCount: 0, currentPool: [], topCandidates: candidates, page: { from: 1, to: 2 } } };
    const history = item.history.map((m: any, i: number) => ({ ...m, id: i + 1, createdAt: dataset.clock,
      source: m.role === "user" ? "company" : "harper", speaker: m.role === "user" ? "팀원" : "Harper", complete: true, references: "" }));
    const event = { purpose: "Resume the company's candidate-search assignment from this completed step, using the original request, subsequent conversation and candidate-search policy.", facts: {
      matchingSearchRunId: "00000000-0000-4000-8000-000000000005", companyMessageAlreadyDelivered: false,
      sourceRequest: { messageId: item.sourceMessageId, content: history[item.sourceMessageId - 1].content },
      result: buildCompanyMatchingResultContext({ candidates: [], roles: roleFacts, runStatus: "succeeded", requestedByCompany: true,
        interactiveSearch: { selectionMethod: "evaluation_only", briefVersion: "brief-2", scope: "all", startStage: 1,
          stage1Passed: 20, stage2Evaluated: 20, addedTalentIds: [], removedTalentIds: [], retainedTalentIds: [] } }),
      selectionReview: formatCompanyRoleSearch(selection), recommendationListChanged: false,
    } };
    try {
      const result = await runOrgAgentToolLoop({
        admin: new Proxy({}, { get() { throw Error("Database access forbidden"); } }) as any,
        user: { id: "actor" } as any, actorId: "actor", actorLabel: "팀원", currentUserMessageId: history.length + 1,
        conversation: { id: "conversation", role_id: roleId, company_workspace_id: "workspace" } as any,
        context: { workspace: { workspaceId: "workspace", companyName: "합성 회사" }, roles: [role], companyText: "서울 제품 스타트업",
          rolesText: `${role.name} · active · ${role.request}`, conversationMessages: history, conversationText: "",
          summariesText: "-", recentRecommendationsText: "현재 검토 가능한 추천 0명. 이전 추천은 모두 Pass 처리됨.", recentContactsText: "연락 없음",
          contextNotesText: "-", completeRoleRequestIds: [roleId], defaultLongTextObservations: [], pendingUpdateText: "-", recentToolContextText: "-" } as any,
        mentions: [], model: "google/gemini-3.8-flash", reasoningEffort: "medium", capabilityMode: "progressive",
        initialCapabilities: companyUpdateInitialCapabilities(event), source: "chat", responseLocale: "ko", readAudience: "company_safe",
        scopeKey: "synthetic", slackThreadId: null, userMessage: buildCompanyUpdatePrompt(event), signal: AbortSignal.timeout(180000),
      }, {
        requestTime: new Date(dataset.clock),
        complete: async args => {
          const request = { ...args, candidateEmailWorkspaceId: undefined };
          const completion = await runOrgAgentCompletion(request);
          completions.push({ messages: args.messages, tools: args.tools, promptFingerprint: sha(JSON.stringify(args.messages)), response: completion.response });
          save(`${item.id}-completions.json`, completions);
          return completion;
        },
        executeTool: async args => {
          trace.push({ name: args.name, input: args.input });
          if (args.name === "publish_role_recommendations") {
            const ids = args.input.talentIds as string[];
            if (args.input.roleId !== roleId || !Array.isArray(ids) || ids.some(id => !candidates.some(c => c.talentId === id))) throw Error("Unknown fixture target");
            effects.push(...ids);
            return { status: "completed", kind: args.input.kind, runId: "synthetic-publication", requestedRoleName: role.name,
              requestedTalentIds: ids, addedTalentIds: ids, retainedTalentIds: [], refreshedTalentIds: [], removedTalentIds: [] };
          }
          if (args.name === "get_more_data") return { requestedKinds: ["matching_runs"], roleSearch: selection };
          throw Error(`No synthetic execution adapter for ${args.name}`);
        },
      });
      const expected = [...item.expectedIds].sort();
      const pass = JSON.stringify([...effects].sort()) === JSON.stringify(expected) && trace.every(t => ["get_more_data", "publish_role_recommendations"].includes(t.name));
      save(`${item.id}.json`, { reply: result.reply, effects, trace, structuralPass: pass, usage: result.usage });
      console.log(JSON.stringify({ id: item.id, structuralPass: pass, effects, reply: result.reply }));
    } catch (error) {
      save(`${item.id}.json`, { error: String(error), effects, trace });
      console.log(JSON.stringify({ id: item.id, error: String(error) }));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
