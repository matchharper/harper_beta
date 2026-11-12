import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { saveJobPosting } from "./saveJobPosting";
import { jobPostingReadErrorReason } from "./jobPostingReadResult";
import type { CareerHiringPost } from "./jobLinkImportServer";

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const isoOrNull = (value: unknown) => {
  const raw = text(value);
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export async function saveJobPostingsForTool(args: {
  admin: TalentAdminClient;
  talentId: string;
  input: Record<string, unknown>;
  locale?: string;
  scheduleAfter?: (task: () => Promise<void>) => void;
}) {
  // Persisted/in-flight calls may still use the former single-posting contract.
  // Only postings[] is exposed to new model calls.
  const postings =
    args.input.postings ?? (args.input.url ? [args.input] : null);
  if (!Array.isArray(postings) || !postings.length)
    throw new Error("postings must be a non-empty array.");

  const results = await Promise.all(
    postings.map(async (value, index) => {
      const input = record(value);
      const url = text(input?.url);
      try {
        if (!input || !url) throw new Error("Each posting requires its URL.");
        const mode = input.mode === "suggest" ? "suggest" : "save";
        const post = record(input.hiring_post);
        if (post && mode !== "suggest")
          throw new Error("A hiring post requires mode suggest.");
        const contactMethod = String(post?.contact_method ?? "unknown");
        const result = await saveJobPosting({
          admin: args.admin,
          talentId: args.talentId,
          url,
          title: text(input.title) ?? undefined,
          companyName: text(input.company_name) ?? undefined,
          mode,
          locale: args.locale,
          deadline: isoOrNull(input.deadline),
          hiringPost: post
            ? {
                posterName: text(post.poster_name),
                posterTitle: text(post.poster_title),
                posterProfileUrl: text(post.poster_profile_url),
                contactMethod: ([
                  "email",
                  "message",
                  "apply_link",
                  "comment",
                ].includes(contactMethod)
                  ? contactMethod
                  : "unknown") as CareerHiringPost["contactMethod"],
                contactEmail: text(post.contact_email),
                applyUrl: text(post.apply_url),
                postedAt: isoOrNull(post.posted_at),
              }
            : null,
        });
        return { index, url, ...result };
      } catch (error) {
        return {
          index,
          url,
          ok: false as const,
          code: "save_failed",
          modelOutput: `Posting import did not complete successfully: ${jobPostingReadErrorReason(error)}`,
        };
      }
    })
  );
  const recommendationIds = results.flatMap(result =>
    result.ok && result.mode === "suggest" && result.created ? [result.recommendationId] : []);
  if (recommendationIds.length && args.scheduleAfter) {
    args.scheduleAfter(async () => {
      try {
        const { publishImportedPostingEvaluations } = await import("./matching/externalSearch");
        await publishImportedPostingEvaluations(args.admin, args.talentId, recommendationIds);
      } catch (error) {
        // The import transaction already queued durable work; normal recovery dispatches it.
        console.error("[career/import] Scoring dispatch deferred to recovery", error);
      }
    });
  }
  return {
    ok: results.every((result) => result.ok),
    results,
    postingRoleIds: [
      ...new Set(
        results.flatMap((result) => (result.ok ? result.postingRoleIds : []))
      ),
    ],
    modelOutput: results
      .map(
        (result) =>
          `Posting ${result.index + 1}${result.url ? ` — ${result.url}` : ""}\n${result.modelOutput}`
      )
      .join("\n\n"),
  };
}
