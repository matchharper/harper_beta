import assert from "node:assert/strict";
import test from "node:test";
import { renderResumePdf } from "./render";

const content = { language: "ko" as const, basics: { name: "김하늘" } };

test("unconfigured PDF generation never makes a network request", async (t) => {
  const saved = process.env.BROWSERLESS_API_TOKEN;
  delete process.env.BROWSERLESS_API_TOKEN;
  t.after(() => { if (saved === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = saved; });
  const request = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  await assert.rejects(renderResumePdf(content), /not configured/);
  assert.equal(request.mock.callCount(), 0);
});

test("provider failures cannot expose credentials or return a non-PDF attachment", async (t) => {
  const saved = process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSERLESS_API_TOKEN = "test-private-token";
  t.after(() => { if (saved === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = saved; });
  const request = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    assert.ok(body.html.includes("김하늘"));
    assert.ok(body.html.includes("data:font/woff2;base64,"));
    assert.ok(body.html.includes("PagedModule"));
    assert.equal(body.options.preferCSSPageSize, true);
    assert.ok(body.waitForFunction.fn.includes("__resumeReady"));
    return new Response("private provider diagnostics", { status: 429 });
  });
  await assert.rejects(renderResumePdf(content), { message: "PDF rendering service returned HTTP 429." });
  request.mock.mockImplementation(async () => { throw new Error("https://provider/?token=test-private-token"); });
  await assert.rejects(renderResumePdf(content), { message: "PDF rendering request failed." });
  request.mock.mockImplementation(async () => new Response("<html>Not a PDF</html>"));
  await assert.rejects(renderResumePdf(content), /invalid document/);
});

test("render timeout aborts the remote request", async (t) => {
  const saved = process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSERLESS_API_TOKEN = "test-private-token";
  t.after(() => { if (saved === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = saved; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    signal = options?.signal as AbortSignal;
    started();
    return new Promise<Response>((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  });
  const check = assert.rejects(renderResumePdf(content), /timed out/);
  await ready;
  t.mock.timers.tick(30_000);
  await check;
  assert.equal(signal?.aborted, true);
});
