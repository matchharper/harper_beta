import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const execution = readFileSync(
  new URL("./toolExecution.ts", import.meta.url),
  "utf8"
);

test("company-side deletion reuses the web lifecycle update atomically", () => {
  assert.match(
    execution,
    /status === "deleted"[\s\S]*getOrgRoleLifecycleUpdate\("delete"\)[\s\S]*updateOrgRole\([\s\S]*isExpired: lifecycle\.isExpired[\s\S]*source: args\.source[\s\S]*status: lifecycle\.status/
  );
});
