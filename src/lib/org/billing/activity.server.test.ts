import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("billing action logging schedules all database work after the response", async () => {
  const callbacks: (() => Promise<void>)[] = [];
  const inserted: unknown[] = [];
  const deps: Record<string, any> = {
    "next/server": {
      after: (callback: () => Promise<void>) => callbacks.push(callback),
    },
    "./store": {
      billingDb: () => ({
        from: () => ({
          insert: (row: unknown) => {
            inserted.push(row);
            return new Promise(() => {});
          },
        }),
      }),
    },
  };
  const loaded = { exports: {} as any };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("./activity.server.ts", import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      console,
      process: { env: {} },
      require: (id: string) => deps[id],
    }
  );
  const result = loaded.exports.scheduleBillingActivity(
    "org_billing_checkout_succeeded",
    "actor",
    { workspaceId: "workspace" }
  );
  assert.equal(result, undefined);
  assert.equal(inserted.length, 0);
  assert.equal(callbacks.length, 1);
  void callbacks[0]();
  assert.equal(inserted.length, 1);
});
