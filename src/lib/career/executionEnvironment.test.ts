import assert from "node:assert/strict";
import test from "node:test";
import { careerExecutionEnvironment } from "./executionEnvironment";

test("local Next execution stays isolated even with pulled production environment variables", () => {
  const local = careerExecutionEnvironment({ NODE_ENV: "development", VERCEL_ENV: "production" });
  assert.match(local, /^development:/);
  assert.equal(local, careerExecutionEnvironment({ NODE_ENV: "development" }));
  assert.equal(careerExecutionEnvironment({ NODE_ENV: "production", VERCEL_ENV: "production" }), "production");
  assert.notEqual(careerExecutionEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "a" }),
    careerExecutionEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "b" }));
});
