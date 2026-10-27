import type { ResumeContent } from "./schema";
import { resumeAssets } from "./assets";
import { resumePreviewHtml } from "./preview";
import { resumePlainText } from "./template";
import { PdfRenderError } from "./pdfError";
export { resumeHtml, resumePlainText } from "./template";

export async function renderResumePdf(
  content: ResumeContent
): Promise<{ pdf: Buffer; pageCount: number; text: string }> {
  const assets = await resumeAssets().catch(cause => {
    throw new PdfRenderError("PDF fonts or pagination assets could not be loaded.", { stage: "local_assets", pdfReceived: false, cause });
  });
  return renderPaginatedPdf({
    html: resumePreviewHtml(content, assets),
    text: resumePlainText(content),
  });
}

export async function renderPaginatedPdf(input: {
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
