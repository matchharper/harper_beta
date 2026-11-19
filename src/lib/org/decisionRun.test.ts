import assert from "node:assert/strict";
import test from "node:test";
import { runEach } from "./decisionRun";

test("a batch keeps which candidates failed and which came back unchanged", async () => {
  const outcome = await runEach(["a", "b", "c", "d"], async (id) => {
    if (id === "b") throw new Error("409");
    // Already moving, needs a check or no access: nothing changed.
    if (id === "c") return null;
    if (id === "d") return undefined;
    return { stage: "connected" };
  });
  assert.deepEqual(
    outcome.failures.map((failure) => failure.item),
    ["b"]
  );
  assert.deepEqual(outcome.unchanged.sort(), ["c", "d"]);
});

test("at most three decisions run at once", async () => {
  let running = 0;
  let most = 0;
  await runEach([1, 2, 3, 4, 5, 6, 7], async () => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running -= 1;
    return true;
  });
  assert.equal(most, 3);
});
