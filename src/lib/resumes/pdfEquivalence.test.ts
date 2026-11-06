import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { resumeAssets } from "./assets";
import { resumeHtml } from "./template";
import { paginatedPreviewHtml } from "./preview";
import { externalResumeAssets } from "./externalAssets";
import { documentTemplate } from "@/lib/documents/template";
import type { ResumeContent } from "./schema";
import { startResumeAssetServer } from "./testAssetServer";

test("the versioned asset bundle retains every font face and the exact Paged.js bytes", async () => {
  const server = await startResumeAssetServer();
  try {
    const inline = await resumeAssets();
    const css = ["400.css", "700.css"].map(name => server.files.get(name)!.toString()).join("\n");
    const encoded = [...inline.fontCss.matchAll(/url\(data:font\/woff2;base64,([^)]+)\)/g)];
    const linked = [...css.matchAll(/url\(\.\/files\/([^)]*)\)/g)];
    assert.equal(linked.length, 248);
    assert.equal(encoded.length, linked.length);
    linked.forEach((font, index) => assert.deepEqual(server.files.get(`files/${font[1]}`), Buffer.from(encoded[index][1], "base64")));
    assert.equal(inline.fontCss.replace(/url\([^)]+\)/g, "url(FONT)"), css.replace(/url\([^)]+\)/g, "url(FONT)"));
    assert.equal(inline.script, server.files.get("paged.min.js")!.toString());
  } finally { await server.close(); }
});

const paragraph = "한국어와 English가 섞인 경력 설명입니다. Model development, evaluation and deployment — 성과 35%, 서울·Seoul. Æ é Ω Ж ㉿ ₩ € →";
const resume: ResumeContent = { language: "ko", basics: { name: "홍길동 Diagnostic", email: "example@example.com", location: "서울", links: [{ label: "Portfolio", url: "https://example.com/portfolio" }] },
  experience: Array.from({ length: 9 }, (_, i) => ({ title: `Research Engineer ${i + 1}`, organization: "Synthetic Company", period: "2020 – 2026", description: paragraph, bullets: Array.from({ length: 4 }, () => paragraph), url: "https://example.com/work" })),
  education: [{ title: "Computer Science", organization: "Test University" }], skills: [{ title: "기술", items: ["Python", "PyTorch", "音声", "人工知能"] }] };
const markdown = "# 기술 문서 / Technical report\n\n[Reference](https://example.com/report)\n\n" + Array.from({ length: 8 }, (_, i) =>
  `## Section ${i + 1}\n\n${paragraph}\n\n> ${paragraph}\n\n| 항목 | Result |\n| --- | --- |\n| 정확도 | **35%** improvement |\n| Notes | ${paragraph} |\n\n- ${paragraph}\n- **중요한 기록**\n\n\`\`\`python\nprint("안녕하세요, world")\n\`\`\`\n`).join("\n");

test("inline and external assets yield identical paginated content, geometry and PDF pages", { skip: process.env.PDF_EQUIVALENCE_TEST !== "1" }, async () => {
  const server = await startResumeAssetServer();
  const browser = await chromium.launch({ executablePath: process.env.RESUME_CHROMIUM_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const directory = "output/pdf/equivalence";
  await mkdir(directory, { recursive: true });
  try {
    const inline = await resumeAssets();
    const baseline = process.env.PDF_EQUIVALENCE_BASELINE_MODULE
      ? (await import(process.env.PDF_EQUIVALENCE_BASELINE_MODULE)).paginatedPreviewHtml as typeof paginatedPreviewHtml
      : paginatedPreviewHtml;
    const english: ResumeContent = { language: "en", basics: { name: "Example Candidate", links: [{ label: "Portfolio", url: `https://example.com/${"long-path".repeat(35)}` }] },
      experience: [{ title: "Research Engineer", bullets: ["Built machine learning models.", "Validated inference quality & latency."] }] };
    const templates: Record<string, string> = { english: resumeHtml(english, ""), resume: resumeHtml(resume, ""), document: (await documentTemplate("Technical report", markdown)).html };
    const privateFixture = process.env.PDF_EQUIVALENCE_PRIVATE_HTML;
    if (privateFixture) templates.original = await readFile(privateFixture, "utf8");
    const result: Record<string, unknown>[] = [];
    for (const [name, template] of Object.entries(templates)) {
      const outputs: any[] = [];
      for (const mode of ["inline", "external"]) {
        const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        const html = mode === "inline" ? baseline(template, inline) : paginatedPreviewHtml(template, externalResumeAssets(server.origin));
        const started = performance.now();
        await page.setContent(html);
        await page.waitForFunction(() => Boolean((window as any).__resumeReady), undefined, { timeout: 25000 });
        const state = await page.evaluate(() => ({ ready: (window as any).__resumeReady, pages: [...document.querySelectorAll(".pagedjs_page")].map(page => ({
          text: (page as HTMLElement).innerText,
          links: [...page.querySelectorAll("a")].map(a => ({ text: a.textContent, href: a.href })),
          // Content boxes establish exact line wrapping and page boundaries.
          boxes: [...page.querySelectorAll(".pagedjs_page_content *")].map(el => {
            const r = el.getBoundingClientRect(); return [el.tagName, r.x, r.y, r.width, r.height];
          }),
        })) }));
        assert.equal(state.ready.error, undefined);
        assert.deepEqual(errors, []);
        const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true });
        await writeFile(`${directory}/${name}-${mode}.pdf`, pdf);
        outputs.push(state.pages);
        result.push({ name, mode, pages: state.ready.pageCount, htmlBytes: Buffer.byteLength(html), pdfBytes: pdf.length, ms: Math.round(performance.now() - started) });
        await page.close();
      }
      assert.deepEqual(outputs[1], outputs[0], `${name}: page contents, links or geometry changed`);
    }
    // SRI/CORS failures must not quietly fall back to a different font or layout.
    const page = await browser.newPage();
    await page.route("**/files/*.woff2", route => route.abort());
    await page.setContent(paginatedPreviewHtml(resumeHtml(resume, ""), externalResumeAssets(server.origin)));
    await page.waitForFunction(() => Boolean((window as any).__resumeReady));
    assert.equal(await page.evaluate(() => (window as any).__resumeReady.error), true);
    await page.close();
    await writeFile(`${directory}/render-results.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ verified: result, fontRequests: server.requests.filter(name => name.endsWith(".woff2")).length }));
  } finally { await browser.close(); await server.close(); }
});
