import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";

async function main() {
  const { evaluateResource, buildResourceDecisionRequest, criteriaSchema } =
    await import("../src/lib/career/resources/evaluate");
  const { fitProvider } =
    await import("../src/lib/externalRecommendationsV2/contract");
  const { directUsageCost } =
    await import("../src/lib/externalRecommendationsV2/usage");
  const root = "docs/evaluation/career-agent-autonomy",
    bytes = readFileSync(`${root}/cases-v10.json`);
  const frozen = JSON.parse(bytes.toString()),
    scenario = frozen.cases[0];
  const input = {
    resource: scenario.resources[0],
    context: [],
    asOf: frozen.requestTime,
    criteria: criteriaSchema.parse([
      {
        name: "sponsorship",
        type: "predicate",
        instructions:
          "The supplied public note explicitly offers Singapore work-pass sponsorship.",
      },
      {
        name: "pnl",
        type: "choice",
        instructions: "How does the note describe P&L ownership?",
        choices: [
          { value: "guaranteed" },
          { value: "possible_progression" },
          { value: "not_mentioned" },
        ],
      },
      {
        name: "operating_scope",
        type: "score",
        instructions:
          "How much operating responsibility is explicitly described?",
        levels: [
          { label: "none", description: "Only advisory work." },
          {
            label: "execution",
            description: "Hands-on execution without team ownership.",
          },
          { label: "team", description: "Own operations and build a team." },
        ],
      },
    ]),
  };
  const provider = fitProvider(),
    request = buildResourceDecisionRequest({ ...input, provider });
  const output = `${root}/runs/${new Date().toISOString().replaceAll(":", "-")}-resource-decisions-contract`;
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  save("manifest", {
    purpose:
      "Provider execution contract probe, not a recommendation quality evaluation",
    provider,
    frozenSourceHash: createHash("sha256").update(bytes).digest("hex"),
    requestHash: createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex"),
    criteriaContract:
      "One complete typed answer per declared criterion; no qualitative score threshold.",
  });
  save("input", input);
  save("request", request);
  const fetchBefore = globalThis.fetch;
  const responses: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    if (
      ![
        "https://api.openai.com/v1/decisions",
        "https://openrouter.ai/api/alpha/decisions",
      ].includes(String(url))
    )
      throw new Error("Unexpected probe network destination");
    const response = await fetchBefore(url, init),
      body = await response.clone().text();
    responses.push({ status: response.status, body });
    save("responses", responses);
    return response;
  };
  try {
    const result = await evaluateResource(input);
    save("result", {
      ...result,
      cost: directUsageCost(
        provider === "openai" ? "openai_decisions" : "jev_decisions",
        result.usage
      ),
    });
    console.log(
      JSON.stringify({
        output,
        provider,
        evaluations: result.evaluations,
        usage: result.usage,
      })
    );
  } catch (error) {
    save("error", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    globalThis.fetch = fetchBefore;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
