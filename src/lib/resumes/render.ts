import type { Browser } from "playwright-core";
import { existsSync } from "node:fs";
import type { ResumeContent } from "./schema";
import { resumeAssets } from "./assets";
import { resumePreviewHtml } from "./preview";
import { resumeBlocks, resumePlainText } from "./template";
export { resumeHtml, resumePlainText } from "./template";

export async function renderResumePdf(
  content: ResumeContent
): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  let browser: Browser | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const [{ chromium: playwright }, assets] = await Promise.all([
      import("playwright-core"),
      resumeAssets(),
    ]);
    const linux = process.platform === "linux";
    const serverless = linux
      ? (await import("@sparticuz/chromium")).default
      : null;
    const executablePath =
      process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
      (serverless
        ? await serverless.executablePath()
        : process.platform === "darwin" &&
            existsSync(
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            )
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : playwright.executablePath());
    if (expired) throw new Error("PDF rendering timed out.");
    browser = await playwright.launch({
      executablePath,
      args: serverless?.args,
      headless: true,
      timeout: 20_000,
    });
    if (expired) {
      await browser.close();
      throw new Error("PDF rendering timed out.");
    }
    const context = await browser.newContext({
      javaScriptEnabled: true,
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(resumePreviewHtml(content, assets), {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __resumeReady?: unknown }).__resumeReady
        ),
      undefined,
      { timeout: 25_000 }
    );
    const layout = await page.evaluate(
      () =>
        (
          window as unknown as {
            __resumeReady: { pageCount?: number; error?: string };
          }
        ).__resumeReady
    );
    if (layout.error || !layout.pageCount)
      throw new Error("Resume pagination failed.");
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
    // The same display blocks feed PDF and text. Validate extraction before publishing.
    const { getPath } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(getPath());
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    let parsed;
    try {
      parsed = await parser.getText({
        pageJoiner: "\n",
        parseHyperlinks: false,
      });
    } finally {
      await parser.destroy();
    }
    const compact = (s: string) => s.normalize("NFKC").replace(/\s/g, "");
    const extracted = compact(parsed.text);
    if (
      !parsed.total ||
      parsed.total !== layout.pageCount ||
      resumeBlocks(content).some((x) => !extracted.includes(compact(x.text)))
    )
      throw new Error("PDF text validation failed.");
    return {
      pdf,
      pageCount: parsed.total as number,
      text: resumePlainText(content),
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("PDF rendering timed out."));
        }, 30_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) await browser.close().catch(() => {});
  }
}
