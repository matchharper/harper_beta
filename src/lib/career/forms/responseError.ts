import { z } from "zod";
import { TOOL_MODEL_DIAGNOSTIC } from "@/lib/llm/toolError";
import { ResumeExportError } from "@/lib/resumes/export";
import { PdfRenderError } from "@/lib/resumes/pdfError";

// Why a form answer was not saved, as the client may show it. Only the code and whether the same press can
// succeed later leave the server; the error text stays in the server log.
const RESPONSES = {
  form_changed: { status: 409, retryable: false },
  file_unavailable: { status: 422, retryable: false },
  file_render_unavailable: { status: 503, retryable: false },
  file_render_failed: { status: 503, retryable: true },
  invalid_answer: { status: 422, retryable: false },
  unexpected: { status: 500, retryable: true },
} as const;
export type CareerFormErrorCode = keyof typeof RESPONSES;
type SelectedFile = { documentId: string; revision: number };

/** A form answer that was not saved, with the reason the client may show. `file` names a selected file that failed. */
export class CareerFormError extends Error {
  readonly name = "CareerFormError";
  readonly file?: SelectedFile;
  constructor(readonly code: CareerFormErrorCode, message: string, options?: { cause: unknown; file: SelectedFile }) {
    super(message, options && { cause: options.cause });
    this.file = options?.file;
  }
}

function codeOf(error: unknown): CareerFormErrorCode {
  if (error instanceof CareerFormError) return error.code;
  if (error instanceof z.ZodError) return "invalid_answer";
  if (error instanceof ResumeExportError)
    return error.status === 409 ? "form_changed" : error.status === 404 || error.status === 422 ? "file_unavailable" : "unexpected";
  // Without the renderer configured every Harper-made document fails the same way, so pressing again cannot help.
  if (error instanceof PdfRenderError)
    return error[TOOL_MODEL_DIAGNOSTIC].stage === "configuration" ? "file_render_unavailable" : "file_render_failed";
  return "unexpected";
}

export function classifyFormResponseError(error: unknown) {
  const code = codeOf(error);
  return { code, ...RESPONSES[code] };
}

/** Pinning a file the person selected failed: the cause decides the response, the file says which document. */
export function selectedFileError(cause: unknown, file: SelectedFile) {
  return new CareerFormError(codeOf(cause), cause instanceof Error ? cause.message : "Selected file could not be prepared", { cause, file });
}

/** The selected document whose PDF could not be made, for the export log that Harper's document tools read. */
export function failedPdfExport(error: unknown) {
  return error instanceof CareerFormError && error.file && error.cause instanceof PdfRenderError
    ? { ...error.file, error: error.cause } : undefined;
}
