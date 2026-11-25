import type { OfficialJobsOneScreenKind } from "@/lib/officialJobs/oneScreen";
import {
  OFFICIAL_JOBS_SIMILAR_REQUEST_PATH,
  OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES,
  type OfficialJobsSimilarRequestErrorCode,
} from "@/lib/officialJobs/similarRequest";

export type OfficialJobsSimilarRequestInput = {
  slug: string;
  kind: OfficialJobsOneScreenKind;
  email: string;
  linkedinUrl: string | null;
  resumeFile: File | null;
  locale: "ko" | "en";
  consent: boolean;
  /** The /jobs visitor id (rememberOfficialJobsLanding()). */
  lid: string | null;
};

export type OfficialJobsSimilarRequestResult =
  | {
      ok: true;
      /** The CV could not be read; the request went on with the LinkedIn URL only. */
      resumeIgnored?: true;
    }
  | {
      ok: false;
      code: OfficialJobsSimilarRequestErrorCode | "FILE_TOO_LARGE";
      /** The server's localized message; empty when there is none to show. */
      error: string;
    };

/** The CV is checked here first: the request body must stay under Vercel's cap. */
export function isSimilarResumeTooLarge(file: Pick<File, "size"> | null) {
  return Boolean(file && file.size > OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES);
}

/** The multipart body of POST /api/official-jobs/similar-request (similarRequest.ts fields). */
export function buildOfficialJobsSimilarRequestForm(
  input: OfficialJobsSimilarRequestInput
) {
  const form = new FormData();
  form.set("slug", input.slug);
  form.set("kind", input.kind);
  form.set("email", input.email.trim());
  form.set("locale", input.locale);
  form.set("consent", input.consent ? "true" : "false");
  const linkedinUrl = input.linkedinUrl?.trim();
  if (linkedinUrl) form.set("linkedinUrl", linkedinUrl);
  if (input.resumeFile) form.set("resume", input.resumeFile, input.resumeFile.name);
  const lid = input.lid?.trim();
  if (lid) form.set("lid", lid);
  return form;
}

/** 202 is "accepted", whether or not a mail will go (see similarRequest.ts). */
export async function sendOfficialJobsSimilarRequest(
  input: OfficialJobsSimilarRequestInput,
  fetchImpl: typeof fetch = fetch
): Promise<OfficialJobsSimilarRequestResult> {
  if (isSimilarResumeTooLarge(input.resumeFile)) {
    return { ok: false, code: "FILE_TOO_LARGE", error: "" };
  }
  let response: Response;
  try {
    response = await fetchImpl(OFFICIAL_JOBS_SIMILAR_REQUEST_PATH, {
      method: "POST",
      body: buildOfficialJobsSimilarRequestForm(input),
    });
  } catch {
    return { ok: false, code: "FAILED", error: "" };
  }
  if (response.status === 202) {
    const accepted = (await response.json().catch(() => ({}))) as { resumeIgnored?: unknown };
    return accepted.resumeIgnored === true ? { ok: true, resumeIgnored: true } : { ok: true };
  }
  const payload = (await response.json().catch(() => ({}))) as {
    code?: unknown;
    error?: unknown;
  };
  return {
    ok: false,
    code:
      typeof payload.code === "string"
        ? (payload.code as OfficialJobsSimilarRequestErrorCode)
        : "FAILED",
    error: typeof payload.error === "string" ? payload.error : "",
  };
}
