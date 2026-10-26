import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const run = process.argv[2];
if (!run || !/^[\w-]+$/.test(run)) throw Error("fresh run ID required");
const dir = `docs/evaluation/role-start-discovery/runs/${run}`;
mkdirSync(dir, { recursive: false, mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function main() {
 const { callRoleStartJson, ROLE_START_DRAFT_MODEL } = await import("../src/lib/org/roleStart/llm");
 const { buildDraftSystemPrompt, DRAFT_SCHEMA } = await import("../src/lib/org/roleStart/prompts");
 const { formatPromptText } = await import("../src/lib/llm/promptText");
 const { getLlmChatProviderForModel } = await import("../src/lib/llm/llm");
 const provider = getLlmChatProviderForModel(ROLE_START_DRAFT_MODEL);
 const host = {openai:"api.openai.com",openrouter:"openrouter.ai",anthropic:"api.anthropic.com"}[provider];
 const original = globalThis.fetch;
 globalThis.fetch = async (input: any, init?: any) => {
   if (new URL(typeof input === "string" ? input : input.url ?? String(input)).hostname !== host) throw Error("non-provider network blocked");
   return original(input, { ...init, signal: AbortSignal.timeout(120000) });
 };
 const raw = readFileSync("docs/evaluation/role-start-discovery/cases-v1.json", "utf8");
 const gold = readFileSync("docs/evaluation/role-start-discovery/gold-v1.md", "utf8");
 const frozen = JSON.parse(readFileSync("docs/evaluation/role-start-discovery/manifest-v1.json", "utf8"));
 if (hash(raw) !== frozen.inputSha256 || hash(gold) !== frozen.goldSha256) throw Error("Frozen input/gold hash mismatch");
 const system = buildDraftSystemPrompt();
 save("manifest", { dataset:"v1", run, createdAt:new Date().toISOString(), model:ROLE_START_DRAFT_MODEL,provider,reasoning:"medium", inputHash:hash(raw),goldHash:hash(gold),promptHash:hash(system),sourceHashes:Object.fromEntries(["src/lib/llm/promptText.ts","src/lib/org/roleStart/prompts.ts","src/lib/org/roleStart/llm.ts"].map(p=>[p,hash(readFileSync(p,"utf8"))])) });
 for (const item of JSON.parse(raw)) {
   const result = await callRoleStartJson<any>({label:"rubric_draft",system,user:`<ROLE_SOURCE>\n${formatPromptText(item.source)}\n</ROLE_SOURCE>`,schema:DRAFT_SCHEMA,reasoningEffort:"medium",maxOutputTokens:6000});
   save(item.id,result);
   console.log(item.id,JSON.stringify({questions:result.data.questions,criteria:result.data.criteria.map((c:any)=>({name:c.name,importance:c.importance}))}));
 }
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; });
