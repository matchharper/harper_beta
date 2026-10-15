import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { buildCompanyUpdatePrompt } from "../src/lib/org/agent/companyUpdate";

async function main() {
  const root = path.resolve(__dirname, "..");
  const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
  const run = process.argv[2];
  if (!run || !/^[a-z0-9-]+$/.test(run)) throw Error("new run ID required");
  const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
  const frozen = JSON.parse(readFileSync(path.join(task, "manifest-v23.json"), "utf8"));
  for (const [file, hash] of Object.entries(frozen.files))
    if (sha(readFileSync(path.join(task, file))) !== hash) throw Error("Frozen input changed");
  const dir = path.join(task, "runs", run);
  mkdirSync(dir, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  config({ path: path.join(root, ".env.local"), quiet: true });
  const realFetch = globalThis.fetch;
  let sequence = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (url.hostname !== "openrouter.ai") throw Error("Non-model network blocked");
    const response = await realFetch(input, init);
    save(`provider-${++sequence}.json`, { request: JSON.parse(init.body), status: response.status, response: await response.clone().text() });
    return response;
  }) as typeof fetch;
  const { generateOrgAgentBackgroundResultReply } = await import("../src/lib/org/agent/chat");
  const sources = ["src/lib/org/agent/companyUpdate.ts", "src/lib/org/agent/companyUpdate.server.ts", "src/lib/org/agent/chat.ts", "src/lib/org/agent/backgroundResultPrompt.ts", "src/lib/org/agent/backgroundResultParts.ts", "src/lib/org/agent/modelConfig.ts"];
  save("manifest.json", { dataset: frozen, sourceHashes: Object.fromEntries(sources.map(file => [file, sha(readFileSync(path.join(root, file)))])), quality: "pending_manual_review" });
  for (const item of JSON.parse(readFileSync(path.join(task, "cases-v23.json"), "utf8"))) {
    const { id, context, ...args } = item;
    const result = await generateOrgAgentBackgroundResultReply({ ...args, resultText: buildCompanyUpdatePrompt(context) });
    save(`${id}.json`, result);
    console.log(JSON.stringify({ id, ...result }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
