/** Model-only preview. Never import a mail sender or touch production state. */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const task = path.resolve("docs/evaluation/company-email-connection");
const runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Supply a fresh run ID");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const input = readFileSync(path.join(task, "cases-v1.json"), "utf8");
const gold = readFileSync(path.join(task, "gold-v1.json"), "utf8");
const frozen = JSON.parse(readFileSync(path.join(task, "manifest-v1.json"), "utf8"));
assert.equal(hash(input), frozen.inputSha256);
assert.equal(hash(gold), frozen.goldSha256);
const dir = path.join(task, "runs", runId);
mkdirSync(path.join(task, "runs"), { recursive: true, mode: 0o700 });
mkdirSync(dir, { mode: 0o700 });
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "preview-no-database";
process.env.RESEND_API_KEY = "preview-no-mail";
const originalFetch = globalThis.fetch;
let providerRequests = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if (!["openrouter.ai", "api.openai.com", "api.anthropic.com"].includes(url.hostname))
    throw Error(`Preview network denied: ${url.hostname}`);
  providerRequests++;
  return originalFetch(input, { ...init, signal: AbortSignal.timeout(90_000) });
};
const save = (name: string, data: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
async function main() {
  const { planSlackConnectionReminder } = await import("../src/lib/email/slackConnectionReminder");
  const { CONNECTION_EMAIL_PURPOSE } = await import("../src/lib/email/companyConnectionDelivery");
  const { composeCompanyUpdateEmail } = await import("../src/lib/org/agent/companyUpdateEmail");
  const { resolveOrgAgentModel, getOrgAgentReasoningEffort } = await import("../src/lib/org/agent/modelConfig");
  const fixture = JSON.parse(input);
  const sources = ["src/lib/email/slackConnectionReminder.ts", "src/lib/email/companyConnectionDelivery.ts", "src/lib/org/agent/companyUpdateEmail.ts", "src/lib/org/agent/companyUpdate.ts", "src/lib/org/agent/prompts.ts", "src/lib/org/agent/modelConfig.ts", "src/lib/org/agent/uxWritingPrompt.ts", "scripts/previewCompanyConnectionEmail.ts"];
  const { model } = resolveOrgAgentModel(undefined);
  save("manifest.json", { ...frozen, runId, createdAt: new Date().toISOString(), companyName: process.argv[3] ?? fixture.workspace.name,
    model, reasoning: getOrgAgentReasoningEffort(model), temperature: 0.5, timeoutMs: 90000,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: true, sources: Object.fromEntries(sources.map(f => [f, hash(readFileSync(f, "utf8"))])), noSend: true, synthetic: true });
  const outputs = [];
  for (const item of fixture.cases) {
    const recipient = { ...fixture.recipient, workspaces: [{ ...fixture.workspace, name: process.argv[3] ?? fixture.workspace.name,
      roles: [{ ...fixture.role, ...item }] }] };
    const plan = planSlackConnectionReminder(recipient, item.receipts, new Date(item.now));
    assert(plan);
    const result = await composeCompanyUpdateEmail({ locale: "ko", facts: plan.facts,
      purpose: CONNECTION_EMAIL_PURPOSE });
    const output = { id: item.id, round: plan.round, ...result };
    save(`${item.id}.json`, output);
    outputs.push(output);
    console.log(JSON.stringify({ id: item.id, round: plan.round, subject: result.subject, body: result.body }, null, 2));
  }
  writeFileSync(path.join(dir, "preview.md"), outputs.map(o => `## ${o.id} (${o.round}회차)\n\n제목: ${o.subject}\n\n${o.body}`).join("\n\n---\n\n"), { mode: 0o600 });
  save("safety.json", { providerRequests, emailSent: 0, databaseAccess: 0, synthetic: true });
  console.log(`Preview saved: ${dir}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
