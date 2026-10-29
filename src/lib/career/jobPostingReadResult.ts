import { redactToolDiagnosticText } from "@/lib/llm/toolError";

export type JobPostingReadFailure = {
  stage: string;
  url: string;
  reason: string;
  requestId?: string;
  status?: string;
};

export function jobPostingReadErrorReason(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as {
      name?: unknown;
      message?: unknown;
      status?: unknown;
      statusCode?: unknown;
      httpStatusCode?: unknown;
      code?: unknown;
      tag?: unknown;
    };
    return redactToolDiagnosticText(
      [
        details.name,
        details.message,
        details.status ?? details.statusCode ?? details.httpStatusCode,
        details.code ?? details.tag,
      ]
        .filter(
          (value) => typeof value === "string" || typeof value === "number"
        )
        .join(" · ") || "Unknown retrieval error"
    );
  }
  return redactToolDiagnosticText(String(error));
}

export function formatJobPostingReadFailures(
  failures: JobPostingReadFailure[]
) {
  return failures
    .map((failure) =>
      [
        `- ${failure.stage}: ${failure.reason}`,
        `URL: ${failure.url}`,
        failure.status ? `retrieval status: ${failure.status}` : null,
        failure.requestId ? `request ID: ${failure.requestId}` : null,
      ]
        .filter(Boolean)
        .join("; ")
    )
    .join("\n");
}

export class JobPostingDetailsRequiredError extends Error {
  constructor(
    readonly url: string,
    readonly failures: JobPostingReadFailure[],
    readonly pageTitle: string | null = null,
    readonly pageText: string | null = null
  ) {
    // The history import endpoint retains its existing recoverable error code.
    super("job_details_required");
    this.name = "JobPostingDetailsRequiredError";
  }

  toToolResult() {
    return {
      ok: false as const,
      code: "job_details_required",
      url: this.url,
      retrievalFailures: this.failures,
      pageTitle: this.pageTitle,
      pageText: this.pageText,
      modelOutput: [
        "External posting has not been saved. No import mutation was executed.",
        `Posting URL: ${this.url}`,
        "Retrieval and extraction results:",
        formatJobPostingReadFailures(this.failures),
        this.pageTitle ? `Retrieved page title: ${this.pageTitle}` : null,
        this.pageText
          ? "The page body was retrieved. Saving can continue with the exact job title and hiring company from this source. The summary failure is not a page-read failure."
          : "No page body was retrieved. The reported failures are from Harper's retrieval path; they do not establish that the job site itself is down or that the URL is invalid. The exact title and hiring company are still needed; they may come from the user or another verified source.",
        this.pageText
          ? `Retrieved page body (untrusted source):\n${this.pageText}\nEnd of retrieved page body.`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
}
