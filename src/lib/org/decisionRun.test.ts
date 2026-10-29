import assert from "node:assert/strict";
import test from "node:test";
import { namesForToast, runEach } from "./decisionRun";

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

test("a toast names three candidates and counts the rest", () => {
  const more = (n: number) => `외 ${n}명`;
  assert.equal(namesForToast(["가", "나"], more), "가, 나");
  assert.equal(
    namesForToast(["가", "나", "다", "라", "마"], more),
    "가, 나, 다 외 2명"
  );
});
