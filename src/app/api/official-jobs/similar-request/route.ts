import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import {
  REQUEST_CV_MAX_CHARS, REQUEST_CV_MIN_CHARS, REQUEST_FILE_ERRORS, newRequestRow, requestEmail, requestError, requestLinkedin,
  type RequestErrorCode,
} from "@/lib/gtmPlays/agent/request";
import { acceptJobPageRequest, requestMailDomainOk, runJobPageRequest } from "@/lib/gtmPlays/agent/request.server";
import {
  OFFICIAL_JOBS_ONESCREEN_COOKIE,
  OFFICIAL_JOBS_ONESCREEN_ROLLOUT,
  decideOfficialJobsOneScreenScope,
  parseOfficialJobsOneScreenArm,
} from "@/lib/officialJobs/oneScreen";
import { getOfficialJobPage } from "@/lib/officialJobs/server";
import { OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES } from "@/lib/officialJobs/similarRequest";
import { isOfficialJobsSimilarRequestOpen } from "@/lib/officialJobs/similarRequest.server";
import {
  extractTalentDocumentTextContentBestEffort,
  validateResumeFileContent,
} from "@/lib/talentOnboarding/documentUpload";

/**
 * POST /api/official-jobs/similar-request (contract: lib/officialJobs/similarRequest.ts): "비슷한 공고 추천받기" on the
 * job page. Checks the form, writes the request (gtm_agent_people, method 'request': agent/request.server.ts) and
 * answers 202 whatever happens next (a member, an opted-out address, no posting to send yet all look the same), then
 * runs the agent's steps for that one person after the answer. The tick takes up a run that did not finish.
 *
 * The CV is read in memory and never stored (its text is kept on the request, cleared when they opt out). A CV that
 * can't be used (not a file the form takes, or too little text) is refused without a LinkedIn URL; with one the request
 * goes on with the LinkedIn only and the answer says `resumeIgnored` (the page shows it). The posting is the one the
 * server loads by slug, never what the browser sends.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The steps after the answer (profile read, pick, grader, mail) run within this (agent/request.ts REQUEST_LEASE_MS is longer). */
export const maxDuration = 300;

type Locale = "ko" | "en";

function fail(code: RequestErrorCode, locale: Locale, status: number, error = requestError(code, locale)) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || req.headers.get("x-real-ip")?.trim() || "").slice(0, 80) || null;
}

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("FAILED", "ko", 400);
  }
  const locale: Locale = text(form.get("locale")) === "en" ? "en" : "ko";
  try {
    if (text(form.get("consent")) !== "true") return fail("CONSENT_REQUIRED", locale, 400);
    const email = requestEmail(form.get("email"), locale);
    if (!email.ok) return fail("EMAIL_INVALID", locale, 400, email.error);
    const linkedinUrl = requestLinkedin(form.get("linkedinUrl"));
    if (linkedinUrl === null) return fail("LINKEDIN_INVALID", locale, 400);
    const resumeEntry = form.get("resume");
    const resume = resumeEntry instanceof File && resumeEntry.size > 0 ? resumeEntry : null;
    // One of the two is enough; both are fine (the form says so).
    if (!linkedinUrl && !resume) return fail("MATERIAL_REQUIRED", locale, 400);
    if (resume && resume.size > OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES) {
      return fail("FILE_INVALID", locale, 400, REQUEST_FILE_ERRORS.tooLarge[locale]);
    }
    const bytes = resume ? new Uint8Array(await resume.arrayBuffer()) : null;
    const resumeFileOk = resume && bytes
      ? validateResumeFileContent({ bytes, fileName: resume.name, suppliedContentType: resume.type })
      : true;
    // With a LinkedIn address a file the form does not take is left out below, as a CV without text is.
    if (!resumeFileOk && !linkedinUrl) return fail("FILE_INVALID", locale, 400);

    // The posting as the server loads it, in the one screen's scope (an A/B posting only for arm B).
    const slug = text(form.get("slug")).trim();
    const page = slug ? await getOfficialJobPage(slug, { includeClosedRole: OFFICIAL_JOBS_ONESCREEN_ROLLOUT.closedRoleCard }) : null;
    const scope = page ? decideOfficialJobsOneScreenScope({ roleId: page.job.roleId, linkedRole: page.linkedRole }) : null;
    const arm = parseOfficialJobsOneScreenArm(req.cookies.get(OFFICIAL_JOBS_ONESCREEN_COOKIE)?.value);
    if (!page || !scope || (scope.abTest && arm !== "B")) return fail("UNAVAILABLE", locale, 409);
    if (!(await isOfficialJobsSimilarRequestOpen())) return fail("UNAVAILABLE", locale, 409);
    if (!(await requestMailDomainOk(email.email))) return fail("EMAIL_INVALID", locale, 400);

    // The CV's text, read here and never stored as a file; too little text (a scanned PDF) is refused without a LinkedIn address.
    let cvText: string | null = null;
    let resumeIgnored = false;
    if (resume && bytes) {
      if (resumeFileOk) {
        cvText = (await extractTalentDocumentTextContentBestEffort({
          bytes, fileName: resume.name, maxChars: REQUEST_CV_MAX_CHARS * 2, maxPdfPages: 10,
          onError: (error) => console.warn("[similar-request] CV text", error instanceof Error ? error.message : String(error)),
        }))?.trim() || null;
      }
      if (!cvText || cvText.replace(/\s+/g, "").length < REQUEST_CV_MIN_CHARS) {
        // With a LinkedIn address the request goes on with the LinkedIn only, and the page says the CV was not used.
        if (!linkedinUrl) return fail("FILE_INVALID", locale, 400, REQUEST_FILE_ERRORS.noText[locale]);
        cvText = null;
        resumeIgnored = true;
      }
    }

    const ip = clientIp(req);
    const { job } = page;
    const row = newRequestRow({
      email: email.email, linkedinUrl: linkedinUrl || null, cvText, locale,
      ipHash: ip ? createHash("sha256").update(`gtm-job-page-request:${ip}`).digest("hex") : null,
      lid: text(form.get("lid")) || null, now: new Date(),
      seed: {
        officialJobId: job.id, slug: job.slug, roleId: job.roleId, kind: scope.kind, companyName: job.companyName,
        roleTitle: job.roleTitle, seniority: job.seniority, location: job.location || null,
        description: job.roleDescriptionMarkdown || job.shortDescription || "",
      },
    });
    const accepted = await acceptJobPageRequest(row);
    if (accepted.status === "rate_limited") return fail("RATE_LIMIT", locale, 429);
    // The agent's steps for this one person, after the answer (the tick is the retry path).
    after(() => runJobPageRequest(accepted.personId).then(
      (outcome) => console.info("[similar-request] ran", accepted.personId, outcome),
      (error) => console.error("[similar-request] run failed", accepted.personId, error),
    ));
    return NextResponse.json(resumeIgnored ? { ok: true, resumeIgnored: true } : { ok: true }, { status: 202 });
  } catch (error) {
    console.error("[similar-request] failed", error);
    return fail("FAILED", locale, 500);
  }
}
