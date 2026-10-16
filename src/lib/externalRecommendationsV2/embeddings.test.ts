import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { backfillRoleTitles, drainRoleTitleEmbeddings } from "./embeddings";

type Row = { title_key: string; title: string; embedding: number[] | null };
function database(size: number, writeFailures = 0) {
  const rows: Row[] = Array.from({ length: size }, (_, i) => ({
    title_key: String(i).padStart(6, "0"),
    title: `Role ${i}`,
    embedding: null,
  }));
  const admin = {
    from() {
      let after = "",
        limit = Infinity,
        head = false;
      const query = {
        select(_columns: string, options?: { head?: boolean }) {
          head = !!options?.head;
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        limit(n: number) {
          limit = n;
          return query;
        },
        gt(_key: string, value: string) {
          after = value;
          return query;
        },
        async abortSignal(signal: AbortSignal) {
          signal.throwIfAborted();
          const pending = rows.filter(
            (r) => r.embedding === null && r.title_key > after
          );
          return {
            data: head ? null : pending.slice(0, limit),
            count: pending.length,
            error: null,
          };
        },
      };
      return query;
    },
    rpc(
      _name: string,
      args: {
        p_rows: { titleKey: string; title: string; embedding: number[] }[];
      }
    ) {
      return {
        async abortSignal(signal: AbortSignal) {
          signal.throwIfAborted();
          if (writeFailures-- > 0)
            return { data: null, error: { message: "Transient DB timeout" } };
          let updated = 0;
          for (const entry of args.p_rows) {
            const row = rows.find(
              (r) =>
                r.title_key === entry.titleKey &&
                r.title === entry.title &&
                r.embedding === null
            );
            if (row) {
              row.embedding = entry.embedding;
              updated++;
            }
          }
          return { data: updated, error: null };
        },
      };
    },
  };
  return { rows, admin: admin as any };
}
function provider(
  t: TestContext,
  reject?: (titles: string[]) => number | undefined
) {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  const calls: string[][] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      const titles = JSON.parse(String(options.body)).input as string[];
      calls.push(titles);
      const status = reject?.(titles);
      if (status) return new Response("{}", { status });
      return new Response(
        JSON.stringify({
          data: titles.map((_title, index) => ({
            index,
            embedding: Array.from({ length: 1536 }, (_, i) =>
              i === 0 ? 1 : 0
            ),
          })),
          usage: {},
        })
      );
    }
  );
  return calls;
}

test("drain processes multiple pages and leaves no pending titles", async (t) => {
  const { admin } = database(1100);
  provider(t);
  const result = await drainRoleTitleEmbeddings(admin);
  assert.equal(result.updated, 1100);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.errors, []);
});

test("invalid title is isolated; later pages finish and the failed title remains retryable", async (t) => {
  const { admin, rows } = database(1001);
  provider(t, (titles) => (titles.includes("Role 0") ? 400 : undefined));
  const result = await drainRoleTitleEmbeddings(admin);
  assert.equal(result.updated, 1000);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(rows[0].embedding, null);
  assert.ok(rows[1000].embedding);
  t.mock.restoreAll();
  provider(t);
  assert.equal((await drainRoleTitleEmbeddings(admin)).remaining, 0);
});

test("rate limits retry; DB write retries reuse generated vectors", async (t) => {
  const { admin } = database(2, 1);
  let attempts = 0;
  const calls = provider(t, () => (attempts++ === 0 ? 429 : undefined));
  const result = await backfillRoleTitles(admin);
  assert.equal(result.updated, 2);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 2);
});

test("expired budget leaves work pending without starting another API call", async (t) => {
  const { admin } = database(2);
  const calls = provider(t);
  const result = await drainRoleTitleEmbeddings(admin, {
    signal: AbortSignal.abort(),
  });
  assert.equal(result.budgetExhausted, true);
  assert.equal(result.remaining, 2);
  assert.equal(calls.length, 0);
});
