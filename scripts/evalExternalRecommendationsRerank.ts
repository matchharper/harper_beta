/** Replays final selection against saved inputs/scores/summaries; no DB access. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  rerankCandidates,
  v2CompletionRequest,
} from "../src/lib/externalRecommendationsV2/engine";
import {
  rankScore,
  PROMPT_VERSION,
} from "../src/lib/externalRecommendationsV2/contract";
import { runTalentAssistantCompletion } from "../src/lib/talentOnboarding/llm";
async function main() {
  const source = process.argv.find((v) => v.startsWith("--run="))?.slice(6);
  if (!source) throw new Error("Expected --run=<private pilot run>");
  const output = `docs/evaluation/external-recommendations-v2/runs/rerank-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) =>
    writeFile(`${output}/${name}.json`, JSON.stringify(data, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  const files = await readdir(source);
  const parse = async (name: string) =>
    JSON.parse(await readFile(`${source}/${name}`, "utf8"));
  const sources = ["engine", "prompts", "contract"];
  await save("manifest", {
    source,
    sources: Object.fromEntries(
      await Promise.all(
        sources.map(async (n) => [
          n,
          createHash("sha256")
            .update(await readFile(`src/lib/externalRecommendationsV2/${n}.ts`))
            .digest("hex"),
        ])
      )
    ),
    rubric: "review-rubric-live-v1.json",
    replayed: true,
  });
  for (const resultFile of files
    .filter((f) => f.endsWith("-result.json"))
    .sort()) {
    const prefix = resultFile.replace("-result.json", "");
    const previous = await parse(resultFile);
    const context = (
      await parse(
        files.find(
          (f) => f.startsWith(prefix + "-") && f.endsWith("-context.json")
        )!
      )
    ).context;
    const ranked = await parse(
      files.find(
        (f) => f.startsWith(prefix + "-") && f.endsWith("-ranking.json")
      )!
    );
    if (ranked.some((r: any) => r.fit?.promptVersion !== PROMPT_VERSION))
      throw new Error(
        "Scoring version differs from current runtime. Rescore the frozen input in a new run before reranking; mixed units/old constraint judgments must not be reused."
      );
    const byId = new Map<string, any>(
      ranked.map((r: any) => [r.card.roleId, r.card])
    );
    for (const file of files.filter(
      (f) => f.startsWith(prefix + "-") && f.endsWith("-summaries.json")
    )) {
      const receipt = await parse(file);
      for (const e of JSON.parse(receipt.raw).evaluations) {
        const card = byId.get(e.roleId);
        if (!card) continue;
        card.roleSummary = {
          ...card.roleSummary,
          ko: { content: e.fitSummary },
        };
      }
    }
    for (const r of ranked) r.score = rankScore(r.fit);
    ranked.sort(
      (a: any, b: any) =>
        b.score - a.score || a.card.roleId.localeCompare(b.card.roleId)
    );
    const began = Date.now();
    const selected = await rerankCandidates(
      {
        admin: {} as any,
        userId: "00000000-0000-4000-8000-000000000000",
        surface: "web",
        language: "ko",
        targetCount: 5,
        dryRun: true,
      },
      { ...context, current_search_scope: previous.plan?.plan },
      ranked,
      async (system, input, label) => {
        const request = {
          ...v2CompletionRequest(system, input, label),
          usageLabel: "offline_external_v2:rerank",
        };
        await save(`${prefix}-request`, request);
        let metadata: unknown;
        const raw = await runTalentAssistantCompletion({
          ...request,
          onCompletionMetadata: (v) => {
            metadata = v;
          },
        });
        await save(`${prefix}-receipt`, {
          raw,
          metadata,
          elapsedMs: Date.now() - began,
        });
        return JSON.parse(raw);
      }
    );
    await save(`${prefix}-result`, { selected, elapsedMs: Date.now() - began });
    console.log(
      JSON.stringify({
        case: prefix,
        selected: selected.length,
        elapsedMs: Date.now() - began,
      })
    );
  }
  console.log(`Saved ${output}`);
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Rerank evaluation failed");
  process.exitCode = 1;
});
