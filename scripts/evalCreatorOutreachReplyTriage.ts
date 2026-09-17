import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildOutreachReplyTriageMessages,
  type OutreachReplyTriageInput,
} from "@/lib/contentsEngine/replyTriageContract";

type Fixture = {
  datasetVersion: string;
  cases: Array<{
    gold: { mentionedUrls: string[]; type: string };
    id: string;
    input: OutreachReplyTriageInput;
  }>;
};

async function main() {
  const root = process.cwd();
  const fixturePath = path.join(
    root,
    "docs/evaluation/creator-outreach-reply-triage/gold-v2.json"
  );
  const raw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(raw) as Fixture;
  const dryRun = process.argv.includes("--dry-run");

  if (!fixture.cases.length || new Set(fixture.cases.map((item) => item.id)).size !== fixture.cases.length) {
    throw new Error("Reply triage fixture needs unique cases");
  }
  for (const item of fixture.cases) {
    const messages = buildOutreachReplyTriageMessages(item.input);
    if (messages.length !== 2 || !messages[1].content.includes(item.input.replyBody)) {
      throw new Error(`Production prompt builder omitted ${item.id}`);
    }
  }

  if (dryRun) {
    console.log(
      JSON.stringify({
        caseCount: fixture.cases.length,
        datasetVersion: fixture.datasetVersion,
        fixtureSha256: createHash("sha256").update(raw).digest("hex"),
        ok: true,
      })
    );
    return;
  }

  const { classifyOutreachReply } = await import(
    "@/lib/contentsEngine/replyTriage"
  );
  const startedAt = new Date();
  const results = [];
  for (const item of fixture.cases) {
    const output = await classifyOutreachReply(item.input, { logUsage: false });
    results.push({
      gold: item.gold,
      id: item.id,
      output,
      typeCorrect: output.type === item.gold.type,
      urlsCorrect:
        JSON.stringify([...output.mentionedUrls].sort()) ===
        JSON.stringify([...item.gold.mentionedUrls].sort()),
    });
  }
  const stamp = startedAt.toISOString().replace(/[:.]/g, "");
  const runDir = path.join(
    root,
    "docs/evaluation/creator-outreach-reply-triage/runs",
    stamp
  );
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const summary = {
    caseCount: results.length,
    createdAt: startedAt.toISOString(),
    datasetVersion: fixture.datasetVersion,
    fixtureSha256: createHash("sha256").update(raw).digest("hex"),
    typeCorrect: results.filter((item) => item.typeCorrect).length,
    urlsCorrect: results.filter((item) => item.urlsCorrect).length,
  };
  await writeFile(
    path.join(runDir, "result.json"),
    JSON.stringify({ summary, results }, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
