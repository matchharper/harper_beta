import "server-only";
import type { User } from "@supabase/supabase-js";
import type { OrgLocale } from "@/i18n/org/locale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  fetchOrgTalentDetail,
  type OrgTalentDetailResponse,
} from "@/lib/org/server";
import { getOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";
import { escapeSlackText, getOrgPublicSiteUrl } from "@/lib/org/slackMessages";
import { resolveHarperSlackWorkspaceAccess } from "@/lib/org/slackMemberAccess";
import {
  getHarperSlackGrantedScopes,
  resolveHarperSlackInteractionContext,
  sendHarperWorkspaceSlackMessage,
  slackApi,
} from "@/lib/org/slackHarper";
import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";
import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import type { BackgroundResultPart } from "./agent/backgroundResultParts";
import { companyPresentationFinalFitLabel } from "./companyCriteriaEvaluations";
import {
  buildSlackCandidateEntity,
  buildSlackCandidateResultPosts,
  candidateEntityId,
  SLACK_CANDIDATE_REF_TYPE,
  type SlackCandidateCard,
  type SlackCandidateDocumentLink,
} from "./slackCandidateWorkObject";

const clean = (value: unknown) => String(value ?? "").trim();

function isAcceptedConnectionArtifact(row: {
  status: string;
  close_reason?: string | null;
  presentation?: { deliveryKind?: string } | null;
}) {
  return (
    row.status === "closed" &&
    row.close_reason === "route_replaced" &&
    row.presentation?.deliveryKind === "accepted_connection"
  );
}

export function slackCandidateProfileUrl(row: {
  id: string;
  company_workspace_id: string;
  role_id: string;
  talent_id: string;
}) {
  const params = new URLSearchParams({
    orgId: row.company_workspace_id,
    roleId: row.role_id,
    talentId: row.talent_id,
    recommendationId: `company-intro:${row.id}`,
    detailRoleId: row.role_id,
    detailWorkspaceId: row.company_workspace_id,
    tab: "pipeline",
    view: "pipeline",
    source: "slack",
  });
  return `${getOrgPublicSiteUrl()}/org/role?${params}`;
}

export async function loadSlackCandidateCards(args: {
  candidateIds: string[];
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!args.candidateIds.length) return [];
  const { data, error } = await (
    admin.from("company_intro_candidates" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, talent_id, status, candidate_sent_at, presentation, role:company_roles(name)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .in("id", args.candidateIds);
  if (error) throw error;
  if (!data?.length) return [];
  const talentIds = [
    ...new Set<string>((data ?? []).map((row: any) => row.talent_id)),
  ];
  const { data: experiences, error: experienceError } = await (
    admin.from("talent_experiences" as any) as any
  )
    .select("talent_id, role, company_name, start_date")
    .in("talent_id", talentIds)
    .order("start_date", { ascending: false, nullsFirst: false });
  if (experienceError) throw experienceError;
  const latestByTalent = new Map<
    string,
    { role: string | null; companyName: string | null }
  >();
  for (const experience of experiences ?? []) {
    if (!latestByTalent.has(experience.talent_id))
      latestByTalent.set(experience.talent_id, {
        role: clean(experience.role) || null,
        companyName: clean(experience.company_name) || null,
      });
  }
  const byId = new Map<string, SlackCandidateCard>(
    (data ?? []).map((row: any) => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      return [
        row.id,
        {
          id: row.id,
          name: clean(row.presentation?.name) || "Candidate",
          headline: clean(row.presentation?.headline) || null,
          latestExperience: latestByTalent.get(row.talent_id) ?? null,
          profileUrl: slackCandidateProfileUrl(row),
          roleName: clean(role?.name) || "Role",
          linkedUrls: [
            `${getOrgPublicSiteUrl()}/org/role?${new URLSearchParams({ orgId: row.company_workspace_id, roleId: row.role_id, tab: "pipeline", view: "pipeline", talentId: row.talent_id, detailRoleId: row.role_id, detailWorkspaceId: row.company_workspace_id, source: "slack" })}`,
            `${getOrgPublicSiteUrl()}/org/role?${new URLSearchParams({ detailRoleId: row.role_id, detailWorkspaceId: row.company_workspace_id, orgId: row.company_workspace_id, roleId: row.role_id, source: "company_matching_result", tab: "pipeline", talentId: row.talent_id, view: "pipeline" })}`,
          ],
          status: row.presentation?.deliveryKind === "accepted_connection" ? "pending_connection" : row.status,
          acceptedConnection: row.presentation?.deliveryKind === "accepted_connection",
          candidateSentAt: row.candidate_sent_at,
        },
      ];
    })
  );
  return args.candidateIds.flatMap((id) =>
    byId.has(id) ? [byId.get(id)!] : []
  );
}

export type SlackCandidatePostReceipts = Record<
  string,
  { channelId: string; slackMessageTs: string }
>;
export async function sendSlackCandidateResult(args: {
  text: string;
  blocks?: HarperSlackBlock[];
  parts?: BackgroundResultPart[];
  candidates: SlackCandidateCard[];
  workspaceId: string;
  locale: OrgLocale;
  idempotencyKey: string;
  roleId?: string | null;
  channelId?: string;
  messageMetadata?: OrgAgentMessageMetadata;
  recordConversationMessage?: boolean;
  receipts: SlackCandidatePostReceipts;
  onReceipt: (receipts: SlackCandidatePostReceipts) => Promise<void>;
}) {
  const admin = getSupabaseAdmin();
  let query = (admin.from("company_slack_channels" as any) as any)
    .select("id, slack_channel_id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("is_enabled", true);
  if (args.channelId) query = query.eq("slack_channel_id", args.channelId);
  const { data: channels, error } = await query;
  if (error) throw error;
  let excluded = new Set<string>();
  if (args.roleId) {
    const { data: optOuts, error: optOutError } = await (
      admin.from("company_role_notification_channels" as any) as any
    )
      .select("channel_id")
      .eq("role_id", args.roleId);
    if (optOutError) throw optOutError;
    excluded = new Set((optOuts ?? []).map((row: any) => row.channel_id));
  }
  const destinations = (channels ?? []).filter(
    (channel: any) => !excluded.has(channel.id)
  );
  if (!destinations.length) return false;
  const scopes = args.candidates.length
    ? await getHarperSlackGrantedScopes(args.workspaceId)
    : [];
  const canShowCards = [
    "links:read",
    "links:write",
    "users:read",
    "users:read.email",
  ].every((scope) => scopes.includes(scope));
  for (const channel of destinations) {
    if (args.recordConversationMessage !== false) {
      const { data: previous, error: previousError } = await (
        admin.from("company_messages" as any) as any
      )
        .select("metadata, slack_message_ts")
        .eq("company_workspace_id", args.workspaceId)
        .eq("message_type", "slack")
        .eq("role", "assistant")
        .contains("metadata", {
          slackCandidateDelivery: {
            deliveryKey: args.idempotencyKey,
            channelId: channel.slack_channel_id,
          },
        });
      if (previousError) throw previousError;
      for (const message of previous ?? []) {
        const postKey = message.metadata?.slackCandidateDelivery?.postKey;
        if (typeof postKey !== "string" || !message.slack_message_ts) continue;
        args.receipts[`${postKey}:${channel.slack_channel_id}`] = {
          channelId: channel.slack_channel_id,
          slackMessageTs: message.slack_message_ts,
        };
      }
    }
    const channelReceipts = Object.entries(args.receipts).filter(
      ([, receipt]) => receipt.channelId === channel.slack_channel_id
    );
    // Keep a started delivery's boundaries, including legacy single-message
    // receipts. Explicit parts are separate posts even without Work Object access.
    const useText = channelReceipts.length
      ? channelReceipts.some(
          ([key]) => key === `text:${channel.slack_channel_id}`
        )
      : !args.parts && !canShowCards;
    const posts = useText
      ? [
          {
            key: "text",
            text: args.text,
            candidates: [] as SlackCandidateCard[],
          },
        ]
      : buildSlackCandidateResultPosts(args.text, args.candidates, args.parts);
    for (const post of posts) {
      const key = `${post.key}:${channel.slack_channel_id}`;
      if (args.receipts[key]) {
        await args.onReceipt({ ...args.receipts });
        continue;
      }
      const delivery = {
        deliveryKey: args.idempotencyKey,
        postKey: post.key,
        channelId: channel.slack_channel_id,
      };
      let receipt: { channelId: string; slackMessageTs: string } | null = null;
      const sent = await sendHarperWorkspaceSlackMessage({
        blocks: useText ? args.blocks : undefined,
        channelId: channel.slack_channel_id,
        text: post.text,
        roleId: args.roleId,
        workspaceId: args.workspaceId,
        idempotencyKey: `${args.idempotencyKey}:${post.key}`,
        entityMetadata:
          canShowCards && post.candidates.length
            ? {
                entities: post.candidates.map((candidate) =>
                  buildSlackCandidateEntity({ candidate, locale: args.locale })
                ),
              }
            : undefined,
        messageMetadata: {
          ...args.messageMetadata,
          slackCandidateDelivery: delivery,
        },
        recordConversationMessage: args.recordConversationMessage,
        onPosted: (posted) => {
          receipt = {
            channelId: posted.channelId,
            slackMessageTs: posted.slackMessageTs,
          };
        },
      });
      if (!sent || !receipt)
        throw new Error("Candidate result was not posted to Slack");
      args.receipts[key] = receipt;
      await args.onReceipt({ ...args.receipts });
    }
  }
  return true;
}

export async function resolveSlackCandidate(args: {
  candidateId: string;
  slackTeamId: string;
  channelId?: string | null;
}) {
  if (!candidateEntityId(args.candidateId))
    throw new Error("Invalid candidate identifier");
  const admin = getSupabaseAdmin();
  const { data: row, error } = await (
    admin.from("company_intro_candidates" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, talent_id, status, close_reason, candidate_sent_at, presentation"
    )
    .eq("id", args.candidateId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Candidate not found");
  const context = await resolveHarperSlackInteractionContext({
    slackTeamId: args.slackTeamId,
    channelId: args.channelId,
    workspaceId: row.company_workspace_id,
  });
  if (context.channelId) {
    const { data: optOut, error: optOutError } = await (
      admin.from("company_role_notification_channels" as any) as any
    )
      .select(
        "channel_id, channel:company_slack_channels!inner(slack_channel_id)"
      )
      .eq("role_id", row.role_id)
      .eq("channel.slack_channel_id", context.channelId)
      .limit(1);
    if (optOutError) throw optOutError;
    if (optOut?.length)
      throw new Error("Role is not available in this channel");
  }
  return { context, row };
}

export async function authorizeSlackCandidate(args: {
  candidateId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId?: string | null;
}) {
  const { context, row } = await resolveSlackCandidate(args);
  const access = await resolveHarperSlackWorkspaceAccess({
    token: context.token,
    slackUserId: args.slackUserId,
    workspaceId: context.workspaceId,
  });
  if (!access.allowed) throw new Error("Workspace access required");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(
    access.member.companyUserId
  );
  if (error) throw error;
  if (!data.user) throw new Error("Workspace access required");
  return { context, row, member: access.member, user: data.user as User };
}

export async function readSlackCandidate(
  args: Parameters<typeof authorizeSlackCandidate>[0]
) {
  const authorized = await authorizeSlackCandidate(args);
  const detail = await fetchOrgTalentDetail({
    recommendationId: `company-intro:${args.candidateId}`,
    roleId: authorized.row.role_id,
    talentId: authorized.row.talent_id,
    user: authorized.user,
    workspaceId: authorized.context.workspaceId,
  });
  const acceptedConnection = authorized.row.presentation?.deliveryKind === "accepted_connection";
  if (detail.companyIntro?.id !== args.candidateId && !(acceptedConnection && authorized.row.status === "closed" && authorized.row.close_reason === "route_replaced"))
    throw new Error("Candidate suggestion is no longer active");
  const locale =
    authorized.member.locale ??
    (await getOrgWorkspaceLocale(authorized.context.workspaceId));
  const candidate: SlackCandidateCard = {
    id: args.candidateId,
    name: detail.talent.name || "Candidate",
    headline: detail.talent.headline,
    latestExperience: detail.profile.experiences[0]
      ? {
          role: detail.profile.experiences[0].role,
          companyName: detail.profile.experiences[0].companyName,
        }
      : null,
    roleName: detail.role.name || "Role",
    profileUrl: slackCandidateProfileUrl(authorized.row),
    status: acceptedConnection ? detail.recommendation.stage : detail.companyIntro!.status,
    acceptedConnection,
    candidateSentAt: detail.companyIntro?.candidateSentAt,
  };
  return { ...authorized, detail, locale, candidate };
}

// These limits only shorten the displayed preview; source profile data is intact.
function profilePreview(value: string | null | undefined, limit: number) {
  const characters = Array.from(value?.trim() ?? "");
  const text =
    characters.length > limit
      ? `${characters.slice(0, limit).join("").trimEnd()}…`
      : characters.join("");
  return escapeSlackText(text);
}

function profilePeriod(
  start: string | null,
  end: string | null,
  present?: string
) {
  const period = [
    start?.slice(0, 7),
    end?.slice(0, 7) || (start ? present : null),
  ]
    .filter(Boolean)
    .join(" – ");
  return period ? `_${period}_` : "";
}

function profileDateTimestamp(value: string | null | undefined) {
  const date = value?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === date
    ? timestamp
    : null;
}

function profileExperienceYears(
  experiences: OrgTalentDetailResponse["profile"]["experiences"],
  asOf: Date
) {
  const today = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate()
  );
  const periods: Array<[number, number]> = [];
  for (const experience of experiences) {
    const start = profileDateTimestamp(experience.startDate);
    if (start === null) return null;
    if (start > today) continue;
    const end = experience.endDate
      ? profileDateTimestamp(experience.endDate)
      : today;
    // Missing or invalid dates cannot support a claim about total experience.
    if (end === null || end < start) return null;
    periods.push([start, Math.min(end, today)]);
  }
  if (!periods.length) return null;
  periods.sort((a, b) => a[0] - b[0]);
  let [start, end] = periods[0];
  let duration = 0;
  for (const [nextStart, nextEnd] of periods.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else {
      duration += end - start;
      [start, end] = [nextStart, nextEnd];
    }
  }
  // Sum the union of employment periods, including hidden entries, so neither
  // concurrent jobs nor gaps inflate the total. Show approximate years.
  return (duration + end - start) / (86_400_000 * 365.2425);
}

/** Use only the canonical company-visible projection, including its resume
 * capability. File links recheck access when opened instead of embedding a
 * storage path or a signed download URL in Slack. */
export function slackCandidateDocumentLinks(
  detail: OrgTalentDetailResponse,
  profileUrl: string,
  locale: OrgLocale
): SlackCandidateDocumentLink[] {
  if (!detail.capabilities.viewResume) return [];
  const profile = new URL(profileUrl);
  const workspaceId =
    profile.searchParams.get("detailWorkspaceId") ||
    profile.searchParams.get("orgId");
  const talentId = profile.searchParams.get("talentId");
  const fileLink = (kind: "storage" | "document", documentId?: string) => {
    if (!workspaceId || !talentId) return null;
    const url = new URL("/org/resume", profile.origin);
    url.search = new URLSearchParams({
      kind,
      talentId,
      workspaceId,
      ...(documentId ? { documentId } : {}),
    }).toString();
    return url.href;
  };
  const links: SlackCandidateDocumentLink[] = [];
  const seen = new Set<string>();
  const registered = detail.profile.registeredLinks?.length
    ? detail.profile.registeredLinks
    : (detail.resume?.links ?? []);
  for (const value of registered) {
    try {
      const url = new URL(
        /^[a-z][a-z\d+.-]*:/i.test(value.trim())
          ? value.trim()
          : `https://${value.trim()}`
      );
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        continue;
      seen.add(url.href);
      const host = url.hostname.toLowerCase();
      const resumePath = /(?:resume|cv|\.(?:pdf|docx?)(?:$|\/))/i.test(
        url.pathname
      );
      links.push({
        label:
          host === "linkedin.com" || host.endsWith(".linkedin.com")
            ? "LinkedIn"
            : resumePath
              ? locale === "ko"
                ? "이력서"
                : "Resume"
              : url.hostname.replace(/^www\./, ""),
        url: url.href,
      });
    } catch {
      // Ignore unusable resource addresses, keeping the profile link available.
    }
  }
  if (detail.resume?.hasStorageFile) {
    const url = fileLink("storage");
    if (url) links.push({ label: locale === "ko" ? "이력서" : "Resume", url });
  }
  for (const document of detail.profile.documents) {
    const url = fileLink("document", document.id);
    if (url)
      links.push({
        label: document.fileName || (locale === "ko" ? "문서" : "Document"),
        url,
      });
  }
  return links;
}

/** Explicitly allowlist company-visible fields; never serialize the full detail,
 * contact information or candidate-private matching context. */
export function slackCandidateProfileFields(
  detail: OrgTalentDetailResponse,
  locale: OrgLocale,
  asOf = new Date()
) {
  const ko = locale === "ko";
  const finalFit = detail.companyPresentation?.finalFit;
  // The canonical detail reader supplies experiences newest first.
  const experiences = detail.profile.experiences.slice(0, 6);
  const remaining = detail.profile.experiences.length - experiences.length;
  const years = profileExperienceYears(detail.profile.experiences, asOf);
  const total =
    years === null
      ? ko
        ? "총 경력 기간 미확인"
        : "total duration unavailable"
      : ko
        ? `총 ${years.toFixed(1)}년`
        : `total ${years.toFixed(1)} years`;
  const entries = [
    {
      key: "location",
      label: ko ? "위치" : "Location",
      value: detail.profile.location ?? "",
    },
    {
      key: "introduction",
      label: "TL;DR",
      value: escapeSlackText((detail.companyPresentation?.tldr ?? detail.companyIntro?.tldr ?? detail.companyIntro?.introduction ?? "").trim()),
      markdown: true,
      long: true,
    },
    {
      key: "reason",
      label: "Harper Note",
      value: escapeSlackText(detail.companyPresentation?.harperNote ?? detail.companyIntro?.harperNote ?? ""),
      markdown: true,
      long: true,
    },
    { key: "final_fit", label: ko ? "역할 적합도" : "Role fit", value: finalFit ? companyPresentationFinalFitLabel(finalFit, locale) : "" },
    ...(detail.companyPresentation?.criteriaEvaluations ?? []).map((item, index) => ({
      key: `criterion_${index}`, label: item.name,
      value: escapeSlackText(`${companyPresentationFinalFitLabel(item.fitness === "bad" ? "unfit" : item.fitness, locale)} · ${item.content}`), markdown: true, long: true,
    })),
    ...experiences.map((item, index) => ({
      key: `experience_${index}`,
      label: `${ko ? "경력" : "Experience"}${index ? ` ${index + 1}` : ""}`,
      // A single Markdown field keeps the company, role and dates together.
      // Slack does not support an icon on a Markdown field.
      value: [
        item.companyName ? escapeSlackText(item.companyName) : "",
        item.role ? `**${escapeSlackText(item.role)}**` : "",
        profilePeriod(item.startDate, item.endDate, ko ? "현재" : "Present"),
      ]
        .filter(Boolean)
        .join("\n"),
      markdown: true,
      long: true,
    })),
    ...(remaining
      ? [
          {
            key: "experience_more",
            label: ko ? "더 보기" : "More",
            value: ko
              ? `외 ${remaining}개 경력, ${total}`
              : `${remaining} more ${remaining === 1 ? "experience" : "experiences"}, ${total}`,
            markdown: true,
          },
        ]
      : []),
    {
      key: "education",
      label: ko ? "학력" : "Education",
      value: detail.profile.educations
        .map((item) => {
          const title = [item.school, item.degree, item.field]
            .filter(Boolean)
            .join(" · ");
          return [
            title ? `**${escapeSlackText(title)}**` : "",
            profilePeriod(item.startDate, item.endDate),
            profilePreview(item.description, 360),
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n"),
      markdown: true,
      long: true,
    },
    {
      key: "extras",
      label: ko ? "기타" : "Other experience",
      value: detail.profile.extras
        .map((item) =>
          [
            item.title ? `**${escapeSlackText(item.title)}**` : "",
            profilePreview(item.description, 360),
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n"),
      markdown: true,
      long: true,
    },
  ];
  return entries.filter((entry) => entry.value);
}

export async function presentSlackCandidate(args: {
  candidateId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId?: string | null;
  triggerId: string;
}) {
  const resolved = await resolveSlackCandidate(args);
  try {
    if (
      ["passed", "closed", "connected"].includes(resolved.row.status) &&
      !isAcceptedConnectionArtifact(resolved.row)
    ) {
      const actor = await authorizeSlackCandidate(args);
      const locale =
        actor.member.locale ??
        (await getOrgWorkspaceLocale(actor.context.workspaceId));
      await slackApi(actor.context.token, "entity.presentDetails", {
        trigger_id: args.triggerId,
        metadata: JSON.stringify(
          buildSlackCandidateEntity({
            candidate: {
              id: args.candidateId,
              name: locale === "ko" ? "후보자 제안" : "Candidate suggestion",
              profileUrl: slackCandidateProfileUrl(actor.row),
              roleName: "",
              status: actor.row.status,
            },
            locale,
            canDecide: false,
            surface: "details",
          })
        ),
      });
      return;
    }
    const read = await readSlackCandidate(args);
    await slackApi(read.context.token, "entity.presentDetails", {
      trigger_id: args.triggerId,
      metadata: JSON.stringify(
        buildSlackCandidateEntity({
          candidate: read.candidate,
          locale: read.locale,
          surface: "details",
          canDecide: read.member.canManageCandidates,
          canRequestIntro: read.detail.capabilities.requestIntro,
          canPass: read.detail.capabilities.pass,
          documents: slackCandidateDocumentLinks(
            read.detail,
            read.candidate.profileUrl,
            read.locale
          ),
          details: slackCandidateProfileFields(read.detail, read.locale),
        })
      ),
    });
  } catch (error) {
    // No profile or snapshot is returned when current membership/privacy fails.
    await slackApi(resolved.context.token, "entity.presentDetails", {
      trigger_id: args.triggerId,
      error: JSON.stringify({ status: "restricted" }),
    });
    console.warn("[harper-slack/candidate:details]", {
      candidateId: args.candidateId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function refreshSlackCandidateUnfurls(
  envelope: Record<string, any>
) {
  const event = envelope.event;
  if (!event?.channel || !event.message_ts || !event.user || !envelope.team_id)
    return;
  const context = await resolveHarperSlackInteractionContext({
    channelId: event.channel,
    slackTeamId: envelope.team_id,
  });
  const entities: Record<string, unknown>[] = [];
  for (const link of event.links ?? []) {
    const candidateId = candidateIdFromSlackEntity({ entity_url: link.url });
    if (!candidateId) continue;
    try {
      const resolved = await resolveSlackCandidate({
        candidateId,
        slackTeamId: envelope.team_id,
        channelId: event.channel,
      });
      if (
        ["passed", "closed", "connected"].includes(resolved.row.status) &&
        !isAcceptedConnectionArtifact(resolved.row)
      ) {
        const actor = await authorizeSlackCandidate({
          candidateId,
          slackTeamId: envelope.team_id,
          slackUserId: event.user,
          channelId: event.channel,
        });
        const locale =
          actor.member.locale ??
          (await getOrgWorkspaceLocale(actor.context.workspaceId));
        entities.push({
          ...buildSlackCandidateEntity({
            candidate: {
              id: candidateId,
              name: locale === "ko" ? "후보자 제안" : "Candidate suggestion",
              roleName: "",
              profileUrl: slackCandidateProfileUrl(actor.row),
              status: actor.row.status,
            },
            locale,
            canDecide: false,
          }),
          app_unfurl_url: link.url,
        });
        continue;
      }
      const read = await readSlackCandidate({
        candidateId,
        slackTeamId: envelope.team_id,
        slackUserId: event.user,
        channelId: event.channel,
      });
      entities.push({
        ...buildSlackCandidateEntity({
          candidate: read.candidate,
          locale: read.locale,
          canDecide: read.member.canManageCandidates,
          canRequestIntro: read.detail.capabilities.requestIntro,
          canPass: read.detail.capabilities.pass,
        }),
        app_unfurl_url: link.url,
      });
    } catch (error) {
      console.warn("[harper-slack/candidate:unfurl]", {
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (entities.length)
    await slackApi(context.token, "chat.unfurl", {
      channel: event.channel,
      ts: event.message_ts,
      unfurls: JSON.stringify({}),
      metadata: JSON.stringify({ entities }),
    });
}

export function candidateIdFromSlackEntity(event: Record<string, any>) {
  if (event.external_ref?.type === SLACK_CANDIDATE_REF_TYPE)
    return candidateEntityId(event.external_ref.id);
  try {
    const url = new URL(clean(event.entity_url || event.link?.url));
    if (
      url.origin !== new URL(getOrgPublicSiteUrl()).origin ||
      url.pathname !== "/org/role"
    )
      return null;
    const value = url.searchParams.get("recommendationId") ?? "";
    return value.startsWith("company-intro:")
      ? candidateEntityId(value.slice("company-intro:".length))
      : null;
  } catch {
    return null;
  }
}
