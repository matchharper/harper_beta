import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { parseCareerJobUrl } from "./jobLinkImport";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  JobPostingClosedError,
  JobPostingDetailsRequiredError,
  formatJobPostingReadFailures,
} from "./jobPostingReadResult";
import type { CareerHiringPost } from "./jobLinkImportServer";

/** save: the user asked to keep it ('저장함'). suggest: Harper found it; copy it
 * for evaluation and publish it to '새 기회' only if it fits. */
export type SaveJobPostingMode = "save" | "suggest";

export async function saveJobPosting(args: {
  admin: TalentAdminClient;
  talentId: string;
  url: string;
  title?: string;
  companyName?: string;
  mode?: SaveJobPostingMode;
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
    });
  } catch (error) {
    if (
      error instanceof JobPostingDetailsRequiredError ||
      error instanceof JobPostingClosedError
    )
      return error.toToolResult();
    throw error;
  }
  if (mode === "suggest") {
    const onList = Boolean(saved.recommendationId);
    return {
      ok: true as const,
      mode,
      roleId: saved.roleId,
      postingRoleIds: [saved.roleId],
      recommendationId: saved.recommendationId,
      created: false,
      savedStage: saved.savedStage,
      // No posting chip until it is evaluated and published.
      postingLink: null,
      hiringPost: Boolean(args.hiringPost),
      modelOutput: [
        onList
          ? `This posting is already in the user's Jobs (recommendation ${saved.recommendationId}, stage ${saved.savedStage ?? "none"}). Do not publish it again.`
          : "Posting copied for this user only. It is not visible yet.",
        `Role ID: ${saved.roleId}`,
        ...(onList
          ? []
          : [
              `Next: evaluate it with search_opportunities using roleIds [${saved.roleId}]. If the evaluation fits, publish it to the new-opportunities list with upsert_opportunities add, this roleId and the evaluationId. If it does not fit, leave it unpublished.`,
            ]),
        ...(saved.retrievalFailures?.length
          ? [
              "Retrieval attempts that did not complete:",
              formatJobPostingReadFailures(saved.retrievalFailures),
            ]
          : []),
      ].join("\n"),
    };
  }
  return {
    ok: true as const,
    roleId: saved.roleId,
    postingRoleIds: [saved.roleId],
    recommendationId: saved.recommendationId,
    created: saved.createdRecommendation,
    savedStage: saved.savedStage,
    postingLink: `[posting](${saved.roleId})`,
    ...(saved.retrievalFailures?.length
      ? {
          retrievalFailures: saved.retrievalFailures,
          modelOutput: [
            "External posting saved.",
            `Role ID: ${saved.roleId}`,
            `Recommendation ID: ${saved.recommendationId}`,
            `Created recommendation: ${saved.createdRecommendation}`,
            `Saved stage: ${saved.savedStage}`,
            `Posting link: [posting](${saved.roleId})`,
            "Retrieval attempts that did not complete:",
            formatJobPostingReadFailures(saved.retrievalFailures),
          ].join("\n"),
        }
      : {}),
  };
}
