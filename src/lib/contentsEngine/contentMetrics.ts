import {
  callApifyActor,
  getApifyApiToken,
  listApifyDatasetItems,
} from "@/lib/apifyRest";
import { notifyGtmContentCompensation } from "@/lib/contentsEngine/slack";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const INSTAGRAM_POST_ACTOR = "apify/instagram-post-scraper";
const INSTAGRAM_COMMENT_ACTOR = "apify/instagram-comment-scraper";
const MAX_COMMENT_RECORDS_PER_POST = 10_000;

type ContentTarget = {
  account_id: string;
  compensation_cost_id: string | null;
  compensation_strategy_id: string | null;
  id: string;
  platform_metrics_due_at: string | null;
  platform_metrics_finalized_at: string | null;
  platform_metrics_last_collected_at: string | null;
  post_url: string;
  published_at: string;
  ref: number;
  title: string;
};

type Account = {
  handle: string | null;
  id: string;
  platform: string;
};

type InstagramPost = {
  commentsCount?: number | null;
  id?: string;
  inputUrl?: string;
  likesCount?: number | null;
  shortCode?: string;
  url?: string;
  videoPlayCount?: number | null;
  videoViewCount?: number | null;
  viewsCount?: number | null;
};

type InstagramComment = {
  ownerUsername?: string | null;
  postUrl?: string | null;
  replies?: InstagramComment[] | null;
};

type MetricObservation = {
  metric: "comments" | "comments_non_author" | "likes" | "views";
  missingReason?: string | null;
  value: number | null;
};

function adminClient() {
  return getSupabaseAdmin() as any;
}

function shortcode(value: string | null | undefined) {
  const match = String(value ?? "").match(
    /instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/i
  );
  return match?.[1] ?? "";
}

function finiteMetric(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function normalizeHandle(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function flattenComments(comments: InstagramComment[]) {
  const output: InstagramComment[] = [];
  const visit = (comment: InstagramComment) => {
    output.push(comment);
    for (const reply of comment.replies ?? []) visit(reply);
  };
  for (const comment of comments) visit(comment);
  return output;
}

function shouldCollect(target: ContentTarget, now: number) {
  if (!target.platform_metrics_last_collected_at) return true;
  if (
    target.compensation_strategy_id &&
    !target.compensation_cost_id &&
    !target.platform_metrics_finalized_at &&
    target.platform_metrics_due_at
  ) {
    const dueAt = Date.parse(target.platform_metrics_due_at);
    const collectedAt = Date.parse(target.platform_metrics_last_collected_at);
    return Number.isFinite(dueAt) && dueAt <= now && collectedAt < dueAt;
  }
  return false;
}

async function loadInstagramTargets(limit: number) {
  const supabase = adminClient();
  const { data: rows, error } = await supabase
    .from("gtm_contents")
    .select(
      "id,ref,title,post_url,published_at,account_id,compensation_strategy_id,compensation_cost_id,platform_metrics_due_at,platform_metrics_last_collected_at,platform_metrics_finalized_at"
    )
    .is("archived_at", null)
    .not("published_at", "is", null)
    .not("post_url", "is", null)
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const targets = ((rows ?? []) as ContentTarget[]).filter((row) =>
    shouldCollect(row, Date.now())
  );
  const accountIds = [...new Set(targets.map((row) => row.account_id))];
  if (accountIds.length === 0) return [];
  const { data: accounts, error: accountsError } = await supabase
    .from("gtm_accounts")
    .select("id,platform,handle")
    .in("id", accountIds);
  if (accountsError) throw new Error(accountsError.message);
  const accountById = new Map(
    ((accounts ?? []) as Account[]).map((account) => [account.id, account])
  );
  return targets
    .map((target) => ({ target, account: accountById.get(target.account_id) }))
    .filter(
      (item): item is { target: ContentTarget; account: Account } =>
        Boolean(
          item.account &&
            item.account.platform.toLowerCase() === "instagram" &&
            shortcode(item.target.post_url)
        )
    )
    .slice(0, limit);
}

async function writeMetrics(args: {
  asOf: string;
  content: ContentTarget;
  observations: MetricObservation[];
  postRunId: string;
  commentRunId: string;
}) {
  const sourceRef = `apify:instagram:${args.postRunId}:${args.commentRunId}:${shortcode(
    args.content.post_url
  )}`;
  const rows = args.observations.map((observation) => ({
    as_of: args.asOf,
    collected_at: args.asOf,
    content_id: args.content.id,
    definition_version:
      observation.metric === "comments_non_author"
        ? "instagram_public_comments_excluding_creator_v1"
        : "instagram_post_statistics_v1",
    metric: observation.metric,
    missing_reason: observation.missingReason ?? null,
    source_ref: sourceRef,
    unit: "count",
    value: observation.value,
    value_kind: "cumulative",
  }));
  const supabase = adminClient();
  const { error } = await supabase.from("gtm_metric_snapshots").insert(rows);
  if (error) throw new Error(error.message);
  const { error: updateError } = await supabase
    .from("gtm_contents")
    .update({
      platform_metrics_last_collected_at: args.asOf,
      platform_metrics_last_error: null,
    })
    .eq("id", args.content.id);
  if (updateError) throw new Error(updateError.message);
}

async function recordCollectionFailure(contentId: string, error: unknown) {
  const message =
    error instanceof Error ? error.message.slice(0, 2000) : "Metric collection failed";
  await adminClient()
    .from("gtm_contents")
    .update({ platform_metrics_last_error: message })
    .eq("id", contentId);
}

async function finalizeIfDue(content: ContentTarget, asOf: string) {
  if (
    !content.compensation_strategy_id ||
    content.compensation_cost_id ||
    !content.platform_metrics_due_at ||
    Date.parse(content.platform_metrics_due_at) > Date.parse(asOf)
  ) {
    return null;
  }
  const supabase = adminClient();
  const { data, error } = await supabase.rpc(
    "gtm_finalize_content_compensation",
    { p_content_id: content.id }
  );
  if (error) throw new Error(error.message);
  const settlement = data as {
    amount: number;
    content_id: string;
    content_ref: number;
    cost_id: string;
    cost_ref: number;
    currency: string;
    notify_needed: boolean;
    strategy: Record<string, unknown>;
    title: string;
  };
  if (settlement.notify_needed) {
    const views = await supabase
      .from("gtm_metric_snapshots")
      .select("value,as_of")
      .eq("content_id", content.id)
      .eq("metric", "views")
      .not("value", "is", null)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    const slack = await notifyGtmContentCompensation({
      amount: settlement.amount,
      contentRef: settlement.content_ref,
      costId: settlement.cost_id,
      costRef: settlement.cost_ref,
      currency: settlement.currency,
      metricAsOf: views.data?.as_of ?? asOf,
      strategyName: String(settlement.strategy?.name ?? "가격 전략"),
      title: settlement.title,
      views: Number(views.data?.value ?? 0),
    });
    const notification = await supabase.rpc(
      "gtm_record_compensation_slack_notification",
      {
        p_channel_id: slack.channel,
        p_cost_id: settlement.cost_id,
        p_slack_ts: slack.ts,
      }
    );
    if (notification.error) throw new Error(notification.error.message);
  }
  return settlement;
}

export async function collectPublishedContentMetrics(args?: { limit?: number }) {
  const targets = await loadInstagramTargets(
    Math.max(1, Math.min(args?.limit ?? 50, 100))
  );
  if (targets.length === 0) {
    return { collected: 0, failed: 0, settled: 0, targets: 0 };
  }
  const token = getApifyApiToken("APIFY_CLIENT_KEY is required for content metrics");
  const urls = targets.map(({ target }) => target.post_url);
  const [postRun, commentRun] = await Promise.all([
    callApifyActor({
      actorId: INSTAGRAM_POST_ACTOR,
      input: { dataDetailLevel: "detailedData", username: urls },
      maxRunWaitSeconds: 240,
      token,
      waitForFinishSeconds: 60,
    }),
    callApifyActor({
      actorId: INSTAGRAM_COMMENT_ACTOR,
      input: {
        directUrls: urls,
        includeReplies: true,
        resultsLimit: MAX_COMMENT_RECORDS_PER_POST,
      },
      maxRunWaitSeconds: 240,
      token,
      waitForFinishSeconds: 60,
    }),
  ]);
  const [posts, comments] = await Promise.all([
    listApifyDatasetItems<InstagramPost>({
      datasetId: postRun.defaultDatasetId,
      limit: targets.length * 2,
      token,
    }),
    listApifyDatasetItems<InstagramComment>({
      datasetId: commentRun.defaultDatasetId,
      limit: targets.length * MAX_COMMENT_RECORDS_PER_POST,
      token,
    }),
  ]);
  const postByShortcode = new Map(
    posts.map((post) => [
      post.shortCode || shortcode(post.inputUrl || post.url),
      post,
    ])
  );
  const commentsByShortcode = new Map<string, InstagramComment[]>();
  for (const comment of comments) {
    const key = shortcode(comment.postUrl);
    if (!key) continue;
    const list = commentsByShortcode.get(key) ?? [];
    list.push(comment);
    commentsByShortcode.set(key, list);
  }

  const asOf = new Date().toISOString();
  const results: Array<{
    contentRef: number;
    error?: string;
    settled?: boolean;
  }> = [];
  for (const { account, target } of targets) {
    try {
      const key = shortcode(target.post_url);
      const post = postByShortcode.get(key);
      if (!post) throw new Error("Instagram post was not returned by the collector");
      const publicComments = flattenComments(commentsByShortcode.get(key) ?? []);
      const creatorHandle = normalizeHandle(account.handle);
      const observedCreatorComments = publicComments.filter(
        (comment) => normalizeHandle(comment.ownerUsername) === creatorHandle
      ).length;
      const observedNonAuthorComments = publicComments.filter(
        (comment) => normalizeHandle(comment.ownerUsername) !== creatorHandle
      ).length;
      const commentsCount = finiteMetric(post.commentsCount);
      const publicCoverageIncomplete =
        commentsCount !== null && publicComments.length < commentsCount;
      const nonAuthorComments =
        commentsCount === null
          ? observedNonAuthorComments
          : Math.max(0, commentsCount - observedCreatorComments);
      await writeMetrics({
        asOf,
        commentRunId: commentRun.id,
        content: target,
        observations: [
          {
            metric: "views",
            value: finiteMetric(
              post.videoPlayCount,
              post.videoViewCount,
              post.viewsCount
            ),
            missingReason:
              finiteMetric(
                post.videoPlayCount,
                post.videoViewCount,
                post.viewsCount
              ) === null
                ? "not_exposed_by_platform"
                : null,
          },
          {
            metric: "likes",
            value: finiteMetric(post.likesCount),
            missingReason:
              finiteMetric(post.likesCount) === null
                ? "hidden_by_platform"
                : null,
          },
          { metric: "comments", value: commentsCount },
          {
            metric: "comments_non_author",
            value: nonAuthorComments,
            missingReason:
              commentsCount === null
                ? "public_comment_records_only"
                : publicCoverageIncomplete
                  ? "platform_total_minus_observed_creator_comments"
                  : null,
          },
        ],
        postRunId: postRun.id,
      });
      const settlement = await finalizeIfDue(target, asOf);
      results.push({ contentRef: target.ref, settled: Boolean(settlement) });
    } catch (error) {
      await recordCollectionFailure(target.id, error);
      results.push({
        contentRef: target.ref,
        error: error instanceof Error ? error.message : "Collection failed",
      });
    }
  }
  return {
    collected: results.filter((result) => !result.error).length,
    failed: results.filter((result) => result.error).length,
    postRunId: postRun.id,
    commentRunId: commentRun.id,
    results,
    settled: results.filter((result) => result.settled).length,
    targets: targets.length,
  };
}
