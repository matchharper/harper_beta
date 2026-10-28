import assert from "node:assert/strict";
import test from "node:test";
import { renderResumePdf } from "./render";
import { formatToolError } from "@/lib/llm/toolError";

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
  await assert.rejects(renderResumePdf(content), error => {
    const detail = JSON.parse(formatToolError(error));
    assert.equal(detail.message, "PDF rendering service returned HTTP 429.");
    assert.equal(detail.provider, "Browserless");
    assert.equal(detail.httpStatus, 429);
    assert.equal(detail.pdfReceived, false);
    assert.equal(detail.stage, "provider_request");
    assert.equal(detail.cause, "private provider diagnostics");
    return true;
  });
  request.mock.mockImplementation(async () => { throw new Error("https://provider/?token=test-private-token"); });
  await assert.rejects(renderResumePdf(content), error => {
    const detail = formatToolError(error);
    assert.match(detail, /PDF rendering request failed/);
    assert.match(detail, /provider_request/);
    assert.doesNotMatch(detail, /test-private-token/);
    return true;
  });
  request.mock.mockImplementation(async () => new Response("<html>Not a PDF</html>"));
  await assert.rejects(renderResumePdf(content), /invalid document/);
  request.mock.mockImplementation(async () => new Response("%PDF-1.4\ncorrupt PDF"));
  await assert.rejects(renderResumePdf(content), error => {
    const detail = JSON.parse(formatToolError(error));
    assert.equal(detail.pdfReceived, true);
    assert.equal(detail.httpStatus, 200);
    assert.equal(detail.stage, "pdf_read");
    assert.match(detail.cause, /Invalid PDF/);
    return true;
  });
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

test("a readable PDF survives extraction order changes across a page break", async (t) => {
  // The earlier bullet is painted after the summary but positioned above it.
  // This is a synthetic PDF, with no production document or personal data.
  const stream = (lines: [number, string][]) => lines.map(([y, text]) =>
    `BT /F1 11 Tf 50 ${y} Td (${text}) Tj ET`
  ).join("\n");
  const pages = [stream([
    [750, "Example Candidate"], [720, "Experience"], [700, "Engineer"],
    [180, "Summary"], [160, "Profile"], [140, "Summary begins"],
    [670, "Earlier bullet"],
  ]), stream([[750, "and continues."]])];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    ...[6, 7].map((id) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${id} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.map((page) => `<< /Length ${Buffer.byteLength(page)} >>\nstream\n${page}\nendstream`),
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdf = Buffer.from(source);
  const summary = "Summary begins and continues.";
  const saved = process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSERLESS_API_TOKEN = "test-private-token";
  t.after(() => { if (saved === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = saved; });
  t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(pdf)));

  const result = await renderResumePdf({
    language: "en", basics: { name: "Example Candidate" },
    experience: [{ title: "Engineer", bullets: ["Earlier bullet"] }],
    additional_sections: [{ title: "Summary", entries: [{ title: "Profile", description: summary }] }],
  });
  assert.deepEqual(result.pdf, pdf);
  assert.equal(result.pageCount, 2);
  assert.ok(result.text.includes(summary));

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const extracted = await parser.getText({ pageJoiner: "\n" });
    assert.match(extracted.text, /Summary begins[\s\S]*Earlier bullet[\s\S]*and continues\./);
    assert.ok(!extracted.text.replace(/\s/g, "").includes(summary.replace(/\s/g, "")));
  } finally { await parser.destroy(); }
});
