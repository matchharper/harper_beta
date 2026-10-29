import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { parseCareerJobUrl } from "./jobLinkImport";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  JobPostingDetailsRequiredError,
  formatJobPostingReadFailures,
} from "./jobPostingReadResult";

export async function saveJobPosting(args: {
  admin: TalentAdminClient;
  talentId: string;
  url: string;
  title?: string;
  companyName?: string;
}) {
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
      savedStage: "saved",
      preserveExistingProgress: true,
      manual: { title: args.title, companyName: args.companyName },
    });
  } catch (error) {
    if (error instanceof JobPostingDetailsRequiredError)
      return error.toToolResult();
    throw error;
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
