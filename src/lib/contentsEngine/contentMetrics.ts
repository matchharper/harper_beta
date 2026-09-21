import {
  callApifyActor,
  getApifyApiToken,
  listApifyDatasetItems,
} from "@/lib/apifyRest";
import { notifyGtmContentCompensation } from "@/lib/contentsEngine/slack";
import {
  concludeContentPerformance,
  insufficientContentPerformanceConclusion,
  type ContentPerformanceConclusion,
} from "@/lib/contentsEngine/performanceConclusion";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const INSTAGRAM_POST_ACTOR = "apify/instagram-post-scraper";
const INSTAGRAM_COMMENT_ACTOR = "apify/instagram-comment-scraper";
const MAX_COMMENT_RECORDS_PER_POST = 10_000;
const POST_COLLECTION_CHARGE_CAP_USD = 5;
const COMMENT_COLLECTION_CHARGE_CAP_USD = 25;

type ContentTarget = {
  account_id: string | null;
  compensation_cost_id: string | null;
  compensation_snapshot: Record<string, unknown>;
  compensation_strategy_id: string | null;
  id: string;
  platform_metrics_due_at: string | null;
  platform_metrics_finalized_at: string | null;
  platform_metrics_last_collected_at: string | null;
  post_url: string | null;
  published_at: string;
  ref: number;
  title: string;
};

type CompensationSettlement = {
  amount: number;
  content_id: string;
  content_ref: number;
  cost_id: string;
  cost_ref: number;
  currency: string;
  measured_views?: number | null;
  metric_as_of?: string | null;
  notify_needed: boolean;
  strategy: Record<string, unknown>;
  title: string;
};

type SettlementDisplay = {
  comments_non_author: number | null;
  creator_name: string;
  finalized_payable: number | null;
  id: string;
  likes: number | null;
  performance_conclusion: string | null;
  platform_metrics_as_of: string | null;
  post_url: string | null;
  title: string;
  views: number | null;
};

type PendingCompensationNotification = {
  amount: number;
  content_id: string;
  content_ref: number;
  cost_id: string;
  cost_ref: number;
  currency: string;
  measured_views: string | null;
  metric_as_of: string | null;
  metric_as_of_fallback: string | null;
  strategy: Record<string, unknown>;
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
  if (target.compensation_snapshot?.pricing_model === "fixed") return false;
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
      "id,ref,title,post_url,published_at,account_id,compensation_strategy_id,compensation_snapshot,compensation_cost_id,platform_metrics_due_at,platform_metrics_last_collected_at,platform_metrics_finalized_at"
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
  const accountIds = [
    ...new Set(
      targets
        .map((row) => row.account_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
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
    .map((target) => ({
      target,
      account: target.account_id
        ? accountById.get(target.account_id)
        : undefined,
    }))
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

async function loadDueFixedTargets(limit: number) {
  const { data, error } = await adminClient()
    .from("gtm_contents")
    .select(
      "id,ref,title,post_url,published_at,account_id,compensation_strategy_id,compensation_snapshot,compensation_cost_id,platform_metrics_due_at,platform_metrics_last_collected_at,platform_metrics_finalized_at"
    )
    .is("archived_at", null)
    .is("compensation_cost_id", null)
    .not("compensation_strategy_id", "is", null)
    .not("published_at", "is", null)
    .lte("platform_metrics_due_at", new Date().toISOString())
    .contains("compensation_snapshot", { pricing_model: "fixed" })
    .order("platform_metrics_due_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentTarget[];
}

async function writeMetrics(args: {
  asOf: string;
  content: ContentTarget;
  observations: MetricObservation[];
  postRunId: string;
  commentRunId: string | null;
  warning?: string | null;
}) {
  const sourceRef = `apify:instagram:${args.postRunId}:${args.commentRunId ?? "comments-unavailable"}:${shortcode(
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
      platform_metrics_last_error: args.warning?.slice(0, 2000) ?? null,
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

async function notifySettlement(
  settlement: CompensationSettlement,
  metricAsOf: string
) {
  const supabase = adminClient();
  if (!settlement.notify_needed) return false;
  const display = await loadSettlementDisplay(settlement.content_id);
  const conclusion = await loadOrCreatePerformanceConclusion({
    costId: settlement.cost_id,
    currency: settlement.currency,
    display,
    amount: settlement.amount,
  });
  let viewsValue: number | null = display.views;
  let viewsAsOf = metricAsOf;
  if (settlement.strategy?.pricing_model !== "fixed") {
    if (settlement.measured_views !== undefined) {
      viewsValue = Number(settlement.measured_views ?? 0);
      viewsAsOf = settlement.metric_as_of ?? metricAsOf;
    } else {
      const views = await supabase
        .from("gtm_metric_snapshots")
        .select("value,as_of")
        .eq("content_id", settlement.content_id)
        .eq("metric", "views")
        .not("value", "is", null)
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (views.error) throw new Error(views.error.message);
      viewsValue = Number(views.data?.value ?? 0);
      viewsAsOf = views.data?.as_of ?? metricAsOf;
    }
  }
  const slack = await notifyGtmContentCompensation({
    amount: settlement.amount,
    commentsNonAuthor: display.comments_non_author,
    contentRef: settlement.content_ref,
    costId: settlement.cost_id,
    costRef: settlement.cost_ref,
    creatorName: display.creator_name,
    currency: settlement.currency,
    likes: display.likes,
    metricAsOf: viewsAsOf,
    performanceRating: conclusion.rating,
    performanceReason: conclusion.reason,
    postUrl: display.post_url,
    pricingModel:
      settlement.strategy?.pricing_model === "fixed"
        ? "fixed"
        : "base_plus_views",
    strategyName: String(settlement.strategy?.name ?? "가격 전략"),
    title: settlement.title,
    views: viewsValue,
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
  return true;
}

async function loadSettlementDisplay(contentId: string) {
  const { data, error } = await adminClient()
    .from("gtm_content_sheet_v1")
    .select(
      "id,title,creator_name,post_url,views,likes,comments_non_author,platform_metrics_as_of,finalized_payable,performance_conclusion"
    )
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Settled content display record not found");
  return data as SettlementDisplay;
}

async function loadOrCreatePerformanceConclusion(args: {
  amount: number;
  costId: string;
  currency: string;
  display: SettlementDisplay;
}) {
  const supabase = adminClient();
  const existing = await supabase
    .from("gtm_activities")
    .select("body,payload")
    .eq("provider", "contents_engine")
    .eq("connection_ref", "compensation-performance-review")
    .eq("external_id", args.costId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    return {
      model: existing.data.payload?.model ?? null,
      rating: existing.data.payload?.rating ?? "insufficient",
      reason: existing.data.body,
    } as ContentPerformanceConclusion;
  }

  const comparable = await supabase
    .from("gtm_content_sheet_v1")
    .select("id,views,likes,comments_non_author,finalized_payable")
    .is("archived_at", null)
    .neq("id", args.display.id)
    .order("published_at", { ascending: false })
    .limit(50);
  if (comparable.error) throw new Error(comparable.error.message);

  let conclusion: ContentPerformanceConclusion;
  try {
    conclusion = await concludeContentPerformance({
      amount: args.amount,
      commentsNonAuthor: args.display.comments_non_author,
      comparableContents: (comparable.data ?? []).map((item: any) => ({
        amount:
          item.finalized_payable === null
            ? null
            : Number(item.finalized_payable),
        commentsNonAuthor:
          item.comments_non_author === null
            ? null
            : Number(item.comments_non_author),
        likes: item.likes === null ? null : Number(item.likes),
        views: item.views === null ? null : Number(item.views),
      })),
      creatorName: args.display.creator_name,
      currency: args.currency,
      likes: args.display.likes,
      title: args.display.title,
      views: args.display.views,
    });
  } catch (error) {
    conclusion = insufficientContentPerformanceConclusion(error);
  }

  const insert = await supabase.from("gtm_activities").insert({
    body: conclusion.reason,
    connection_ref: "compensation-performance-review",
    entity: "gtm_contents",
    entity_id: args.display.id,
    external_id: args.costId,
    kind: "performance_review",
    payload: {
      amount: args.amount,
      comments_non_author: args.display.comments_non_author,
      cost_id: args.costId,
      currency: args.currency,
      likes: args.display.likes,
      model: conclusion.model,
      rating: conclusion.rating,
      scope: "settlement_notification",
      views: args.display.views,
    },
    provider: "contents_engine",
    source_ref: `cost:${args.costId}`,
  });
  if (insert.error && insert.error.code !== "23505") {
    throw new Error(insert.error.message);
  }
  return conclusion;
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
  const { data, error } = await adminClient().rpc(
    "gtm_finalize_content_compensation",
    { p_content_id: content.id }
  );
  if (error) throw new Error(error.message);
  return data as CompensationSettlement;
}

async function retryPendingCompensationNotifications(limit: number) {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc(
    "gtm_pending_compensation_notifications",
    { p_limit: limit }
  );
  if (error) throw new Error(error.message);
  const pending = (data ?? []) as PendingCompensationNotification[];
  let sentCount = 0;
  let failedCount = 0;
  for (const item of pending) {
    try {
      await notifySettlement(
        {
          amount: Number(item.amount),
          content_id: item.content_id,
          content_ref: item.content_ref,
          cost_id: item.cost_id,
          cost_ref: item.cost_ref,
          currency: item.currency,
          measured_views:
            item.measured_views === null
              ? null
              : Number(item.measured_views),
          metric_as_of: item.metric_as_of,
          notify_needed: true,
          strategy: item.strategy ?? {},
          title: item.title,
        },
        item.metric_as_of_fallback ?? new Date().toISOString()
      );
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("[contents-engine/content-metrics] Slack retry failed", {
        contentId: item.content_id,
        costId: item.cost_id,
        error,
      });
    }
  }
  return { failed: failedCount, sent: sentCount };
}

async function collectInstagramMetrics(
  targets: Array<{ account: Account; target: ContentTarget }>
) {
  if (targets.length === 0) {
    return {
      commentCollectionError: null,
      commentRunId: null,
      postRunId: null,
      results: [] as Array<{
        contentRef: number;
        error?: string;
        settled?: boolean;
        settlementError?: string;
        warning?: string;
      }>,
    };
  }
  const token = getApifyApiToken("APIFY_CLIENT_KEY is required for content metrics");
  const urls = targets.map(({ target }) => target.post_url as string);
  const [postRunResult, commentRunResult] = await Promise.allSettled([
    callApifyActor({
      actorId: INSTAGRAM_POST_ACTOR,
      input: { dataDetailLevel: "detailedData", username: urls },
      maxRunWaitSeconds: 240,
      maxTotalChargeUsd: POST_COLLECTION_CHARGE_CAP_USD,
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
      maxTotalChargeUsd: COMMENT_COLLECTION_CHARGE_CAP_USD,
      token,
      waitForFinishSeconds: 60,
    }),
  ]);
  if (postRunResult.status === "rejected") throw postRunResult.reason;
  const postRun = postRunResult.value;
  const posts = await listApifyDatasetItems<InstagramPost>({
    datasetId: postRun.defaultDatasetId,
    limit: targets.length * 2,
    token,
  });
  let commentRunId: string | null = null;
  let comments: InstagramComment[] = [];
  let commentCollectionError: string | null = null;
  if (commentRunResult.status === "fulfilled") {
    commentRunId = commentRunResult.value.id;
    try {
      comments = await listApifyDatasetItems<InstagramComment>({
        datasetId: commentRunResult.value.defaultDatasetId,
        limit: targets.length * MAX_COMMENT_RECORDS_PER_POST,
        token,
      });
    } catch (error) {
      commentCollectionError =
        error instanceof Error ? error.message : "Comment collection failed";
    }
  } else {
    commentCollectionError =
      commentRunResult.reason instanceof Error
        ? commentRunResult.reason.message
        : "Comment collection failed";
  }
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
    settlementError?: string;
    warning?: string;
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
      const nonAuthorComments = commentCollectionError
        ? null
        : commentsCount === null
          ? observedNonAuthorComments
          : Math.max(0, commentsCount - observedCreatorComments);
      await writeMetrics({
        asOf,
        commentRunId,
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
              commentCollectionError
                ? "comment_collection_failed"
                : commentsCount === null
                ? "public_comment_records_only"
                : publicCoverageIncomplete
                  ? "platform_total_minus_observed_creator_comments"
                  : null,
          },
        ],
        postRunId: postRun.id,
        warning: commentCollectionError
          ? `Comments unavailable: ${commentCollectionError}`
          : null,
      });
    } catch (error) {
      await recordCollectionFailure(target.id, error);
      results.push({
        contentRef: target.ref,
        error: error instanceof Error ? error.message : "Collection failed",
      });
      continue;
    }
    try {
      const settlement = await finalizeIfDue(target, asOf);
      results.push({
        contentRef: target.ref,
        settled: Boolean(settlement),
        ...(commentCollectionError
          ? { warning: `Comments unavailable: ${commentCollectionError}` }
          : {}),
      });
    } catch (error) {
      results.push({
        contentRef: target.ref,
        settlementError:
          error instanceof Error ? error.message : "Settlement failed",
      });
    }
  }
  return {
    commentCollectionError,
    commentRunId,
    postRunId: postRun.id,
    results,
  };
}

export async function collectPublishedContentMetrics(args?: { limit?: number }) {
  const limit = Math.max(1, Math.min(args?.limit ?? 50, 100));
  const targets = await loadInstagramTargets(limit);
  let instagram: Awaited<ReturnType<typeof collectInstagramMetrics>>;
  try {
    instagram = await collectInstagramMetrics(targets);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Instagram collection failed";
    await Promise.all(
      targets.map(({ target }) => recordCollectionFailure(target.id, error))
    );
    instagram = {
      commentCollectionError: null,
      commentRunId: null,
      postRunId: null,
      results: targets.map(({ target }) => ({
        contentRef: target.ref,
        error: message,
      })),
    };
  }

  const fixedResults: Array<{
    contentRef: number;
    error?: string;
    settled?: boolean;
  }> = [];
  const fixedTargets = await loadDueFixedTargets(limit);
  const asOf = new Date().toISOString();
  for (const target of fixedTargets) {
    try {
      const settlement = await finalizeIfDue(target, asOf);
      fixedResults.push({
        contentRef: target.ref,
        settled: Boolean(settlement),
      });
    } catch (error) {
      fixedResults.push({
        contentRef: target.ref,
        error: error instanceof Error ? error.message : "Settlement failed",
      });
    }
  }

  let notifications = { failed: 0, sent: 0 };
  try {
    notifications = await retryPendingCompensationNotifications(limit);
  } catch (error) {
    notifications.failed = 1;
    console.error(
      "[contents-engine/content-metrics] Slack retry scan failed",
      error
    );
  }

  const collectionFailures = instagram.results.filter(
    (result) => result.error
  ).length;
  const settlementFailures =
    instagram.results.filter((result) => result.settlementError).length +
    fixedResults.filter((result) => result.error).length;
  return {
    collected: instagram.results.filter((result) => !result.error).length,
    commentCollectionError: instagram.commentCollectionError,
    commentRunId: instagram.commentRunId,
    failed: collectionFailures + settlementFailures + notifications.failed,
    fixedSettlementTargets: fixedTargets.length,
    notificationFailures: notifications.failed,
    notificationsSent: notifications.sent,
    postRunId: instagram.postRunId,
    results: instagram.results,
    settled:
      instagram.results.filter((result) => result.settled).length +
      fixedResults.filter((result) => result.settled).length,
    settlementFailures,
    targets: targets.length,
  };
}
