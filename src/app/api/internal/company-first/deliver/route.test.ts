import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("delivery API initializes without a browser DOM and reaches request handling", () => {
  const result = spawnSync(process.execPath, [
    "--require", "./scripts/lib/serverOnlyTestPreload.cjs", "--import", "tsx", "-e", `
      const assert = require('node:assert/strict');
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(id, ...args) {
        if (id === 'jsdom' || id.includes('/jsdom/')) throw new Error('Delivery must not load a browser DOM');
        return load.call(this, id, ...args);
      };
      process.env.INTERNAL_WORKER_API_SECRET = 'synthetic-delivery-test';
      const { NextRequest } = require('next/server');
      const { POST } = require('./src/app/api/internal/company-first/deliver/route.ts');
      (async () => {
        const denied = await POST(new NextRequest('https://example.test/deliver', { method: 'POST' }));
        assert.equal(denied.status, 401);
        const empty = await POST(new NextRequest('https://example.test/deliver', {
          method: 'POST', headers: { authorization: 'Bearer synthetic-delivery-test', 'content-type': 'application/json' }, body: '{}'
        }));
        assert.equal(empty.status, 400);
        assert.equal((await empty.json()).error, 'outboxId is required');
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
