import test from "node:test";
import assert from "node:assert/strict";
import { browserSessionFromQuery, browserSessionHref } from "./links";
test("browser email links select only an operation, never a provider URL or action", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const url = new URL(browserSessionHref(id), "https://matchharper.com");
  assert.equal(url.pathname, "/career");
  assert.equal(browserSessionFromQuery(url.searchParams.get("browserSession")), id);
  for (const value of [null, [id], "https://provider.test/viewer", "close", "other"]) assert.equal(browserSessionFromQuery(value), null);
});
