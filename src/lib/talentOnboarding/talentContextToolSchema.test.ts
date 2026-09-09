import assert from "node:assert/strict";
import test from "node:test";

import {
  TALENT_CONTEXT_READ_TOOL_PARAMETERS,
  TALENT_CONTEXT_WRITE_TOOL_PARAMETERS,
} from "./talentContexts";

test("keeps general Brief writes free-form and excludes compatibility keys", () => {
  const changeProperties =
    TALENT_CONTEXT_WRITE_TOOL_PARAMETERS.properties.changes.items.properties;

  assert.equal("key" in changeProperties, false);
  assert.ok("label" in changeProperties);
  assert.equal("enum" in changeProperties.label, false);
  assert.deepEqual(changeProperties.collection.enum, ["brief", "memory"]);
  assert.match(changeProperties.content.description, /facts the user stated/);
  assert.match(
    changeProperties.content.description,
    /must not repeat its label/
  );
  assert.deepEqual(changeProperties.importance.enum, [1, 2, 3]);
  assert.match(changeProperties.importance.description, /Required.*Memory/);
});

test("uses short refs and bounded reads instead of database ids", () => {
  const readProperties = TALENT_CONTEXT_READ_TOOL_PARAMETERS.properties;
  const writeProperties =
    TALENT_CONTEXT_WRITE_TOOL_PARAMETERS.properties.changes.items.properties;

  assert.ok("refs" in readProperties);
  assert.ok("ref" in writeProperties);
  assert.equal("id" in readProperties, false);
  assert.equal("id" in writeProperties, false);
  assert.equal(readProperties.limit.maximum, 40);
});
