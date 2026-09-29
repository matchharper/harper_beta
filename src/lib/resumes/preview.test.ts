import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { resumeAssets } from "./assets";
import { resumePreviewHtml } from "./preview";
import { resumeBlocks } from "./template";
import type { ResumeContent } from "./schema";

test(
  "sandboxed A4 HTML keeps content and page boundaries at desktop/mobile widths",
  { skip: process.env.RESUME_PDF_TEST !== "1" },
  async () => {
    const browser = await chromium.launch({
      executablePath:
        process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    try {
      const content: ResumeContent = {
        language: "ko",
        basics: {
          name: "김하늘",
          links: [
            {
              label: "Portfolio",
              url: `https://example.com/${"long-path".repeat(35)}`,
            },
          ],
        },
        education: [{ title: "컴퓨터공학 학사", organization: "예시대학교" }],
        experience: Array.from({ length: 12 }, (_, i) => ({
          title: `Product Manager ${i + 1}`,
          bullets: Array.from(
            { length: 4 },
            () =>
              "고객 인터뷰를 통해 개선 방향을 정리했습니다. Cross-functional collaboration and delivery."
          ),
        })),
        projects: [
          {
            title: "긴 문단",
            description:
              "긴 문장도 페이지 경계를 넘어 누락되지 않아야 합니다. ".repeat(
                100
              ),
          },
        ],
      };
      const html = resumePreviewHtml(content, await resumeAssets());
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(
        '<iframe sandbox="allow-scripts" style="width:800px;border:0"></iframe>'
      );
      await page
        .locator("iframe")
        .evaluate((f, html) => ((f as HTMLIFrameElement).srcdoc = html), html);
      const frame = page.frames().find((f) => f !== page.mainFrame())!;
      await frame.waitForFunction(() =>
        Boolean(
          (window as unknown as { __resumeReady?: unknown }).__resumeReady
        )
      );
      const ready = await frame.evaluate(
        () =>
          (
            window as unknown as {
              __resumeReady: { pageCount: number; error?: boolean };
            }
          ).__resumeReady
      );
      assert.ok(!ready.error);
      assert.ok(ready.pageCount > 1);
      const compact = (s: string) => s.replace(/\s/g, "");
      const text = compact(await frame.locator(".pagedjs_pages").innerText());
      for (const block of resumeBlocks(content))
        assert.ok(text.includes(compact(block.text)));
      const boundaries = await frame
        .locator(".pagedjs_page")
        .evaluateAll((pages) =>
          pages.map((p) => p.getBoundingClientRect().width)
        );
      await page.locator("iframe").evaluate((f) => {
        (f as HTMLElement).style.width = "360px";
      });
      await frame.waitForFunction(
        () =>
          document.querySelector(".pagedjs_page")!.getBoundingClientRect()
            .width <= 329
      );
      assert.equal(
        await frame.locator(".pagedjs_page").count(),
        ready.pageCount
      );
      assert.ok(boundaries.every((w) => w > 640 && w < 660));
      assert.deepEqual(errors, []);
      await mkdir("output/resume-test", { recursive: true });
      await page.locator("iframe").evaluate((f) => {
        (f as HTMLElement).style.height = "1100px";
      });
      await page.screenshot({ path: "output/resume-test/html-mobile.png" });
      await page.locator("iframe").evaluate((f) => {
        (f as HTMLElement).style.width = "800px";
      });
      await frame.waitForFunction(
        () =>
          document.querySelector(".pagedjs_page")!.getBoundingClientRect()
            .width > 640
      );
      await page.screenshot({ path: "output/resume-test/html-desktop.png" });
    } finally {
      await browser.close();
    }
  }
);
