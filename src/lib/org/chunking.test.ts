import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkOrgBoardFilterValues,
  ORG_BOARD_ID_FILTER_CHUNK_SIZE,
} from "@/lib/org/chunking";

test("chunks large PostgREST filters below the request-target limit", () => {
  const values = Array.from({ length: 800 }, (_, index) => `id-${index}`);
  const chunks = chunkOrgBoardFilterValues(values);

  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [150, 150, 150, 150, 150, 50]
  );
  assert.equal(Math.max(...chunks.map((chunk) => chunk.length)), 150);
  assert.equal(ORG_BOARD_ID_FILTER_CHUNK_SIZE, 150);
  assert.deepEqual(chunks.flat(), values);
});

test("normalizes an invalid custom chunk size", () => {
  assert.deepEqual(chunkOrgBoardFilterValues(["a", "b"], 0), [["a"], ["b"]]);
});
