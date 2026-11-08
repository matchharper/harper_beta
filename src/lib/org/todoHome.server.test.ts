import assert from "node:assert/strict";
import test from "node:test";
import { isHomeTodoRole, mapWithConcurrency } from "./todo.server";

test("Home reads To-do lines for Roles in progress, paused or being set up, not ended ones", () => {
  for (const status of ["active", "top_priority", "open", "paused", "draft"])
    assert.equal(isHomeTodoRole(status), true, status);
  for (const status of ["ended", "closed", "expired", "deleted"])
    assert.equal(isHomeTodoRole(status), false, status);
});

test("Roles are read a few at a time, in input order", async () => {
  let running = 0;
  let most = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (value) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 11 - value));
    running -= 1;
    return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert.equal(most, 4);
  assert.deepEqual(await mapWithConcurrency([], 4, async (value) => value), []);
});
