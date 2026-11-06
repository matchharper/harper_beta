import type { ResumeContent } from "./schema";
import { createHash } from "node:crypto";
import { externalResumeAssets } from "./externalAssets";
import type { PdfRenderContext } from "./pdfCache";
import { resumePreviewHtml } from "./preview";
import { resumePlainText } from "./template";
import { PdfRenderError } from "./pdfError";
export { resumeHtml, resumePlainText } from "./template";

export async function renderResumePdf(
  content: ResumeContent,
  context?: PdfRenderContext
): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  return renderPaginatedPdf({
    html: resumePreviewHtml(content, externalResumeAssets()),
    text: resumePlainText(content),
    context,
  });
}

const PDF_OPTIONS = { format: "A4", preferCSSPageSize: true, printBackground: true };
export async function renderPaginatedPdf(input: {
  html: string;
  text: string;
  context?: PdfRenderContext;
}): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  if (!input.context?.cache) return renderUncachedPdf(input);
  // Includes the full template, pagination bootstrap, asset URLs and print
  // options. A change to any rendering input cannot reuse an older artifact.
  const inputHash = createHash("sha256").update(JSON.stringify({ html: input.html, options: PDF_OPTIONS })).digest("hex");
  const artifact = await input.context.cache.getOrCreate(input.context.document, inputHash, () => renderUncachedPdf(input));
  return { ...artifact, text: input.text };
}

async function renderUncachedPdf(input: {
  html: string;
  text: string;
}): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  const token = process.env.BROWSERLESS_API_TOKEN?.trim();
  if (!token) throw new PdfRenderError("PDF rendering is not configured.", { stage: "configuration", pdfReceived: false });
  let stage = "provider_request";
  let pdfReceived = false;
  let httpStatus: number | undefined;
  const failure = (message: string, cause?: unknown) => new PdfRenderError(message, { stage, pdfReceived, httpStatus, cause });
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
          // Same template, font bytes and pagination as the inline preview.
          html: input.html,
          waitForFunction: {
            fn: `() => {
              if (window.__resumeReady?.error) throw new Error("Resume pagination failed");
              return Boolean(window.__resumeReady?.pageCount);
            }`,
            timeout: 25_000,
          },
          options: PDF_OPTIONS,
        }),
      });
    } catch (cause) {
      // Diagnostic transport redacts credentials while retaining network error codes.
      throw failure("PDF rendering request failed.", cause);
    }
    httpStatus = response.status;
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      let providerError: unknown;
      if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object") providerError = { code: body.code, message: body.message, error: body.error };
      } else if (contentType.includes("text/plain")) {
        providerError = (await response.text().catch(() => "")).slice(0, 4000);
      } else await response.body?.cancel().catch(() => {});
      throw failure(
        `PDF rendering service returned HTTP ${response.status}.`, providerError
      );
    }
    let pdf: Buffer;
    stage = "provider_response";
    try {
      pdf = Buffer.from(await response.arrayBuffer());
    } catch (cause) {
      throw failure("PDF rendering response was interrupted.", cause);
    }
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw failure("PDF rendering service returned an invalid document.");
    pdfReceived = true;
    stage = "pdf_read";

    // Read the page count, not text order: PDF extraction can reorder positioned
    // content even when every paragraph is visibly present in the rendered file.
    const { getPath } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(getPath());
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    let parsed;
    try {
      parsed = await parser.getInfo();
    } finally {
      await parser.destroy();
    }
    if (!parsed.total)
      throw failure("PDF rendering service returned an empty document.");
    return { pdf, pageCount: parsed.total, text: input.text };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(failure("PDF rendering timed out."));
        }, 30_000);
      }),
    ]);
  } catch (cause) {
    if (cause instanceof PdfRenderError) throw cause;
    throw failure("The generated PDF could not be read.", cause);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
