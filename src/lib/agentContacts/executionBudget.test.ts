import assert from "node:assert/strict";
import { test } from "node:test";
import { companyRunUsageJson, createCompanyRunUsage, mergeRunUsage } from "@/lib/llm/runUsage";
import { AgentContactBudgetExhaustedError, remainingRunSeconds } from "./executionBudget";

const attempt = (previous: unknown, minutes: number) =>
  mergeRunUsage(previous, companyRunUsageJson(createCompanyRunUsage(), minutes * 60_000));

// The web marks a run that throws AgentContactBudgetExhaustedError failed
// without another attempt.
test("a run outside a chain gets 25 minutes across all its attempts", () => {
  assert.equal(remainingRunSeconds(null), 25 * 60);
  assert.equal(remainingRunSeconds({}), 25 * 60);
  // The first attempt used 20 minutes and failed: the second gets the 5 left.
  const first = attempt(null, 20);
  assert.equal(remainingRunSeconds(first), 5 * 60);
  // The second used them up: it stops there.
  assert.throws(() => remainingRunSeconds(attempt(first, 5)), AgentContactBudgetExhaustedError);
  // Less than a minute is not enough to start another attempt.
  assert.throws(() => remainingRunSeconds({ elapsedMs: 24.5 * 60_000 }), AgentContactBudgetExhaustedError);
});
