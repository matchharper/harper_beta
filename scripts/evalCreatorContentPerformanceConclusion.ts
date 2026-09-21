import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildContentPerformanceConclusionMessages,
  type ContentPerformanceConclusionInput,
} from "@/lib/contentsEngine/performanceConclusionContract";

type Fixture = {
  datasetVersion: string;
  cases: Array<{
    gold: { rating: string };
    id: string;
    input: ContentPerformanceConclusionInput;
  }>;
};

async function main() {
  const root = process.cwd();
  const fixturePath = path.join(
    root,
    "docs/evaluation/creator-content-performance-conclusion/gold-v1.json"
  );
  const raw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(raw) as Fixture;
  const dryRun = process.argv.includes("--dry-run");
  if (
    !fixture.cases.length ||
    new Set(fixture.cases.map((item) => item.id)).size !== fixture.cases.length
  ) {
    throw new Error("Performance conclusion fixture needs unique cases");
  }
  for (const item of fixture.cases) {
    const messages = buildContentPerformanceConclusionMessages(item.input);
    if (messages.length !== 2 || !messages[1].content.includes(item.input.title)) {
      throw new Error(`Production prompt builder omitted ${item.id}`);
    }
  }
  const fixtureSha256 = createHash("sha256").update(raw).digest("hex");
  if (dryRun) {
    console.log(
      JSON.stringify({
        caseCount: fixture.cases.length,
        datasetVersion: fixture.datasetVersion,
        fixtureSha256,
        ok: true,
      })
    );
    return;
  }

  const { concludeContentPerformance } = await import(
    "@/lib/contentsEngine/performanceConclusion"
  );
  const startedAt = new Date();
  const results = [];
  for (const item of fixture.cases) {
    const output = await concludeContentPerformance(item.input, {
      logUsage: false,
    });
    results.push({
      gold: item.gold,
      id: item.id,
      output,
      ratingCorrect: output.rating === item.gold.rating,
    });
  }
  const stamp = startedAt.toISOString().replace(/[:.]/g, "");
  const runDir = path.join(
    root,
    "docs/evaluation/creator-content-performance-conclusion/runs",
    stamp
  );
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const summary = {
    caseCount: results.length,
    createdAt: startedAt.toISOString(),
    datasetVersion: fixture.datasetVersion,
    fixtureSha256,
    ratingCorrect: results.filter((item) => item.ratingCorrect).length,
    structureValid: results.length,
  };
  await writeFile(
    path.join(runDir, "result.json"),
    JSON.stringify({ summary, results }, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(summary));
  if (summary.ratingCorrect !== summary.caseCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
