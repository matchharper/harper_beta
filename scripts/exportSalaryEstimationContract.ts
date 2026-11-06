// Export the existing production contract for the standalone Python collector.
// Run with: node --require ./scripts/lib/serverOnlyTestPreload.cjs --import tsx scripts/exportSalaryEstimationContract.ts
import { writeFileSync } from "node:fs";
import {
  productionSalaryRequest,
  SALARY_ESTIMATION_VERSION,
} from "../src/lib/externalRecommendationsV2/salaryEstimation.server";
import prompts from "../src/lib/ops/roleSalaryEstimation.prompts.json";
import fx from "../src/lib/externalRecommendationsV2/salaryFx.json";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";

// Same $1 conservative per-call reserve as estimateSalaryBatch. Split before a
// paid request rather than clipping a JD or retrying a billed oversized call.
let lower = 0,
  upper = 1;
const reserve = (bytes: number) =>
  directUsageCost("openai_decisions", { input_tokens: (bytes + 8192) * 10 })
    .usd!;
while (reserve(upper) <= 1) upper *= 2;
while (upper - lower > 1) {
  const middle = Math.floor((upper + lower) / 2);
  if (reserve(middle) <= 1) lower = middle;
  else upper = middle;
}

const role = {
  id: "contract",
  title: "",
  company: "",
  location: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
};
const contract = {
  version: SALARY_ESTIMATION_VERSION,
  model: prompts.model,
  fx,
  maxRequestBytes: lower,
  contracts: Object.fromEntries(
    ["US", "JP"].map((country) => [
      country === "US" ? "us" : "global",
      productionSalaryRequest([{ ...role, country }]).contract,
    ])
  ),
};
writeFileSync(
  new URL(
    "../../data_sc/jobpostings/salary_estimation_contract.json",
    import.meta.url
  ),
  JSON.stringify(contract, null, 2) + "\n"
);
