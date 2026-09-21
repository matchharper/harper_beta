import assert from "node:assert/strict";
import test from "node:test";
import { resolveNavigation } from "./navigation";

const creatorId = "09d16b4c-6a71-4ce2-b436-87d65a889f71";

test("cell navigation resolves a creator independently from the row record", () => {
  assert.deepEqual(
    resolveNavigation(
      {
        id: "b9d77223-938a-4db1-8702-f91e2cc25b67",
        creator_id: creatorId,
        creator_name: "Creator",
      },
      {
        source: "creators",
        id_field: "creator_id",
        tab: "conversation",
      },
      "review"
    ),
    { source: "creators", id: creatorId, tab: "conversation" }
  );
});

test("navigation supports a source stored on the row", () => {
  assert.deepEqual(
    resolveNavigation(
      { id: "queue-item", record_id: creatorId, record_source: "creators" },
      { source_field: "record_source", id_field: "record_id" },
      "work_queue"
    ),
    { source: "creators", id: creatorId, tab: undefined }
  );
});

test("navigation rejects empty and non-UUID targets", () => {
  assert.equal(
    resolveNavigation(
      { id: "unassigned" },
      { source: "creators", id_field: "id" },
      "performance_creator"
    ),
    null
  );
  assert.equal(resolveNavigation({ id: creatorId }, null, "creators"), null);
});
