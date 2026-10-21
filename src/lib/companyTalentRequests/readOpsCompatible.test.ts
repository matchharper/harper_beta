import assert from "node:assert/strict";
import { test } from "node:test";
import { readOpsCompatibleContacts } from "./readOpsCompatible";

test("retains the privacy filter whenever the Ops column exists", async () => {
  const calls: boolean[] = [];
  const result = await readOpsCompatibleContacts(async (hasOpsColumn) => {
    calls.push(hasOpsColumn);
    return { data: ["ordinary-contact"], error: null };
  });
  assert.deepEqual(calls, [true]);
  assert.deepEqual(result.data, ["ordinary-contact"]);
});

test("supports the older schema without masking any other failure", async () => {
  const missingColumn = {
    code: "42703",
    message: "column company_talent_requests.ops_only does not exist",
  };
  const calls: boolean[] = [];
  const result = await readOpsCompatibleContacts(async (hasOpsColumn) => {
    calls.push(hasOpsColumn);
    return hasOpsColumn
      ? { data: null, error: missingColumn }
      : { data: ["ordinary-contact"], error: null };
  });
  assert.deepEqual(calls, [true, false]);
  assert.deepEqual(result.data, ["ordinary-contact"]);
  for (const error of [
    { code: "42501", message: "permission denied" },
    {
      code: "42703",
      message: "column company_talent_requests.intent does not exist",
    },
  ]) {
    let count = 0;
    const failure = await readOpsCompatibleContacts(async () => {
      count++;
      return { data: null, error };
    });
    assert.equal(count, 1);
    assert.equal(failure.error, error);
  }
});
