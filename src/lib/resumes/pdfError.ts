import { formatToolError, TOOL_MODEL_DIAGNOSTIC } from "@/lib/llm/toolError";

export class PdfRenderError extends Error {
  readonly name = "PdfRenderError";
  readonly [TOOL_MODEL_DIAGNOSTIC]: Record<string, unknown>;
  constructor(message: string, details: {
    stage: string; pdfReceived: boolean; httpStatus?: number; cause?: unknown;
  }) {
    super(message);
    this[TOOL_MODEL_DIAGNOSTIC] = {
      name: this.name, message, provider: "Browserless",
      stage: details.stage, pdfReceived: details.pdfReceived,
      httpStatus: details.httpStatus,
      ...(details.cause !== undefined ? { cause: formatToolError(details.cause) } : {}),
    };
  }
}
