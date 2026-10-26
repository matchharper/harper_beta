import type { ResumeContent } from "./schema";
import { resumeAssets } from "./assets";
import { resumePreviewHtml } from "./preview";
import { resumeBlocks, resumePlainText } from "./template";
export { resumeHtml, resumePlainText } from "./template";

export async function renderResumePdf(
  content: ResumeContent
): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  const assets = await resumeAssets();
  return renderPaginatedPdf({
    html: resumePreviewHtml(content, assets),
    textChunks: resumeBlocks(content).map((block) => block.text),
    text: resumePlainText(content),
  });
}

export async function renderPaginatedPdf(input: {
  html: string;
  textChunks: string[];
  text: string;
}): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  const token = process.env.BROWSERLESS_API_TOKEN?.trim();
  if (!token) throw new Error("PDF rendering is not configured.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    controller.signal.throwIfAborted();
    const url = new URL("https://production-sfo.browserless.io/pdf");
    url.searchParams.set("token", token);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
        body: JSON.stringify({
          // Use exactly the same bundled HTML, fonts and pagination as the preview.
          html: input.html,
          waitForFunction: {
            fn: `() => {
              if (window.__resumeReady?.error) throw new Error("Resume pagination failed");
              return Boolean(window.__resumeReady?.pageCount);
            }`,
            timeout: 25_000,
          },
          options: {
            format: "A4",
            preferCSSPageSize: true,
            printBackground: true,
          },
        }),
      });
    } catch {
      // Provider errors may contain the credential-bearing URL. Never propagate them.
      throw new Error("PDF rendering request failed.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `PDF rendering service returned HTTP ${response.status}.`
      );
    }
    let pdf: Buffer;
    try {
      pdf = Buffer.from(await response.arrayBuffer());
    } catch {
      throw new Error("PDF rendering response was interrupted.");
    }
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("PDF rendering service returned an invalid document.");

    // Verify actual PDF text before downloads or application attachments receive it.
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
      input.textChunks.some((text) => !extracted.includes(compact(text)))
    )
      throw new Error("PDF text validation failed.");
    return { pdf, pageCount: parsed.total as number, text: input.text };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("PDF rendering timed out."));
        }, 30_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
