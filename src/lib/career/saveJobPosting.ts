import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { parseCareerJobUrl } from "./jobLinkImport";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  JobPostingClosedError,
  JobPostingDetailsRequiredError,
  formatJobPostingReadFailures,
  type JobPostingReadFailure,
} from "./jobPostingReadResult";
import type { CareerHiringPost, CareerJobPostingPublicFacts } from "./jobLinkImportServer";

/** save keeps the user's choice in Saved; suggest publishes Harper's choice in New opportunities. */
export type SaveJobPostingMode = "save" | "suggest" | "index";

/** Execution facts for the original agent; display names and unchanged effects
 * are not a narration the candidate needs with every recommendation. */
export function formatSavedJobPosting(value: {
  mode: SaveJobPostingMode; roleId: string; recommendationId?: string | null;
  created?: boolean; savedStage?: string | null; observationId?: string;
  retrievalFailures?: JobPostingReadFailure[];
  publicFacts?: CareerJobPostingPublicFacts;
}) {
  return [
    value.mode === "index" ? "Public posting indexed."
      : value.mode === "suggest" ? (value.created ? "Recommendation published." : "Existing recommendation reused.")
      : "External posting saved.",
    `Role ID: ${value.roleId}`,
    value.recommendationId ? `Recommendation ID: ${value.recommendationId}` : "",
    value.savedStage ? `Saved stage: ${value.savedStage}` : "",
    value.observationId ? `Public source: ${value.observationId}` : "",
    `Posting link: [posting](${value.roleId})`,
    ...(value.publicFacts ? [
      `Posting read during this request: ${value.publicFacts.canonicalUrl}`,
      `Role: ${value.publicFacts.companyName} — ${value.publicFacts.title}`,
      value.publicFacts.location ? `Location: ${value.publicFacts.location}` : "",
      value.publicFacts.workMode ? `Work mode: ${value.publicFacts.workMode}` : "",
      value.publicFacts.salaryRange ? `Published compensation: ${value.publicFacts.salaryRange}` : "",
    ] : []),
    ...(value.retrievalFailures?.length ? ["Retrieval attempts that did not complete:", formatJobPostingReadFailures(value.retrievalFailures)] : []),
  ].filter(Boolean).join("\n");
}

/** A posting the employer's own job site reports as closed is closed, not a page missing its title. */
function readFailureResult(error: JobPostingDetailsRequiredError | JobPostingClosedError) {
  const gone = error instanceof JobPostingDetailsRequiredError
    ? error.failures.find(failure => failure.stage === "employer job site") : undefined;
  return gone ? new JobPostingClosedError(error.url, gone.reason).toToolResult() : error.toToolResult();
}

export async function saveJobPosting(args: {
  admin: TalentAdminClient;
  talentId: string;
  url: string;
  title?: string;
  companyName?: string;
  mode?: SaveJobPostingMode;
  locale?: string;
  hiringPost?: CareerHiringPost | null;
  /** A deadline the posting states, ISO 8601. */
  deadline?: string | null;
}) {
  const mode = args.mode ?? "save";
  const identity = parseCareerJobUrl(args.url);
  const host = new URL(identity.canonicalUrl).hostname.replace(/^www\./, "");
  const ownHost = new URL(getConfiguredPublicSiteUrl()).hostname.replace(
    /^www\./,
    ""
  );
  if (
    host === ownHost ||
    host.endsWith(`.${ownHost}`) ||
    host === "matchharper.com" ||
    host.endsWith(".matchharper.com")
  )
    throw new Error(
      "Use the existing Harper-connected role tools for Harper roles; this tool saves external postings only."
    );
  // A public JD can also be attached to a private/internal role. Do not clone it as an external recommendation.
  const variants = [
    ...new Set(
      identity.roleUrlVariants.flatMap((value) => {
        const url = new URL(value.includes("://") ? value : `https://${value}`);
        const original = url.toString();
        if (url.pathname !== "/")
          url.pathname = url.pathname.endsWith("/")
            ? url.pathname.replace(/\/+$/, "")
            : `${url.pathname}/`;
        return [original, url.toString()];
      })
    ),
  ];
  const { data, error } = await args.admin
    .from("company_roles")
    .select("role_id,source_type,information")
    .in("external_jd_url", variants);
  if (error) throw new Error("Could not verify the posting's eligibility.");
  if (
    data?.some(
      (role) =>
        role.source_type !== "external" ||
        (role.information as Record<string, unknown> | null)?.testOnly === true
    )
  )
    throw new Error(
      "This posting belongs to a Harper-connected or test-only role and cannot be imported here."
    );
  const { importCareerJobLink } = await import("./jobLinkImportServer");
  if (mode === "index") {
    const { indexCareerJobLink } = await import("./jobLinkImportServer");
    let indexed;
    try {
      indexed = await indexCareerJobLink(args);
    } catch (error) {
      if (error instanceof JobPostingDetailsRequiredError || error instanceof JobPostingClosedError) return readFailureResult(error);
      throw error;
    }
    return { ok: true as const, mode, roleId: indexed.roleId, postingRoleIds: [indexed.roleId],
      recommendationId: null, created: false, savedStage: null,
      postingLink: `[posting](${indexed.roleId})`,
      modelOutput: formatSavedJobPosting({ mode, ...indexed }) };
  }
  let saved;
  try {
    saved = await importCareerJobLink({
      admin: args.admin,
      talentId: args.talentId,
      url: args.url,
      savedStage: mode === "suggest" ? null : "saved",
      preserveExistingProgress: true,
      manual: { title: args.title, companyName: args.companyName },
      hiringPost: args.hiringPost ?? null,
      deadline: args.deadline ?? null,
      locale: args.locale,
    });
  } catch (error) {
    if (
      error instanceof JobPostingDetailsRequiredError ||
      error instanceof JobPostingClosedError
    )
      return readFailureResult(error);
    throw error;
  }
  return {
    ok: true as const,
    mode,
    roleId: saved.roleId,
    postingRoleIds: [saved.roleId],
    recommendationId: saved.recommendationId,
    created: saved.createdRecommendation,
    savedStage: saved.savedStage,
    postingLink: `[posting](${saved.roleId})`,
    modelOutput: formatSavedJobPosting({ mode, roleId: saved.roleId,
      recommendationId: saved.recommendationId, created: saved.createdRecommendation,
      savedStage: saved.savedStage, retrievalFailures: saved.retrievalFailures,
      publicFacts: saved.publicFacts }),
    ...(saved.retrievalFailures?.length
      ? {
          retrievalFailures: saved.retrievalFailures,
        }
      : {}),
  };
}
