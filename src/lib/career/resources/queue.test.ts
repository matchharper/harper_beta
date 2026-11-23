import assert from "node:assert/strict";
import test from "node:test";
import { careerExecutionEnvironment } from "../executionEnvironment";
import { processResourceJob, publishSourceJob } from "./queue";

const publicCompany = {
  kind: "source" as const,
  scope: "public" as const,
  ownerId: null,
  resourceKind: "company",
  id: "12345",
  revision: "1",
  generation: "2026-11-21T00:00:00.000Z",
};

test("public source jobs are not published while public indexing is paused", async () => {
  assert.deepEqual(await publishSourceJob(publicCompany), { messageId: null });
});

test("a public source job queued before the pause finishes without any work", async () => {
  // Reaching the database would need a Supabase client, which this test does not provide.
  const result = await processResourceJob({
    ...publicCompany,
    executionEnvironment: careerExecutionEnvironment(),
  });
  assert.equal(result, undefined);
});
