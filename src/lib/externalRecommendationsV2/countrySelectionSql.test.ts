import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { buildCountrySelectionCtes } from "./countrySelectionSql";

test("country selection fills weighted quotas, redistributes shortages and keeps the best roles", async () => {
  const db = new PGlite();
  const codes = ["KR", "US", "JP", "GB", "SG"];
  try {
    await db.exec(`CREATE TABLE company_capped (
      role_id integer, country_code text, search_rank numeric,
      distance numeric, posted_at timestamptz
    );`);
    const cases = [
      { name: "90/10", capacity: [600, 600], weights: [0.9, 0.1], limit: 500, expected: [450, 50] },
      { name: "high-weight country short", capacity: [300, 600], weights: [0.9, 0.1], limit: 500, expected: [300, 200] },
      { name: "low-weight country short", capacity: [600, 20], weights: [9, 1], limit: 500, expected: [480, 20] },
      { name: "five countries", capacity: [600, 600, 600, 600, 600], weights: [0.5, 0.2, 0.15, 0.1, 0.05], limit: 500, expected: [250, 100, 75, 50, 25] },
      { name: "cascading shortages", capacity: [100, 90, 100, 600, 600], weights: [50, 20, 15, 10, 5], limit: 500, expected: [100, 90, 100, 140, 70] },
      { name: "missing countries", capacity: [0, 600, 0, 0, 0], weights: [50, 20, 15, 10, 5], limit: 500, expected: [0, 500, 0, 0, 0] },
      { name: "fewer candidates than limit", capacity: [2, 3, 1, 0, 4], weights: [50, 20, 15, 10, 5], limit: 500, expected: [2, 3, 1, 0, 4] },
      { name: "fractional ties", capacity: [600, 600, 600, 600, 600], weights: [1, 1, 1, 1, 1], limit: 7, expected: [2, 2, 1, 1, 1] },
      { name: "immediate limit", capacity: [600, 600], weights: [9, 1], limit: 200, expected: [180, 20] },
      { name: "supplementary limit", capacity: [600, 600], weights: [9, 1], limit: 50, expected: [45, 5] },
      { name: "single country", capacity: [600], weights: [0.1], limit: 500, expected: [500] },
      { name: "empty pool", capacity: [0, 0], weights: [9, 1], limit: 500, expected: [0, 0] },
    ];
    for (const c of cases) {
      await db.exec("TRUNCATE company_capped");
      for (let i = 0; i < c.capacity.length; i++) {
        await db.query(`INSERT INTO company_capped
          SELECT $1::int*1000+n, $2, 1000-n, n, '2026-10-16'::timestamptz
          FROM generate_series(1,$3::int) n`, [i, codes[i], c.capacity[i]]);
      }
      const countries = c.weights.map((weight, i) => ({ countryCode: codes[i], weight, remoteOnly: false }));
      const { rows } = await db.query<{ role_id: number; country_code: string }>(
        `WITH ${buildCountrySelectionCtes(countries, c.limit)} SELECT * FROM selected`
      );
      assert.equal(rows.length, c.expected.reduce((a, b) => a + b, 0), c.name);
      assert.equal(new Set(rows.map(r => r.role_id)).size, rows.length, c.name);
      c.expected.forEach((count, i) => {
        assert.deepEqual(rows.filter(r => r.country_code === codes[i]).map(r => r.role_id),
          Array.from({ length: count }, (_, n) => i * 1000 + n + 1), c.name);
      });
    }
  } finally {
    await db.close();
  }
});
