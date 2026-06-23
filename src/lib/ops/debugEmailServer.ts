import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type TalentSummary = {
  email: string | null;
  headline: string | null;
  name: string | null;
  profilePicture: string | null;
  userId: string;
};

type RecommendationSummary = {
  internalRoleCount: number;
  recommendationCount: number;
  roleLabels: string[];
};

type UntypedAdminClient = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type InternalDebugEmailItem = OpsDebugEmailItem & {
  dedupeKey: string;
};

export type OpsDebugEmailScope = "all" | "internal_opportunity";
export type OpsDebugEmailDirection = "all" | "inbound" | "outbound";

export type OpsDebugEmailItem = {
  bodyPreview: string | null;
  bodyText: string | null;
  createdAt: string;
  createdBy: string | null;
  direction: "inbound" | "outbound";
  discoveryRunId: string | null;
  fromEmail: string | null;
  id: string;
  internalRoleCount: number;
  isInternalOpportunityProposal: boolean;
  mailType: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  recommendationCount: number;
  roleLabels: string[];
  source: "career_email_messages" | "talent_opportunity_delivery";
  status: string;
  subject: string | null;
  talent: TalentSummary;
  toEmail: string | null;
};

export type OpsDebugEmailStats = {
  failedCount: number;
  inboundCount: number;
  internalOpportunityCount: number;
  outboundCount: number;
  sourceLimitReached: boolean;
  totalCount: number;
};

export type OpsDebugEmailsResponse = {
  emails: OpsDebugEmailItem[];
  filters: {
    direction: OpsDebugEmailDirection;
    mailType: string;
    occurredFrom: string | null;
    occurredTo: string | null;
    query: string;
    scope: OpsDebugEmailScope;
    status: string;
  };
  hasMore: boolean;
  limit: number;
  nextOffset: number | null;
  offset: number;
  stats: OpsDebugEmailStats;
};

const DEFAULT_DEBUG_EMAIL_LIMIT = 40;
const MAX_DEBUG_EMAIL_LIMIT = 80;
const MAX_DEBUG_EMAIL_SOURCE_LIMIT = 1500;
const INTERNAL_OPPORTUNITY_TYPES = new Set([
  "internal_recommendation",
  "intro_request",
]);

function toUntypedAdmin(
  admin: ReturnType<typeof getTalentSupabaseAdmin>
): UntypedAdminClient {
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirstRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getJsonString(value: unknown, key: string) {
  return getString(asRecord(value)[key]);
}

function normalizeSearchQuery(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeMailType(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function parseDateOnly(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

function toKstDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function toKstNextDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)
  ).toISOString();
}

function normalizeDateRange(args: {
  occurredFrom?: string | null;
  occurredTo?: string | null;
}) {
  let from = parseDateOnly(args.occurredFrom);
  let to = parseDateOnly(args.occurredTo);
  if (!from && to) from = to;
  if (from && !to) to = from;
  if (from && to && to < from) {
    const nextFrom = to;
    to = from;
    from = nextFrom;
  }

  return {
    from,
    startIso: from ? toKstDayStartIso(from) : null,
    to,
    endExclusiveIso: to ? toKstNextDayStartIso(to) : null,
  };
}

export function parseOpsDebugEmailLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_DEBUG_EMAIL_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_DEBUG_EMAIL_LIMIT;
  return Math.max(1, Math.min(MAX_DEBUG_EMAIL_LIMIT, Math.floor(n)));
}

export function parseOpsDebugEmailOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseOpsDebugEmailScope(
  value: string | null
): OpsDebugEmailScope {
  return value === "internal_opportunity" ? "internal_opportunity" : "all";
}

export function parseOpsDebugEmailDirection(
  value: string | null
): OpsDebugEmailDirection {
  if (value === "inbound" || value === "outbound") return value;
  return "all";
}

function getOccurredAt(row: {
  createdAt?: string | null;
  occurredAt?: string | null;
  sentAt?: string | null;
}) {
  return (
    row.occurredAt ||
    row.sentAt ||
    row.createdAt ||
    new Date(0).toISOString()
  );
}

function buildBodyPreview(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 220) : null;
}

function parseTalent(value: unknown, fallbackUserId: string): TalentSummary {
  const row = getFirstRecord(value);
  const userId = getString(row.user_id) ?? fallbackUserId;
  return {
    email: getString(row.email),
    headline: getString(row.headline),
    name: getString(row.name),
    profilePicture: getString(row.profile_picture),
    userId,
  };
}

function getDiscoveryRunIdFromMetadata(metadata: unknown) {
  return (
    getJsonString(metadata, "discoveryRunId") ??
    getJsonString(metadata, "discovery_run_id")
  );
}

function getDeliveryBody(payload: unknown) {
  return (
    getJsonString(payload, "textBody") ??
    getJsonString(payload, "emailBody") ??
    getJsonString(payload, "message")
  );
}

function getDeliverySubject(payload: unknown) {
  return (
    getJsonString(payload, "subject") ??
    getJsonString(payload, "emailSubject")
  );
}

function canonicalEmailFromRow(row: any): InternalDebugEmailItem {
  const metadata = asRecord(row.metadata);
  const talentId = getString(row.talent_id) ?? "";
  const mailType = getString(row.mail_type) ?? "other";
  const createdAt = getString(row.created_at) ?? new Date(0).toISOString();
  const occurredAt = getOccurredAt({
    createdAt,
    occurredAt: getString(row.occurred_at),
  });
  const discoveryRunId = getDiscoveryRunIdFromMetadata(metadata);
  const direction = row.direction === "inbound" ? "inbound" : "outbound";
  const bodyText = getString(row.body_text);

  return {
    bodyPreview: buildBodyPreview(bodyText),
    bodyText,
    createdAt,
    createdBy: getString(row.created_by),
    dedupeKey:
      discoveryRunId && mailType === "opportunity_recommendation"
        ? `opportunity:${talentId}:${discoveryRunId}`
        : `career-email-message:${getString(row.id) ?? ""}`,
    direction,
    discoveryRunId,
    fromEmail: getString(row.from_email),
    id: `career-email-message:${getString(row.id) ?? ""}`,
    internalRoleCount: 0,
    isInternalOpportunityProposal: false,
    mailType,
    metadata,
    occurredAt,
    recommendationCount: 0,
    roleLabels: [],
    source: "career_email_messages",
    status: getString(row.status) ?? "sent",
    subject: getString(row.subject),
    talent: parseTalent(row.talent, talentId),
    toEmail: getString(row.to_email),
  };
}

function deliveryEmailFromRow(row: any): InternalDebugEmailItem {
  const payload = asRecord(row.payload);
  const talentId = getString(row.talent_id) ?? "";
  const createdAt = getString(row.created_at) ?? new Date(0).toISOString();
  const sentAt = getString(row.sent_at);
  const bodyText = getDeliveryBody(payload);
  const discoveryRunId = getString(row.discovery_run_id);

  return {
    bodyPreview: buildBodyPreview(bodyText),
    bodyText,
    createdAt,
    createdBy: null,
    dedupeKey: discoveryRunId
      ? `opportunity:${talentId}:${discoveryRunId}`
      : `talent-opportunity-delivery:${getString(row.id) ?? ""}`,
    direction: "outbound",
    discoveryRunId,
    fromEmail: null,
    id: `talent-opportunity-delivery:${getString(row.id) ?? ""}`,
    internalRoleCount: 0,
    isInternalOpportunityProposal: false,
    mailType: "opportunity_recommendation",
    metadata: payload,
    occurredAt: getOccurredAt({ createdAt, sentAt }),
    recommendationCount: 0,
    roleLabels: [],
    source: "talent_opportunity_delivery",
    status: getString(row.status) ?? "sent",
    subject: getDeliverySubject(payload),
    talent: parseTalent(row.talent, talentId),
    toEmail: getJsonString(payload, "toEmail"),
  };
}

function compareEmails(a: OpsDebugEmailItem, b: OpsDebugEmailItem) {
  const aTime = Date.parse(a.occurredAt);
  const bTime = Date.parse(b.occurredAt);
  const safeATime = Number.isFinite(aTime) ? aTime : 0;
  const safeBTime = Number.isFinite(bTime) ? bTime : 0;
  if (safeATime !== safeBTime) return safeBTime - safeATime;
  return b.id.localeCompare(a.id);
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function fetchCompanyRoleMap(args: {
  admin: UntypedAdminClient;
  roleIds: string[];
}) {
  const roleMap = new Map<
    string,
    { companyName: string | null; name: string | null; sourceType: string | null }
  >();
  const roleIds = Array.from(new Set(args.roleIds.filter(Boolean)));
  if (roleIds.length === 0) return roleMap;

  for (const page of chunk(roleIds, 200)) {
    const { data, error } = await args.admin
      .from("company_roles")
      .select(
        `
          role_id,
          name,
          source_type,
          company_workspace:company_workspace (
            company_name
          )
        `
      )
      .in("role_id", page);

    if (error) {
      throw new Error(error.message ?? "Failed to load company roles");
    }

    for (const row of data ?? []) {
      const roleId = getString(row.role_id);
      if (!roleId) continue;
      const company = getFirstRecord(row.company_workspace);
      roleMap.set(roleId, {
        companyName: getString(company.company_name),
        name: getString(row.name),
        sourceType: getString(row.source_type),
      });
    }
  }

  return roleMap;
}

async function fetchRecommendationSummaries(args: {
  admin: UntypedAdminClient;
  discoveryRunIds: string[];
}) {
  const summaryByRunId = new Map<string, RecommendationSummary>();
  const discoveryRunIds = Array.from(
    new Set(args.discoveryRunIds.filter(Boolean))
  );
  if (discoveryRunIds.length === 0) return summaryByRunId;

  const recommendationRows: any[] = [];
  for (const page of chunk(discoveryRunIds, 200)) {
    const { data, error } = await args.admin
      .from("talent_opportunity_recommendation")
      .select("id, discovery_run_id, opportunity_type, rank, role_id")
      .in("discovery_run_id", page)
      .order("rank", { ascending: true });

    if (error) {
      throw new Error(error.message ?? "Failed to load recommendations");
    }
    recommendationRows.push(...(data ?? []));
  }

  const roleMap = await fetchCompanyRoleMap({
    admin: args.admin,
    roleIds: recommendationRows
      .map((row) => getString(row.role_id))
      .filter(Boolean) as string[],
  });

  for (const row of recommendationRows) {
    const discoveryRunId = getString(row.discovery_run_id);
    const roleId = getString(row.role_id);
    if (!discoveryRunId || !roleId) continue;

    const current =
      summaryByRunId.get(discoveryRunId) ??
      ({
        internalRoleCount: 0,
        recommendationCount: 0,
        roleLabels: [],
      } satisfies RecommendationSummary);
    const role = roleMap.get(roleId);
    const isInternal =
      role?.sourceType === "internal" ||
      INTERNAL_OPPORTUNITY_TYPES.has(getString(row.opportunity_type) ?? "");
    const roleLabel = [role?.name, role?.companyName]
      .filter(Boolean)
      .join(" @ ");

    current.recommendationCount += 1;
    if (isInternal) current.internalRoleCount += 1;
    if (roleLabel && current.roleLabels.length < 6) {
      current.roleLabels.push(roleLabel);
    }
    summaryByRunId.set(discoveryRunId, current);
  }

  return summaryByRunId;
}

function applyRecommendationSummary(
  item: InternalDebugEmailItem,
  summaryByRunId: Map<string, RecommendationSummary>
): InternalDebugEmailItem {
  const summary = item.discoveryRunId
    ? summaryByRunId.get(item.discoveryRunId)
    : null;
  const internalRoleCount = summary?.internalRoleCount ?? 0;
  const recommendationCount = summary?.recommendationCount ?? 0;

  return {
    ...item,
    internalRoleCount,
    isInternalOpportunityProposal:
      item.direction === "outbound" &&
      item.mailType === "opportunity_recommendation" &&
      internalRoleCount > 0,
    recommendationCount,
    roleLabels: summary?.roleLabels ?? [],
  };
}

function includesSearchQuery(item: OpsDebugEmailItem, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    item.bodyText,
    item.createdBy,
    item.discoveryRunId,
    item.fromEmail,
    item.mailType,
    item.status,
    item.subject,
    item.talent.email,
    item.talent.headline,
    item.talent.name,
    item.toEmail,
    ...item.roleLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function isWithinDateRange(
  item: OpsDebugEmailItem,
  dateRange: ReturnType<typeof normalizeDateRange>
) {
  const timestamp = Date.parse(item.occurredAt);
  if (!Number.isFinite(timestamp)) return false;
  if (dateRange.startIso && timestamp < Date.parse(dateRange.startIso)) {
    return false;
  }
  if (
    dateRange.endExclusiveIso &&
    timestamp >= Date.parse(dateRange.endExclusiveIso)
  ) {
    return false;
  }
  return true;
}

async function fetchCanonicalEmailCandidates(args: {
  admin: UntypedAdminClient;
  dateRange: ReturnType<typeof normalizeDateRange>;
  direction: OpsDebugEmailDirection;
  limit: number;
  mailType: string;
  scope: OpsDebugEmailScope;
  status: string;
}) {
  let query = args.admin
    .from("career_email_messages")
    .select(
      `
        id,
        talent_id,
        talent_message_id,
        inbound_event_id,
        reply_job_id,
        direction,
        mail_type,
        status,
        subject,
        from_email,
        to_email,
        body_text,
        created_by,
        occurred_at,
        created_at,
        metadata,
        talent:talent_users!career_email_messages_talent_id_fkey (
          user_id,
          name,
          email,
          headline,
          profile_picture
        )
      `
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, args.limit - 1);

  if (args.dateRange.startIso) {
    query = query.gte("occurred_at", args.dateRange.startIso);
  }
  if (args.dateRange.endExclusiveIso) {
    query = query.lt("occurred_at", args.dateRange.endExclusiveIso);
  }
  if (args.direction !== "all") {
    query = query.eq("direction", args.direction);
  }
  if (args.scope === "internal_opportunity") {
    query = query.eq("mail_type", "opportunity_recommendation");
  } else if (args.mailType) {
    query = query.eq("mail_type", args.mailType);
  }
  if (args.status) {
    query = query.eq("status", args.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load career email messages");
  }

  return (data ?? []).map(canonicalEmailFromRow);
}

async function fetchDeliveryEmailCandidates(args: {
  admin: UntypedAdminClient;
  dateRange: ReturnType<typeof normalizeDateRange>;
  direction: OpsDebugEmailDirection;
  include: boolean;
  limit: number;
  status: string;
}) {
  if (!args.include || args.direction === "inbound") return [];

  let query = args.admin
    .from("talent_opportunity_delivery")
    .select(
      `
        id,
        discovery_run_id,
        talent_id,
        status,
        payload,
        sent_at,
        created_at,
        talent:talent_users!talent_opportunity_delivery_talent_id_fkey (
          user_id,
          name,
          email,
          headline,
          profile_picture
        )
      `
    )
    .eq("channel", "email")
    .in("status", args.status ? [args.status] : ["sent", "failed"])
    .order("created_at", { ascending: false })
    .range(0, args.limit - 1);

  if (args.dateRange.startIso) {
    query = query.gte("created_at", args.dateRange.startIso);
  }
  if (args.dateRange.endExclusiveIso) {
    query = query.lt("created_at", args.dateRange.endExclusiveIso);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load opportunity delivery emails");
  }

  return (data ?? []).map(deliveryEmailFromRow);
}

function buildStats(args: {
  emails: OpsDebugEmailItem[];
  sourceLimitReached: boolean;
}): OpsDebugEmailStats {
  return {
    failedCount: args.emails.filter((item) => item.status === "failed").length,
    inboundCount: args.emails.filter((item) => item.direction === "inbound")
      .length,
    internalOpportunityCount: args.emails.filter(
      (item) => item.isInternalOpportunityProposal
    ).length,
    outboundCount: args.emails.filter((item) => item.direction === "outbound")
      .length,
    sourceLimitReached: args.sourceLimitReached,
    totalCount: args.emails.length,
  };
}

export async function fetchOpsDebugEmails(args: {
  direction?: OpsDebugEmailDirection;
  limit?: number;
  mailType?: string | null;
  occurredFrom?: string | null;
  occurredTo?: string | null;
  offset?: number;
  query?: string | null;
  scope?: OpsDebugEmailScope;
  status?: string | null;
}): Promise<OpsDebugEmailsResponse> {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const direction = args.direction ?? "all";
  const limit = Math.max(
    1,
    Math.min(MAX_DEBUG_EMAIL_LIMIT, args.limit ?? DEFAULT_DEBUG_EMAIL_LIMIT)
  );
  const mailType = normalizeMailType(args.mailType);
  const offset = Math.max(0, args.offset ?? 0);
  const query = normalizeSearchQuery(args.query);
  const scope = args.scope ?? "all";
  const status = normalizeStatus(args.status);
  const dateRange = normalizeDateRange({
    occurredFrom: args.occurredFrom,
    occurredTo: args.occurredTo,
  });
  const sourceLimit =
    scope === "internal_opportunity" || query
      ? MAX_DEBUG_EMAIL_SOURCE_LIMIT
      : Math.min(MAX_DEBUG_EMAIL_SOURCE_LIMIT, Math.max(offset + limit + 1, 300));

  const includeDelivery =
    (!mailType || mailType === "opportunity_recommendation") &&
    (scope === "internal_opportunity" || scope === "all");

  const [canonical, delivery] = await Promise.all([
    fetchCanonicalEmailCandidates({
      admin,
      dateRange,
      direction,
      limit: sourceLimit,
      mailType: mailType ?? "",
      scope,
      status: status ?? "",
    }),
    fetchDeliveryEmailCandidates({
      admin,
      dateRange,
      direction,
      include: includeDelivery,
      limit: sourceLimit,
      status: status ?? "",
    }),
  ]);

  const summaryByRunId = await fetchRecommendationSummaries({
    admin,
    discoveryRunIds: [...canonical, ...delivery]
      .map((item) => item.discoveryRunId)
      .filter(Boolean) as string[],
  });

  const deduped = new Map<string, InternalDebugEmailItem>();
  for (const item of canonical.map((email) =>
    applyRecommendationSummary(email, summaryByRunId)
  )) {
    deduped.set(item.dedupeKey, item);
  }
  for (const item of delivery.map((email) =>
    applyRecommendationSummary(email, summaryByRunId)
  )) {
    if (!deduped.has(item.dedupeKey)) {
      deduped.set(item.dedupeKey, item);
    }
  }

  const allEmails = Array.from(deduped.values())
    .filter((item) =>
      scope === "internal_opportunity"
        ? item.isInternalOpportunityProposal
        : true
    )
    .filter((item) => includesSearchQuery(item, query))
    .filter((item) => isWithinDateRange(item, dateRange))
    .sort(compareEmails);

  const page = allEmails.slice(offset, offset + limit);
  const nextOffset =
    offset + page.length < allEmails.length ? offset + page.length : null;
  const sourceLimitReached =
    canonical.length >= sourceLimit || delivery.length >= sourceLimit;

  return {
    emails: page.map(({ dedupeKey: _dedupeKey, ...item }) => item),
    filters: {
      direction,
      mailType: mailType ?? "",
      occurredFrom: dateRange.from,
      occurredTo: dateRange.to,
      query,
      scope,
      status: status ?? "",
    },
    hasMore: nextOffset !== null,
    limit,
    nextOffset,
    offset,
    stats: buildStats({ emails: allEmails, sourceLimitReached }),
  };
}
