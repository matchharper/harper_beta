import assert from "node:assert/strict";
import test from "node:test";
import { readVisibleOfficialJobsPage } from "./pagination";

test("loads 21 visible roles per page across hidden batches without repeats", async () => {
  const rows = Array.from({ length: 170 }, (_, index) => ({
    id: String(index),
    visible: index >= 45 && index % 3 !== 0,
  }));
  const expected = rows.filter((row) => row.visible).map((row) => row.id);
  const received: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: { rows: typeof rows; nextOffset: number | null } =
      await readVisibleOfficialJobsPage(
        offset,
        async (from, size) => rows.slice(from, from + size),
        async (batch) => batch.filter((row) => row.visible)
      );
    assert.ok(page.rows.length <= 21);
    if (page.nextOffset !== null) {
      assert.equal(page.rows.length, 21);
      assert.ok(page.nextOffset > offset);
    }
    received.push(...page.rows.map((row) => row.id));
    offset = page.nextOffset;
  }
  assert.deepEqual(received, expected);
});

test("ends empty, partial, and exact-full final pages without an extra cursor", async () => {
  for (const count of [0, 5, 21]) {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: String(index),
    }));
    const page = await readVisibleOfficialJobsPage(
      0,
      async (from, size) => rows.slice(from, from + size),
      async (batch) => batch
    );
    assert.equal(page.rows.length, count);
    assert.equal(page.nextOffset, null);
  }
});

test("returns privacy-filtered rows and propagates upstream failures", async () => {
  const page = await readVisibleOfficialJobsPage(
    0,
    async () => [{ id: "anonymous", role_id: "private" }],
    async (rows) => rows.map((row) => ({ ...row, role_id: "" }))
  );
  assert.equal(page.rows[0].role_id, "");
  await assert.rejects(
    readVisibleOfficialJobsPage(
      0,
      async () => {
        throw new Error("unavailable");
      },
      async (batch) => batch
    ),
    /unavailable/
  );
});
