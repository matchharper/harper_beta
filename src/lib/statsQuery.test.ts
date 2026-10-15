import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllStatsRows } from "@/lib/statsQuery";

test("stats reads retry a timed-out page without duplicating prior rows", async (t) => {
  t.mock.method(console, "warn", () => {});
  const firstPage = Array.from({ length: 1_000 }, (_, id) => ({ id }));
  const ranges: number[] = [];
  let secondPageAttempts = 0;
  const rows = await fetchAllStatsRows(async (from) => {
    ranges.push(from);
    if (from === 0) return { data: firstPage, error: null };
    if (secondPageAttempts++ === 0) {
      return {
        data: null,
        error: { code: "57014", message: "statement timeout" },
      };
    }
    return { data: [{ id: 1_000 }], error: null };
  });

  assert.deepEqual(ranges, [0, 1_000, 1_000]);
  assert.equal(rows.length, 1_001);
  assert.equal(new Set(rows.map((row) => row.id)).size, 1_001);
});

test("stats reads stop after three transient failures instead of reporting zeros", async (t) => {
  t.mock.method(console, "warn", () => {});
  let attempts = 0;
  await assert.rejects(
    fetchAllStatsRows(
      async () => {
        attempts += 1;
        return {
          data: null,
          error: { code: "57014", message: "statement timeout" },
        };
      },
      "logs:tool_failure"
    ),
    /Stats query failed \(57014\), logs:tool_failure.*statement timeout/
  );
  assert.equal(attempts, 3);
});

test("stats reads do not retry schema, authorization, or business errors", async () => {
  for (const code of ["42703", "42501", "40001", undefined]) {
    let attempts = 0;
    await assert.rejects(
      fetchAllStatsRows(async () => {
        attempts += 1;
        return { data: null, error: { code, message: "permanent failure" } };
      }),
      /permanent failure/
    );
    assert.equal(attempts, 1);
  }
});

test("parallel reports share a maximum of six active reads", async () => {
  let active = 0;
  let peak = 0;
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, id) =>
      fetchAllStatsRows(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return { data: [{ id }], error: null };
      })
    )
  );
  assert.equal(peak, 6);
  assert.equal(active, 0);
  assert.equal(results.flat().length, 30);
});

test("thrown reads release their slots so waiting reports can finish", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 18 }, (_, id) =>
      fetchAllStatsRows(async () => {
        if (id < 6) throw new Error("transport failed");
        return { data: [{ id }], error: null };
      })
    )
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    6
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    12
  );
});
