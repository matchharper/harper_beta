import { collectPublishedContentMetrics } from "../../src/lib/contentsEngine/contentMetrics";

async function main() {
  const limit = Number(process.argv[2] ?? 50);
  const result = await collectPublishedContentMetrics({ limit });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
