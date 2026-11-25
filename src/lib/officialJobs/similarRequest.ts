/**
 * "비슷한 공고 추천받기" on the job page: the person leaves an email and a
 * LinkedIn URL or a CV, and Ashley ([gtm agent]) mails similar postings.
 *
 * Contract between the job page's form and
 * POST /api/official-jobs/similar-request (multipart/form-data).
 */
import type { OfficialJobsOneScreenKind } from "@/lib/officialJobs/oneScreen";

export const OFFICIAL_JOBS_SIMILAR_REQUEST_PATH =
  "/api/official-jobs/similar-request";

/** The CV is read on the server and not stored; Vercel caps a request body near 4.5 MB. */
export const OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES = 4 * 1024 * 1024;

/** Form fields, all strings except `resume`. */
export type OfficialJobsSimilarRequestFields = {
  slug: string;
  kind: OfficialJobsOneScreenKind;
  email: string;
  linkedinUrl?: string;
  resume?: File;
  locale: "ko" | "en";
  /** "true" when the required consent box is checked. */
  consent: string;
  /** The /jobs visitor id (rememberOfficialJobsLanding), for attribution. */
  lid?: string;
};

/**
 * 202 means "accepted": the same answer whether or not a mail will go
 * (member, suppressed, no fit...), so the form can't be used to probe emails.
 * `resumeIgnored`: the CV could not be used (not a file the form takes, or no
 * text in it) and the request went on with the LinkedIn URL only; without a
 * LinkedIn URL such a CV is refused (FILE_INVALID).
 */
export type OfficialJobsSimilarRequestAccepted = { ok: true; resumeIgnored?: true };

export type OfficialJobsSimilarRequestErrorCode =
  | "EMAIL_INVALID"
  | "MATERIAL_REQUIRED"
  | "LINKEDIN_INVALID"
  | "FILE_INVALID"
  | "CONSENT_REQUIRED"
  | "RATE_LIMIT"
  | "UNAVAILABLE"
  | "FAILED";

export type OfficialJobsSimilarRequestError = {
  ok?: false;
  code: OfficialJobsSimilarRequestErrorCode;
  /** Localized message to show as is. */
  error: string;
};
