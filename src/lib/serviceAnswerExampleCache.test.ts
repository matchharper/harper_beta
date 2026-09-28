import assert from "node:assert/strict";
import test from "node:test";
import {
  ANSWER_EXAMPLE_CACHE_TTL_MS,
  createAnswerExampleCache,
  matchCachedAnswerExamples,
  type AnswerExampleRow,
} from "./serviceAnswerExampleCache";

const row = (id: string, embedding: number[] = [1, 0]): AnswerExampleRow => ({
  id,
  embedding: JSON.stringify(embedding),
  answer_example_text: `Answer ${id}`,
  user_example_text: `Question ${id}`,
  tags: ["example"],
  updated_at: "2026-09-28T00:00:00+00:00",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("fixed TTL starts at DB read, is not extended by hits, and replaces edited/deleted rows", async () => {
  let now = 1_000;
  let reads = 0;
  const cache = createAnswerExampleCache(
    async () => {
      reads++;
      now += 1_000; // Time spent reading must not extend the freshness window.
      return reads === 1
        ? [row("edited"), row("deleted"), row("disabled")]
        : [
            { ...row("edited"), answer_example_text: "Updated answer" },
            row("new"),
          ];
    },
    () => now
  );
  const first = await cache.get("company");
  assert.equal(first.cacheStatus, "miss");
  assert.equal(first.expiresAt, 31_000);
  now = 30_999;
  const hit = await cache.get("company");
  assert.equal(hit.cacheStatus, "hit");
  assert.equal(hit.expiresAt, first.expiresAt);
  assert.equal(reads, 1);
  now = 31_000;
  const refreshed = await cache.get("company");
  assert.equal(refreshed.cacheStatus, "refresh");
  assert.deepEqual(
    refreshed.examples.map((e) => e.example.id),
    ["edited", "new"]
  );
  assert.equal(
    refreshed.examples[0].example.answer_example_text,
    "Updated answer"
  );
  assert.equal(reads, 2);
});

test("concurrent web/Slack lookups share each cold or expired load in an instance", async () => {
  let now = 0;
  let reads = 0;
  let loading = deferred<AnswerExampleRow[]>();
  const cache = createAnswerExampleCache(
    () => {
      reads++;
      return loading.promise;
    },
    () => now
  );
  const web = cache.get("company");
  const slack = cache.get("company");
  assert.equal(reads, 1);
  loading.resolve([row("initial")]);
  assert.equal((await web).cacheStatus, "miss");
  assert.equal((await slack).cacheStatus, "shared");

  now = ANSWER_EXAMPLE_CACHE_TTL_MS;
  loading = deferred<AnswerExampleRow[]>();
  const one = cache.get("company");
  const two = cache.get("company");
  assert.equal(reads, 2);
  loading.resolve([row("replacement")]);
  assert.equal((await one).cacheStatus, "refresh");
  assert.equal((await two).examples[0].example.id, "replacement");
});

test("failed refresh rejects all waiters, drops stale data and permits a later retry", async () => {
  let now = 0;
  let reads = 0;
  const failure = deferred<AnswerExampleRow[]>();
  const cache = createAnswerExampleCache(
    async () => {
      reads++;
      if (reads === 2) return failure.promise;
      return [row(reads === 1 ? "old" : "recovered")];
    },
    () => now
  );
  await cache.get("company");
  now = ANSWER_EXAMPLE_CACHE_TTL_MS;
  const one = cache.get("company");
  const two = cache.get("company");
  const checks = Promise.all([
    assert.rejects(one, /unavailable/),
    assert.rejects(two, /unavailable/),
  ]);
  failure.reject(new Error("unavailable"));
  await checks;
  const recovered = await cache.get("company");
  assert.equal(recovered.cacheStatus, "miss");
  assert.equal(recovered.examples[0].example.id, "recovered");
  assert.equal(reads, 3);
});

test("empty snapshots are cached and audiences/instances stay isolated", async () => {
  const calls: string[] = [];
  const load = async (audience: string) => {
    calls.push(audience);
    return audience === "company" ? [] : [row("career")];
  };
  const first = createAnswerExampleCache(load);
  const second = createAnswerExampleCache(load);
  assert.deepEqual((await first.get("company")).examples, []);
  assert.equal((await first.get("company")).cacheStatus, "hit");
  assert.equal((await first.get("career")).examples[0].example.id, "career");
  assert.equal((await second.get("company")).cacheStatus, "miss");
  assert.deepEqual(calls, ["company", "career", "company"]);
});

test("a load that outlives freshness and invalid vectors never become cached snapshots", async () => {
  let now = 0;
  const slow = createAnswerExampleCache(
    async () => {
      now += ANSWER_EXAMPLE_CACHE_TTL_MS;
      return [row("old")];
    },
    () => now
  );
  await assert.rejects(slow.get("company"), /expired while loading/);
  let reads = 0;
  const invalid = createAnswerExampleCache(async () => {
    reads++;
    return [{ ...row("bad"), embedding: "[null, 1]" }];
  });
  await assert.rejects(invalid.get("company"), /Invalid.*vector/);
  await assert.rejects(invalid.get("company"), /Invalid.*vector/);
  assert.equal(reads, 2);
});

test("cosine matching preserves threshold, topK and sub-millisecond recency ties", async () => {
  const cache = createAnswerExampleCache(async () => [
    { ...row("old", [10, 0]), updated_at: "2026-09-28T00:00:00.123001+00:00" },
    { ...row("new", [2, 0]), updated_at: "2026-09-28T00:00:00.123002+00:00" },
    row("partial", [3, 4]),
    row("orthogonal", [0, 1]),
    row("opposite", [-1, 0]),
    row("zero", [0, 0]),
  ]);
  const { examples } = await cache.get("company");
  const result = matchCachedAnswerExamples(examples, [3, 0], {
    minScore: 0.35,
    topK: 3,
  });
  assert.deepEqual(
    result.map((e) => e.id),
    ["new", "old", "partial"]
  );
  assert.equal(result[0].score, 1);
  assert.equal(result[2].score, 0.6);
  assert.deepEqual(
    matchCachedAnswerExamples(examples, [1, 0], {
      minScore: 0.6,
      topK: 10,
    }).map((e) => e.id),
    ["new", "old", "partial"]
  );
  assert.equal(
    matchCachedAnswerExamples(examples, [1, 0], { minScore: 0.61, topK: 10 })
      .length,
    2
  );
  assert.equal(
    matchCachedAnswerExamples(examples, [1, 0], { minScore: 0, topK: 1 })
      .length,
    1
  );
  result[0].tags.push("mutated");
  assert.deepEqual(
    matchCachedAnswerExamples(examples, [1, 0], { minScore: 0, topK: 1 })[0]
      .tags,
    ["example"]
  );
  assert.deepEqual(
    matchCachedAnswerExamples(examples, [0, 0], { minScore: 0, topK: 3 }),
    []
  );
  assert.throws(
    () => matchCachedAnswerExamples(examples, [1], { minScore: 0, topK: 3 }),
    /dimensions/
  );
});
