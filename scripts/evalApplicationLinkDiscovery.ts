import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { applicationDiscoveryCases } from "../src/lib/ops/applicationDiscoveryCases";
import { runResolvedInspectionDebug } from "../src/lib/ops/applicationLinkResolution.server";
import type { InspectionStreamEvent } from "../src/lib/ops/applicationFormInspection";

async function main() {
  const requested = process.argv.slice(2);
  const cases = requested.length
    ? applicationDiscoveryCases.filter((item) => requested.includes(item.id))
    : applicationDiscoveryCases;
  if (!cases.length) throw new Error("Unknown case");
  const datasetVersions = [...new Set(cases.map((item) => item.datasetVersion))];
  const base = `docs/evaluation/application-link-discovery/runs/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const write = (name: string, value: unknown) =>
    fs.writeFile(`${base}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const paths = [
    "src/lib/ops/applicationDiscoveryCases.ts",
    "src/lib/ops/applicationLinkResolution.server.ts",
    "src/lib/ops/applicationFormInspection.ts",
    "src/lib/ops/applicationQuestionsAgents.server.ts",
    "src/lib/career/simulation/applicationFormText.ts",
    "src/lib/career/simulation/applicationStagehand/inspectionText.mjs",
    ...datasetVersions.map(
      (version) => `docs/evaluation/application-link-discovery/gold-${version}.json`
    ),
    "scripts/evalApplicationLinkDiscovery.ts",
  ];
  await write("manifest", {
    datasetVersions,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [
          path,
          createHash("sha256")
            .update(await fs.readFile(path))
            .digest("hex"),
        ])
      )
    ),
    model: "gpt-6-luna",
    reasoning: "medium",
    provider: "OpenAI Responses + Exa + Browser-use V4",
    timeoutMs: 240000,
    cases,
    readOnly: true,
  });
  console.log(`Run: ${base}`);
  await Promise.all(
    cases.map(async (item) => {
      const events: InspectionStreamEvent[] = [];
      const started = Date.now();
      try {
        const result = await runResolvedInspectionDebug(
          item.source,
          AbortSignal.timeout(240000),
          (event) => {
            events.push(event);
            if (
              event.type === "log" &&
              [
                "search_start",
                "browser_start",
                "tool_error",
                "link_selected",
              ].includes(event.event.kind)
            )
              console.log(item.id, event.event.kind, event.event.message);
          }
        );
        await write(item.id, { result, events });
        console.log(
          JSON.stringify({
            case: item.id,
            seconds: result.durationMs / 1000,
            url: result.form.url,
            status: result.form.status,
            access: result.form.submission?.status,
            fields: result.form.fields.length,
            searches: result.resolution?.searches.length,
            attempts: result.resolution?.attempts.length,
            limitations: result.form.limitations,
          })
        );
      } catch (error) {
        await write(item.id, {
          error: error instanceof Error ? error.message : String(error),
          seconds: (Date.now() - started) / 1000,
          events,
        });
        console.log(
          item.id,
          "FAILED",
          error instanceof Error ? error.message : String(error)
        );
        process.exitCode = 1;
      }
    })
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
