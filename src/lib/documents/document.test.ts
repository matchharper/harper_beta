import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { documentTemplate, DOCUMENT_RENDER_VERSION } from "./template";
import { exportDocument, renderAuthoredDocument } from "./export";
import { AUTHORED_DOCUMENT_ORIGIN } from "./authoring";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { applicationAttachment, applicationAttachmentName } from "@/lib/career/simulation/resumeAttachment";

test("Markdown renders headings, tables and links without executable or remote content", async () => {
  const template = await documentTemplate(
    "<script>title</script>",
    "# 지원 준비\n\n| 항목 | 내용 |\n| --- | --- |\n| 경험 | 팀 협업 |\n\n[근거](https://example.com)\n\n![설명](https://example.com/remote.png)\n\n<script>alert(1)</script>\n\n[위험](javascript:alert(1))"
  );
  assert.match(template.html, /<h1>지원 준비<\/h1>/);
  assert.match(template.html, /<table>/);
  assert.match(template.html, /href="https:\/\/example.com"/);
  assert.ok(!template.html.includes("<script>"));
  assert.ok(!template.html.includes("javascript:"));
  assert.ok(!template.html.includes("<img"));
  assert.ok(template.textChunks.includes("설명"));
});

test("PDF export rechecks ownership/deletion and the exact revision after rendering", async () => {
  const row = {
    id: "document",
    file_name: "문서.pdf",
    extracted_text: "# 내용",
    origin_type: AUTHORED_DOCUMENT_ORIGIN,
    revision: 2,
    updated_at: "now",
    is_deleted: false,
  } as TalentDocumentRow;
  const render = async () => ({
    pdf: Buffer.from("%PDF-test"),
    pageCount: 1,
    text: "내용",
  });
  const args = {
    expectedRevision: 2,
    renderVersion: DOCUMENT_RENDER_VERSION,
    read: async () => row,
    render,
  };
  assert.equal((await exportDocument(args)).fileName, "문서.pdf");
  await assert.rejects(
    exportDocument({ ...args, expectedRevision: 1 }),
    /changed/
  );
  for (const changed of [
    null,
    { ...row, is_deleted: true },
    { ...row, revision: 3 },
    { ...row, updated_at: "later" },
  ]) {
    let reads = 0;
    await assert.rejects(
      exportDocument({
        ...args,
        read: async () => (++reads === 1 ? row : changed),
      }),
      /not found|changed/
    );
  }
});

test(
  "general Korean/English documents produce a complete multi-page PDF and responsive preview",
  { skip: process.env.DOCUMENT_PDF_TEST !== "1" },
  async (t) => {
    const browser = await chromium.launch({
      executablePath:
        process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const oldToken = process.env.BROWSERLESS_API_TOKEN;
    process.env.BROWSERLESS_API_TOKEN = "local-render-test";
    t.after(async () => {
      if (oldToken === undefined) delete process.env.BROWSERLESS_API_TOKEN;
      else process.env.BROWSERLESS_API_TOKEN = oldToken;
      await browser.close();
    });
    const page = await browser.newPage({
      viewport: { width: 900, height: 1100 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    t.mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, options?: RequestInit) => {
        const input = JSON.parse(String(options?.body));
        await page.setContent(input.html);
        await page.waitForFunction(
          () => Boolean((window as any).__resumeReady),
          { timeout: 25000 }
        );
        assert.ok(
          !(await page.evaluate(() => (window as any).__resumeReady.error))
        );
        await mkdir("output/document-test", { recursive: true });
        await page.screenshot({
          path: "output/document-test/preview-desktop.png",
        });
        const pdf = await page.pdf({
          format: "A4",
          preferCSSPageSize: true,
          printBackground: true,
        });
        await writeFile("output/document-test/general-document.pdf", pdf);
        await page.setViewportSize({ width: 360, height: 800 });
        await page.waitForFunction(
          () =>
            document.querySelector(".pagedjs_page")!.getBoundingClientRect()
              .width <= 329
        );
        await page.screenshot({
          path: "output/document-test/preview-mobile.png",
        });
        return new Response(new Uint8Array(pdf));
      }
    );
    const markdown = [
      "# 지원서와 면접 준비\n\n이 문서는 한글과 English가 섞인 일반 문서입니다. 확인한 경험과 앞으로 확인할 질문을 구분합니다.",
      "## 주요 경험\n\n- 고객 인터뷰를 바탕으로 제품 개선 방향을 정리했습니다.\n- Cross-functional collaboration with engineering and design.",
      "## 비교표\n\n| 항목 | 확인한 내용 | 다음 질문 |\n| --- | --- | --- |\n| 역할 | 제품과 사용자 문제 이해 | 입사 후 기대 성과는 무엇인가요? |\n| 협업 | 다양한 팀과 함께 일한 경험 | 어떤 방식으로 결정을 내리나요? |",
      ...Array.from(
        { length: 14 },
        (_, index) =>
          `## 준비 항목 ${index + 1}\n\n${"구체적인 경험을 토대로 문제, 판단과 결과를 설명합니다. 사실에 없는 수치나 성과를 추가하지 않습니다. ".repeat(5)}\n\n[참고 자료](https://example.com/research)`
      ),
      "## 끝\n\n모든 내용이 마지막 페이지까지 보존되어야 합니다. END OF DOCUMENT.",
    ].join("\n\n");
    const rendered: Awaited<ReturnType<typeof renderAuthoredDocument>>[] = [];
    const row = {
      id: "supporting-document", kind: "document", file_name: "지원서와 면접 준비.pdf",
      origin_type: AUTHORED_DOCUMENT_ORIGIN, revision: 1, extracted_text: markdown,
      storage_path: null, is_deleted: false, updated_at: "2026-10-22T00:00:00Z",
    } as TalentDocumentRow;
    const attachment = await applicationAttachment({
      read: async () => row,
      download: async () => {throw new Error("Authored documents do not have uploaded files");},
      renderDocument: async (title, text) => {
        const artifact = await renderAuthoredDocument(title, text);
        rendered.push(artifact);
        return artifact;
      },
    });
    assert.equal(rendered.length, 1);
    const artifact = rendered[0];
    assert.ok(artifact.pageCount >= 3);
    assert.deepEqual(errors, []);
    assert.equal(artifact.text, markdown);
    assert.deepEqual(attachment.bytes, artifact.pdf);
    const form = await browser.newPage();
    await form.setContent('<input type="file" name="supporting_document" accept="application/pdf">');
    const name = applicationAttachmentName(attachment.document);
    await form.locator('input[type="file"]').setInputFiles({
      name, mimeType:"application/pdf", buffer:attachment.bytes,
    });
    const uploaded = await form.locator('input[type="file"]').evaluate(async (el: HTMLInputElement) => {
      const file = el.files![0];
      return {name:file.name, type:file.type, size:file.size, header:await file.slice(0, 5).text()};
    });
    assert.deepEqual(uploaded, {name, type:"application/pdf", size:attachment.bytes.length, header:"%PDF-"});
  }
);
