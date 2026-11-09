import { config } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
config({ path: ".env.local", quiet: true });
async function main() {
  process.umask(0o077);
  const { buildCareerConversationPromptPlan } = await import("../src/lib/career/prompts/conversationPlan");
  const { renderCareerBackgroundInvocation } = await import("../src/lib/career/background/prompt");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { resolveCareerTextChatModel } = await import("../src/lib/career/textChatModelConfig");
  const complete = process.argv.includes("--complete");
  const root = "docs/evaluation/career-onboarding-continuation";
  const evidence = JSON.parse(readFileSync(`${root}/tool-evidence-v2.json`, "utf8"));
  const cases = JSON.parse(readFileSync(`${root}/cases-v1.json`, "utf8"));
  const dir = `${root}/runs/${Date.now()}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2), { mode: 0o600 });
  const model = resolveCareerTextChatModel();
  save("manifest", { model, complete, sources: Object.fromEntries([`${root}/cases-v1.json`, `${root}/tool-evidence-v2.json`, "src/lib/career/prompts/postOnboardingGuide.ts", "src/lib/career/background/prompt.ts", "src/lib/career/prompts/conversationPlan.ts", "scripts/evalCareerOnboardingContinuation.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])) });
  let label = "", counter = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
    if (!["api.openai.com", "api.anthropic.com"].includes(host)) throw Error(`Blocked non-model destination ${host}`);
    if (init?.body) save(`${label}-request-${++counter}`, JSON.parse(String(init.body)));
    return original(input, init);
  };
  try {
    for (const item of cases) {
      label = item.id; counter = 0;
      const tools = resolveCareerChatTools({ channel: "chat", background: false, isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false }).tools;
      const plan = buildCareerConversationPromptPlan({ channel: "chat", backgroundInvocation: false, isOnboardingDone: true,
        profile: null, structuredProfileText: "Backend engineer, 6 years of Python and PostgreSQL production experience.",
        talentContextSection: "Search Brief: Seoul or remote, backend ownership, full-time, no weekend work. Open to public opportunities.",
        currentPreferences: { preferredLocale: "ko" }, toolNames: tools.map(t => t.function.name),
        postOnboardingContext: item.entry ? { entryOpportunity: { companyName: "Cedar", roleTitle: "백엔드 엔지니어", verifiedActiveRoleId: "00000000-0000-4000-8000-000000000123" } } : null,
        runtimeInstruction: renderCareerBackgroundInvocation({ id: "synthetic", talent_id: "synthetic", conversation_id: "synthetic", status: "handed_off", trigger: "conversation_completed", trigger_payload: {}, created_at: "2026-11-08T03:00:00Z" }),
      });
      save(`${label}-plan`, plan);
      const calls: unknown[] = [];
      let savedRole = false;
      const reply = await runCareerChatAssistant({ ...model, primaryModel: model.model, responseLocale: "ko", systemBlocks: plan.promptBlocks,
        messages: [{ role: "user", content: item.message }], tools,
        stopAfterToolNames: complete ? [] : tools.map(t => t.function.name),
        deadlineAt: Date.now() + 240_000,
        executeTool: async call => {
          calls.push(call);
          if (!complete) return { modelOutput: "Synthetic probe: action observed, not executed." };
          let text: string;
          switch (call.name) {
            case "read_talent_context": text = "Search Brief: Seoul or remote; backend ownership; full-time; no weekend work; public postings welcome. No other Memory facts."; break;
            case "read_profile": text = "Backend engineer, 6 years of Python and PostgreSQL production experience. No other profile facts."; break;
            case "read_talent_activity_events": text = "Onboarding just completed. No earlier applications, sharing or recommendation actions."; break;
            case "search_opportunities":
            case "list_matchings": text = "Matching 00000000-0000-4000-8000-000000000201: completed external search against the current Brief, 13 evaluated open public opportunities; none published. read_matching retrieves the results."; break;
            case "read_matching": text = "Matching 00000000-0000-4000-8000-000000000201 revision 1. Complete evaluated results, no further page. All match the current Brief; Cedar Platform has less backend ownership. No recommendation published.\n" + evidence.map((r: any) => `${r.roleId}: ${r.company} / ${r.title}. ${r.description} URL: ${r.url}`).join("\n"); break;
            case "get_role_context": text = item.entry && JSON.stringify(call.input).includes("000000000123") ? "Role 00000000-0000-4000-8000-000000000123: Cedar / 백엔드 엔지니어, active Harper-connected role. Python, PostgreSQL, backend ownership, Seoul/remote, no weekend work. No introduction or profile sharing has occurred." : evidence.map((r: any) => `${r.roleId}: ${r.company} / ${r.title}. ${r.description} URL: ${r.url}`).join("\n"); break;
            case "read_recommended_opportunities": text = savedRole ? "Cedar Backend Engineer is privately saved. No profile sharing or company contact." : "No existing recommendations or selected proposals; no further page."; break;
            case "apply_to_internal_role": savedRole = true; text = "Receipt: this exact Role is now privately saved for review. No company contact or profile sharing occurred."; break;
            case "upsert_opportunities": text = "Receipt: the requested opportunities are saved in this candidate's opportunity list. No application or company contact occurred."; break;
            case "contact_user": text = "Receipt: message saved in this candidate's chat. Not read by a real user."; break;
            default: throw Error(`No synthetic executor for ${call.name}`);
          }
          return { modelOutput: text };
        },
        usageLabel: "eval:onboarding-continuation",
      });
      save(`${label}-result`, { reply, calls });
      console.log(item.id, JSON.stringify({ reply, calls }));
    }
  } finally { globalThis.fetch = original; }
  console.log(dir);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
