import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const nodeModule = Module as typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadWithServerOnlyStub(
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalModuleLoad.call(this, request, parent, isMain);
};
const entryPagePromise = import("./internalRoleRequestEntryPage").finally(
  () => {
    nodeModule._load = originalModuleLoad;
  }
);
test("uses the latest /about or /jobs visit before an internal role request", async () => {
  const { pickLatestInternalRoleRequestEntryPage } = await entryPagePromise;

  assert.equal(
    pickLatestInternalRoleRequestEntryPage([
      { createdAt: "2026-09-17T01:00:00.000Z", page: "/jobs" },
      { createdAt: "2026-09-17T01:05:00.000Z", page: "/about" },
    ]),
    "/about"
  );
  assert.equal(
    pickLatestInternalRoleRequestEntryPage([
      { createdAt: "2026-09-17T01:10:00.000Z", page: "/jobs" },
      { createdAt: "2026-09-17T01:05:00.000Z", page: "/about" },
    ]),
    "/jobs"
  );
});

test("ignores invalid timestamps and returns null without a known visit", async () => {
  const { pickLatestInternalRoleRequestEntryPage } = await entryPagePromise;

  assert.equal(
    pickLatestInternalRoleRequestEntryPage([
      { createdAt: null, page: "/about" },
      { createdAt: "not-a-date", page: "/jobs" },
    ]),
    null
  );
  assert.equal(pickLatestInternalRoleRequestEntryPage([]), null);
});

test("breaks equal timestamp ties consistently in favor of /jobs", async () => {
  const { pickLatestInternalRoleRequestEntryPage } = await entryPagePromise;
  const createdAt = "2026-09-17T01:00:00.000Z";

  assert.equal(
    pickLatestInternalRoleRequestEntryPage([
      { createdAt, page: "/jobs" },
      { createdAt, page: "/about" },
    ]),
    "/jobs"
  );
});
