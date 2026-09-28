import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { lookupAnswerExamples } from "./serviceAnswerExamples";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function rows(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: `fixture-${i}`,
    user_example_text: `Question ${i}`,
    answer_example_text: `Answer ${i}`,
    tags: [],
    embedding: "[1,0]",
    updated_at: `2026-09-28T00:00:0${i % 10}+00:00`,
  }));
}

function fixtureAdmin(fetch: typeof globalThis.fetch) {
  return createClient<Database>("https://example.invalid", "fixture-only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
}

async function mockEmbedding(
  t: TestContext,
  embed: (
    input: string,
    signal: AbortSignal
  ) => Promise<number[]> = async () => [1, 0]
) {
  process.env.OPENAI_API_KEY ??= "fixture-only";
  const { client } = await import("./llm/llm");
  t.mock.method(console, "info", () => {});
  t.mock.method(console, "error", () => {});
  return t.mock.method(
    client.embeddings,
    "create",
    async (
      body: { input: string },
      options: { signal: AbortSignal; maxRetries: number }
    ) => {
      assert.equal(options.maxRetries, 0);
      return { data: [{ embedding: await embed(body.input, options.signal) }] };
    }
  );
}

test("cold DB loading and embedding run in parallel; later questions reuse the snapshot and still return only top 3", async (t) => {
  const db = deferred<Response>();
  const embeddingStarted = deferred<void>();
  const embed = await mockEmbedding(t, async () => {
    embeddingStarted.resolve();
    return [1, 0];
  });
  const urls: URL[] = [];
  const admin = fixtureAdmin(async (input) => {
    urls.push(new URL(String(input)));
    return db.promise;
  });
  const pending = lookupAnswerExamples("First question", {
    admin,
    audience: "company",
  });
  await embeddingStarted.promise;
  assert.equal(urls.length, 1, "DB request started before embedding completed");
  assert.equal(urls[0].pathname, "/rest/v1/service_answer_examples");
  assert.equal(urls[0].searchParams.get("audience"), "eq.company");
  assert.equal(urls[0].searchParams.get("enabled"), "eq.true");
  assert.equal(
    urls[0].searchParams.get("embedding_model"),
    "eq.text-embedding-3-small"
  );
  db.resolve(Response.json(rows()));
  assert.deepEqual(
    (await pending).examples.map((e) => e.id),
    ["fixture-3", "fixture-2", "fixture-1"]
  );
  const second = await lookupAnswerExamples("Different question", {
    admin,
    audience: "company",
  });
  assert.equal(second.examples.length, 3);
  assert.equal(urls.length, 1);
  assert.equal(
    embed.mock.callCount(),
    2,
    "Only common examples, never conversation-specific results, are reused"
  );
});

test("snapshot fetch includes later pages so new examples are not silently dropped", async (t) => {
  await mockEmbedding(t);
  const examples = rows(501).map((r, i) => ({
    ...r,
    embedding: i === 500 ? "[1,0]" : "[0,1]",
  }));
  const offsets: number[] = [];
  const admin = fixtureAdmin(async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    return Response.json(
      examples.slice(offset, offset + Number(url.searchParams.get("limit")))
    );
  });
  const result = await lookupAnswerExamples("Question", {
    admin,
    audience: "company",
  });
  assert.deepEqual(
    result.examples.map((e) => e.id),
    ["fixture-500"]
  );
  assert.deepEqual(offsets, [0, 500]);
});

test("supplied clients and audiences cannot reuse another client's snapshot", async (t) => {
  await mockEmbedding(t);
  let firstReads = 0;
  let secondReads = 0;
  const first = fixtureAdmin(async () => {
    firstReads++;
    return Response.json(rows(1));
  });
  const second = fixtureAdmin(async () => {
    secondReads++;
    return Response.json([]);
  });
  assert.equal(
    (
      await lookupAnswerExamples("Question", {
        admin: first,
        audience: "company",
      })
    ).examples.length,
    1
  );
  assert.equal(
    (
      await lookupAnswerExamples("Question", {
        admin: second,
        audience: "company",
      })
    ).examples.length,
    0
  );
  await lookupAnswerExamples("Question", { admin: first, audience: "career" });
  assert.equal(firstReads, 2);
  assert.equal(secondReads, 1);
});

test(
  "one timed-out lookup aborts its embedding without cancelling another lookup's shared DB load",
  { timeout: 3_000 },
  async (t) => {
    const db = deferred<Response>();
    let slowSignal: AbortSignal | undefined;
    let dbSignal: AbortSignal | null | undefined;
    let reads = 0;
    await mockEmbedding(t, async (input, signal) => {
      if (input === "slow") {
        slowSignal = signal;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        );
      }
      return [1, 0];
    });
    const warn = t.mock.method(console, "warn", () => {});
    const admin = fixtureAdmin(async (_input, init) => {
      reads++;
      dbSignal = init?.signal;
      return db.promise;
    });
    const short = lookupAnswerExamples("slow", {
      admin,
      audience: "company",
      timeoutMs: 250,
    });
    const long = lookupAnswerExamples("fast", {
      admin,
      audience: "company",
      timeoutMs: 1_500,
    });
    const timedOut = await short;
    assert.deepEqual(timedOut.examples, []);
    assert.match(timedOut.assistantInstruction, /timed out/);
    assert.equal(slowSignal?.aborted, true);
    assert.equal(dbSignal?.aborted, false);
    db.resolve(Response.json(rows()));
    assert.equal((await long).examples.length, 3);
    assert.equal(reads, 1);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(
      (await lookupAnswerExamples("next", { admin, audience: "company" }))
        .examples.length,
      3
    );
    assert.equal(reads, 1);
  }
);

test("DB failures return no examples, abort the embedding and allow a fresh retry", async (t) => {
  const db = deferred<Response>();
  const embeddingStarted = deferred<void>();
  let embeddingSignal: AbortSignal | undefined;
  let reads = 0;
  await mockEmbedding(t, async (input, signal) => {
    if (input === "first") {
      embeddingSignal = signal;
      embeddingStarted.resolve();
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        })
      );
    }
    return [1, 0];
  });
  const admin = fixtureAdmin(async () => {
    reads++;
    return reads === 1 ? db.promise : Response.json(rows(1));
  });
  const pending = lookupAnswerExamples("first", { admin, audience: "company" });
  await embeddingStarted.promise;
  db.resolve(Response.json({ message: "Unavailable" }, { status: 503 }));
  assert.deepEqual((await pending).examples, []);
  assert.equal(embeddingSignal?.aborted, true);
  assert.equal(
    (await lookupAnswerExamples("retry", { admin, audience: "company" }))
      .examples.length,
    1
  );
  assert.equal(reads, 2);
});

test("empty questions do not load examples or call embedding", async (t) => {
  const embed = await mockEmbedding(t);
  const admin = fixtureAdmin(async () => {
    throw new Error("Unexpected database access");
  });
  const result = await lookupAnswerExamples(" \n ", {
    admin,
    audience: "company",
  });
  assert.deepEqual(result.examples, []);
  assert.equal(embed.mock.callCount(), 0);
});
