import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("email attachment failures remove storage objects before document persistence", () => {
  const storageUploadIndex = routeSource.indexOf(
    "uploadedStoragePath = storagePath"
  );
  const extractionIndex = routeSource.indexOf(
    "await extractTextFromAttachmentBuffer"
  );
  const persistenceIndex = routeSource.indexOf("documentPersisted = true");
  const cleanupGuardIndex = routeSource.indexOf(
    "if (uploadedStoragePath && !documentPersisted)"
  );
  const cleanupRemoveIndex = routeSource.indexOf(
    ".remove([uploadedStoragePath])",
    cleanupGuardIndex
  );

  assert.ok(storageUploadIndex >= 0);
  assert.ok(extractionIndex > storageUploadIndex);
  assert.ok(persistenceIndex > extractionIndex);
  assert.ok(cleanupGuardIndex > persistenceIndex);
  assert.ok(cleanupRemoveIndex > cleanupGuardIndex);
});
