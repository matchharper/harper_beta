import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  buildCompanyEventContent,
  type CompanyEventChange,
  getCompanyEventActorLabel,
} from "@/lib/org/companyEvents";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export const WEBSITE_COMPANY_DATA_KEYS = [
  "company_name",
  "company_description",
  "pitch",
  "workspace_request",
  "logo_url",
  "homepage_url",
  "career_url",
  "linkedin_url",
  "short_description",
  "funding_url",
  "location",
  "founded_year",
  "employee_count_start",
  "employee_count_end",
  "specialities",
  "investors",
  "related_links",
  "total_funding_raised",
  "main_investors",
  "last_funding_stage",
  "last_funding_round_description",
  "workspace_published_name",
  "role_name",
  "role_description",
  "role_description_summary",
  "role_external_jd_url",
  "role_location",
  "role_status",
  "role_work_mode",
  "role_employment_types",
  "role_request",
  "role_is_expired",
  "role_source_type",
  "role_source_provider",
  "role_source_job_id",
  "role_posted_at",
  "role_expires_at",
] as const;

export type WebsiteCompanyDataKey = (typeof WEBSITE_COMPANY_DATA_KEYS)[number];

export type WebsiteCompanyDataChange = {
  expected?: unknown;
  key: WebsiteCompanyDataKey;
  roleId?: string | null;
  value: unknown;
};

type WebsiteCompanyDataSnapshot = {
  expected?: unknown;
  expectedPhysical?: Record<string, unknown>;
  label?: string;
  requiresPhysicalMirror?: boolean;
  value: unknown;
};

type WebsiteCompanyDataRpcChange = {
  expected?: unknown;
  expected_physical?: Record<string, unknown>;
  key: WebsiteCompanyDataKey;
  role_id: string | null;
  value: unknown;
};

type WebsiteCompanyDataRpcResult = {
  changed_count?: number;
  company_db_id?: number | null;
  key?: string;
  role_id?: string | null;
  status?: string;
};

type WebsiteCompanyDataSnapshotResult = {
  companyDbId: number | null;
  snapshots: Map<string, WebsiteCompanyDataSnapshot>;
};

export class WebsiteCompanyDataConflictError extends Error {
  key: string | null;
  roleId: string | null;

  constructor(key?: string, roleId?: string | null) {
    super("Company data changed while the website update was being saved");
    this.name = "WebsiteCompanyDataConflictError";
    this.key = key ?? null;
    this.roleId = roleId ?? null;
  }
}

function singleLine(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function utcMillisOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Stored role timestamp is invalid");
  }
  return parsed.toISOString();
}

export function normalizeWebsiteCompanyDataStringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/g)
      : [];
  return values.map(singleLine).filter(Boolean);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, comparable(nested)])
    );
  }
  return value === undefined ? null : value;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function targetKey(key: WebsiteCompanyDataKey, roleId?: string | null) {
  return `${key}:${roleId || "workspace"}`;
}

function isRoleKey(key: WebsiteCompanyDataKey) {
  return key.startsWith("role_");
}

export function resolveWebsiteCompanyDataRpcChanges(args: {
  actorLabel: string;
  changes: WebsiteCompanyDataChange[];
  snapshots: Map<string, WebsiteCompanyDataSnapshot>;
}) {
  const seen = new Set<string>();
  const rpcChanges: WebsiteCompanyDataRpcChange[] = [];
  const eventChanges: CompanyEventChange[] = [];

  for (const change of args.changes) {
    const roleId = singleLine(change.roleId) || null;
    if (isRoleKey(change.key) !== Boolean(roleId)) {
      throw new Error(`${change.key} has an invalid website update scope`);
    }
    const target = targetKey(change.key, roleId);
    if (seen.has(target)) {
      throw new Error(`Duplicate website update target: ${target}`);
    }
    seen.add(target);
    const snapshot = args.snapshots.get(target);
    if (!snapshot)
      throw new Error(`Missing website update snapshot: ${target}`);
    const hasExplicitExpected = Object.prototype.hasOwnProperty.call(
      change,
      "expected"
    );
    const checkedPhysicalValues = snapshot.expectedPhysical
      ? snapshot.requiresPhysicalMirror === false
        ? [snapshot.expectedPhysical.workspace]
        : Object.values(snapshot.expectedPhysical)
      : [];
    const physicalAlreadyReflected = snapshot.expectedPhysical
      ? checkedPhysicalValues.every((value) => valuesEqual(value, change.value))
      : true;
    if (
      valuesEqual(snapshot.value, change.value) &&
      physicalAlreadyReflected &&
      (!hasExplicitExpected || valuesEqual(change.expected, snapshot.value))
    ) {
      continue;
    }

    rpcChanges.push({
      ...(snapshot.expectedPhysical
        ? { expected_physical: snapshot.expectedPhysical }
        : {
            expected: hasExplicitExpected
              ? (change.expected ?? null)
              : (snapshot.expected ?? snapshot.value ?? null),
          }),
      key: change.key,
      role_id: roleId,
      value: change.value,
    });
    const physicalBefore = snapshot.expectedPhysical
      ? checkedPhysicalValues.find((value) => !valuesEqual(value, change.value))
      : undefined;
    eventChanges.push({
      after: change.value,
      // A mirrored field can need a real company_db repair even when the
      // canonical workspace value is already correct. Record that physical
      // repair instead of filtering it out as a logical no-op.
      before:
        valuesEqual(snapshot.value, change.value) &&
        physicalBefore !== undefined
          ? physicalBefore
          : snapshot.value,
      key: snapshot.label
        ? `${snapshot.label}.${change.key.replace(/^role_/, "")}`
        : change.key,
    });
  }

  return {
    eventContent: buildCompanyEventContent({
      actorLabel: args.actorLabel,
      changes: eventChanges,
    }),
    rpcChanges,
  };
}

async function fetchWebsiteCompanyDataSnapshots(args: {
  admin: AdminClient;
  changes: WebsiteCompanyDataChange[];
  targetCompanyDbId?: number | null;
  workspaceId: string;
}): Promise<WebsiteCompanyDataSnapshotResult> {
  const roleIds = Array.from(
    new Set(
      args.changes.map((change) => singleLine(change.roleId)).filter(Boolean)
    )
  ).sort();
  const { data: workspaceData, error: workspaceError } = await (
    args.admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_db_id, company_name, published_name, company_description, pitch, request, logo_url, homepage_url, career_url, linkedin_url"
    )
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspaceData) throw new Error("Workspace not found");
  const workspace = workspaceData as Record<string, unknown>;

  const [companyDataResult, rolesResult] = await Promise.all([
    (args.admin.from("company_data" as any) as any)
      .select(
        "total_funding_raised, main_investors, last_funding_stage, last_funding_round_description"
      )
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle(),
    roleIds.length
      ? (args.admin.from("company_roles" as any) as any)
          .select(
            "role_id, company_workspace_id, name, description, description_summary, external_jd_url, location_text, status, work_mode, type, source_type, source_provider, source_job_id, posted_at, expires_at, is_expired"
          )
          .eq("company_workspace_id", args.workspaceId)
          .in("role_id", roleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (companyDataResult.error) throw companyDataResult.error;
  if (rolesResult.error) throw rolesResult.error;
  const roles = (rolesResult.data ?? []) as Record<string, unknown>[];
  if (roles.length !== roleIds.length) throw new Error("Role not found");

  const companyDbId = numberOrNull(workspace.company_db_id);
  const hasTargetCompanyDbId = args.targetCompanyDbId !== undefined;
  const snapshotCompanyDbId = hasTargetCompanyDbId
    ? numberOrNull(args.targetCompanyDbId)
    : companyDbId;
  const companyDbResult = snapshotCompanyDbId
    ? await (args.admin.from("company_db" as any) as any)
        .select(
          "name, description, logo, website_url, linkedin_url, short_description, funding_url, location, founded_year, employee_count_range, specialities, investors, related_links"
        )
        .eq("id", snapshotCompanyDbId)
        .maybeSingle()
    : { data: null, error: null };
  if (companyDbResult.error) throw companyDbResult.error;

  const needsInternalRequests = args.changes.some(
    (change) => change.key === "role_request"
  );
  const internalResult = needsInternalRequests
    ? await (args.admin.from("company_internal_roles" as any) as any)
        .select("role_id, request")
        .in("role_id", roleIds)
    : { data: [], error: null };
  if (internalResult.error) throw internalResult.error;

  const companyDb =
    (companyDbResult.data as Record<string, unknown> | null) ?? {};
  const companyData =
    (companyDataResult.data as Record<string, unknown> | null) ?? {};
  const roleById = new Map(
    roles.map((role) => [singleLine(role.role_id), role])
  );
  const internalByRoleId = new Map(
    ((internalResult.data ?? []) as Record<string, unknown>[]).map((row) => [
      singleLine(row.role_id),
      row,
    ])
  );
  const range = record(companyDb.employee_count_range);
  const workspaceValues: Record<string, unknown> = {
    career_url: workspace.career_url ?? null,
    company_description: workspace.company_description ?? null,
    company_name: workspace.company_name ?? null,
    employee_count_end: numberOrNull(range.end),
    employee_count_start: numberOrNull(range.start),
    founded_year: numberOrNull(companyDb.founded_year),
    funding_url: companyDb.funding_url ?? null,
    homepage_url: workspace.homepage_url ?? null,
    investors: normalizeWebsiteCompanyDataStringList(companyDb.investors),
    last_funding_round_description:
      companyData.last_funding_round_description ?? null,
    last_funding_stage: companyData.last_funding_stage ?? null,
    linkedin_url: workspace.linkedin_url ?? null,
    location: companyDb.location ?? null,
    logo_url: workspace.logo_url ?? null,
    main_investors: companyData.main_investors ?? null,
    pitch: workspace.pitch ?? null,
    related_links: normalizeWebsiteCompanyDataStringList(
      companyDb.related_links
    ),
    short_description: companyDb.short_description ?? null,
    specialities: normalizeWebsiteCompanyDataStringList(companyDb.specialities),
    total_funding_raised: companyData.total_funding_raised ?? null,
    workspace_request: workspace.request ?? null,
    workspace_published_name: workspace.published_name ?? null,
  };
  const mirroredPhysical: Partial<
    Record<WebsiteCompanyDataKey, Record<string, unknown>>
  > = {
    company_description: {
      company_db: companyDb.description ?? null,
      workspace: workspace.company_description ?? null,
    },
    company_name: {
      company_db: companyDb.name ?? null,
      workspace: workspace.company_name ?? null,
    },
    homepage_url: {
      company_db: companyDb.website_url ?? null,
      workspace: workspace.homepage_url ?? null,
    },
    linkedin_url: {
      company_db: companyDb.linkedin_url ?? null,
      workspace: workspace.linkedin_url ?? null,
    },
    logo_url: {
      company_db: companyDb.logo ?? null,
      workspace: workspace.logo_url ?? null,
    },
  };

  const snapshots = new Map<string, WebsiteCompanyDataSnapshot>();
  for (const change of args.changes) {
    const roleId = singleLine(change.roleId) || null;
    if (!roleId) {
      const value = workspaceValues[change.key];
      snapshots.set(targetKey(change.key), {
        ...(mirroredPhysical[change.key]
          ? {
              expectedPhysical: mirroredPhysical[change.key],
              // An explicit null target means detach. There is deliberately no
              // company_db mirror to repair after the transaction.
              requiresPhysicalMirror:
                snapshotCompanyDbId !== null || !hasTargetCompanyDbId,
            }
          : { expected: value ?? null }),
        value,
      });
      continue;
    }

    const role = roleById.get(roleId);
    if (!role) throw new Error("Role not found");
    const internal = internalByRoleId.get(roleId);
    if (
      change.key === "role_request" &&
      singleLine(role.source_type) === "internal" &&
      !internal
    ) {
      throw new Error("Canonical internal role request is unavailable");
    }
    const roleValues: Partial<Record<WebsiteCompanyDataKey, unknown>> = {
      role_description: role.description ?? null,
      role_description_summary: role.description_summary ?? null,
      role_employment_types: Array.isArray(role.type) ? role.type : [],
      role_expires_at: utcMillisOrNull(role.expires_at),
      role_external_jd_url: role.external_jd_url ?? null,
      role_is_expired: role.is_expired ?? null,
      role_location: role.location_text ?? null,
      role_name: role.name,
      role_request: internal?.request ?? null,
      role_posted_at: utcMillisOrNull(role.posted_at),
      role_source_job_id: role.source_job_id ?? null,
      role_source_provider: role.source_provider ?? null,
      role_source_type: role.source_type ?? null,
      role_status: role.status,
      role_work_mode: role.work_mode ?? null,
    };
    const value = roleValues[change.key];
    snapshots.set(targetKey(change.key, roleId), {
      expected: value ?? null,
      label: singleLine(role.name),
      value,
    });
  }
  return { companyDbId, snapshots };
}

export async function applyWebsiteCompanyDataChanges(args: {
  actorLabel: string;
  admin: AdminClient;
  changes: WebsiteCompanyDataChange[];
  source?: "chat" | "slack" | "website";
  targetCompanyDbId?: number | null;
  workspaceId: string;
}) {
  const hasTargetCompanyDbId = args.targetCompanyDbId !== undefined;
  if (args.changes.length === 0 && !hasTargetCompanyDbId) {
    return { changedCount: 0, status: "already_reflected" as const };
  }
  const snapshotResult = await fetchWebsiteCompanyDataSnapshots(args);
  const resolved = resolveWebsiteCompanyDataRpcChanges({
    actorLabel: args.actorLabel,
    changes: args.changes,
    snapshots: snapshotResult.snapshots,
  });
  const targetCompanyDbId = hasTargetCompanyDbId
    ? numberOrNull(args.targetCompanyDbId)
    : snapshotResult.companyDbId;
  const associationChanged =
    hasTargetCompanyDbId && snapshotResult.companyDbId !== targetCompanyDbId;
  if (resolved.rpcChanges.length === 0 && !associationChanged) {
    return { changedCount: 0, status: "already_reflected" as const };
  }

  const eventContent =
    resolved.eventContent ??
    `${getCompanyEventActorLabel({ name: args.actorLabel })} · 회사 데이터 연결 변경`;

  const { data, error } = hasTargetCompanyDbId
    ? await (args.admin.rpc as any)("reassociate_company_workspace_db_v1", {
        p_changes: resolved.rpcChanges,
        p_event_content: eventContent,
        p_expected_company_db_id: snapshotResult.companyDbId,
        p_target_company_db_id: targetCompanyDbId,
        p_workspace_id: args.workspaceId,
      })
    : await (args.admin.rpc as any)("apply_company_data_changes_v1", {
        p_changes: resolved.rpcChanges,
        p_event_content: eventContent,
        p_source: args.source ?? "website",
        p_workspace_id: args.workspaceId,
      });
  if (error) throw error;
  const result = record(data) as WebsiteCompanyDataRpcResult;
  if (result.status === "conflict") {
    throw new WebsiteCompanyDataConflictError(result.key, result.role_id);
  }
  if (result.status !== "updated" && result.status !== "already_reflected") {
    throw new Error("Unexpected company data update result");
  }
  return {
    changedCount: Number(result.changed_count ?? 0),
    status: result.status,
  };
}
