import "server-only";

import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { getExaClient, type ExaContentsClient } from "@/lib/tools/exaClient";
import {
  fetchCareerJobPosting,
  parseCareerJobUrl,
  type CareerJobPostingDraft,
  type CareerJobPostingManualFields,
  type CareerJobProvider,
  type CareerJobUrlIdentity,
} from "@/lib/career/jobLinkImport";

const USER_SUBMITTED_ROLE_PROVIDER = "user_submitted";

const EXISTING_ROLE_PROVIDER_ALIASES: Partial<
  Record<CareerJobProvider, string[]>
> = {
  linkedin: ["linkedin", "linkedin_jobs"],
};

type ExistingRole = {
  company_workspace_id: string;
  external_jd_url: string | null;
  name: string;
  role_id: string;
  source_job_id: string | null;
  source_provider: string | null;
};

type CompanyWorkspace = {
  company_db_id: number | null;
  company_workspace_id: string;
};

export type CareerJobLinkImportResult = {
  createdRecommendation: boolean;
  createdRole: boolean;
  createdWorkspace: boolean;
  recommendationId: string;
  roleId: string;
  roleSourceProvider: string;
};

type ImportCareerJobLinkArgs = {
  admin: TalentAdminClient;
  exa?: ExaContentsClient;
  fetcher?: typeof fetch;
  manual?: CareerJobPostingManualFields;
  savedStage: "applied" | "closed" | "connected" | "saved";
  talentId: string;
  url: string;
};

function cleanText(value: unknown, maxLength = 2_000) {
  const text =
    typeof value === "string"
      ? value
          .replace(/\u0000/g, "")
          .replace(/\r/g, "")
          .trim()
      : "";
  return text ? text.slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength?: number) {
  return cleanText(value, maxLength) || null;
}

function urlVariants(value: string | null | undefined) {
  const raw = cleanText(value, 2_048);
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const variants = new Set([url.toString()]);
    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
      variants.add(url.toString());
    } else if (url.pathname !== "/") {
      url.pathname = `${url.pathname}/`;
      variants.add(url.toString());
    }
    return [...variants];
  } catch {
    return [raw];
  }
}

async function maybeSingle<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  errorMessage: string
) {
  const { data, error } = await query;
  if (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : errorMessage;
    throw new Error(message || errorMessage);
  }
  return (data ?? null) as T | null;
}

async function findRoleBySourceIdentity(args: {
  admin: TalentAdminClient;
  provider: string;
  sourceJobId: string;
}) {
  return maybeSingle<ExistingRole>(
    args.admin
      .from("company_roles")
      .select(
        "role_id, company_workspace_id, name, external_jd_url, source_provider, source_job_id"
      )
      .eq("source_type", "external")
      .eq("source_provider", args.provider)
      .eq("source_job_id", args.sourceJobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Failed to match an existing role by source identity."
  );
}

async function findExistingRole(
  admin: TalentAdminClient,
  identity: CareerJobUrlIdentity
) {
  if (identity.provider !== "other" && identity.providerJobId) {
    const providerAliases = EXISTING_ROLE_PROVIDER_ALIASES[
      identity.provider
    ] ?? [identity.provider];
    for (const provider of providerAliases) {
      const sharedRole = await findRoleBySourceIdentity({
        admin,
        provider,
        sourceJobId: identity.providerJobId,
      });
      if (sharedRole) return sharedRole;
    }

    const submittedRole = await findRoleBySourceIdentity({
      admin,
      provider: USER_SUBMITTED_ROLE_PROVIDER,
      sourceJobId: identity.userSubmittedSourceJobId,
    });
    if (submittedRole) return submittedRole;

    const providerUrlPrefixes =
      identity.provider === "wanted"
        ? ["https://wanted.co.kr/wd/", "https://www.wanted.co.kr/wd/"]
        : identity.provider === "jumpit"
          ? ["https://jumpit.saramin.co.kr/position/"]
          : [];
    for (const prefix of providerUrlPrefixes) {
      const providerUrlRole = await maybeSingle<ExistingRole>(
        admin
          .from("company_roles")
          .select(
            "role_id, company_workspace_id, name, external_jd_url, source_provider, source_job_id"
          )
          .eq("source_type", "external")
          .like("external_jd_url", `${prefix}${identity.providerJobId}%`)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "Failed to match an existing role by provider URL identity."
      );
      if (providerUrlRole) return providerUrlRole;
    }
  }

  const variants = Array.from(
    new Set(identity.roleUrlVariants.flatMap((value) => urlVariants(value)))
  );
  if (variants.length === 0) return null;
  return maybeSingle<ExistingRole>(
    admin
      .from("company_roles")
      .select(
        "role_id, company_workspace_id, name, external_jd_url, source_provider, source_job_id"
      )
      .eq("source_type", "external")
      .in("external_jd_url", variants)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Failed to match an existing role by URL."
  );
}

async function findWorkspaceByProviderIdentity(args: {
  admin: TalentAdminClient;
  provider: CareerJobProvider;
  providerCompanyId: string | null;
  providerCompanyUrl: string | null;
}) {
  if (args.provider === "other") return null;
  let identity: { company_workspace_id: string } | null = null;
  if (args.providerCompanyId) {
    identity = await maybeSingle(
      args.admin
        .from("jobposting_company_identity")
        .select("company_workspace_id")
        .eq("provider", args.provider)
        .eq("provider_company_id", args.providerCompanyId)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "Failed to match company provider identity."
    );
  }
  if (!identity && args.providerCompanyUrl) {
    identity = await maybeSingle(
      args.admin
        .from("jobposting_company_identity")
        .select("company_workspace_id")
        .eq("provider", args.provider)
        .eq("provider_company_url", args.providerCompanyUrl)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "Failed to match company provider URL."
    );
  }
  if (!identity?.company_workspace_id) return null;

  return maybeSingle<CompanyWorkspace>(
    args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_db_id")
      .eq("company_workspace_id", identity.company_workspace_id)
      .eq("is_internal", false)
      .maybeSingle(),
    "Failed to load matched company workspace."
  );
}

async function findWorkspaceByExactUrl(args: {
  admin: TalentAdminClient;
  careerUrl: string | null;
}) {
  const careerUrls = urlVariants(args.careerUrl);
  if (careerUrls.length === 0) return null;
  return maybeSingle<CompanyWorkspace>(
    args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_db_id")
      .eq("is_internal", false)
      .in("career_url", careerUrls)
      .order("external_roles_enabled", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Failed to match company career URL."
  );
}

async function findWorkspaceByExactName(args: {
  admin: TalentAdminClient;
  companyName: string;
}) {
  const exactName = cleanText(args.companyName, 240);
  if (!exactName) return null;
  const escapedName = exactName.replace(
    /[\\%_]/g,
    (character) => `\\${character}`
  );
  const [companyNameResult, publishedNameResult] = await Promise.all([
    args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_db_id")
      .eq("is_internal", false)
      .ilike("company_name", escapedName)
      .limit(2),
    args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_db_id")
      .eq("is_internal", false)
      .ilike("published_name", escapedName)
      .limit(2),
  ]);
  if (companyNameResult.error || publishedNameResult.error) {
    throw new Error("Failed to match an exact company workspace name.");
  }
  const matches = new Map<string, CompanyWorkspace>();
  for (const row of [
    ...((companyNameResult.data ?? []) as CompanyWorkspace[]),
    ...((publishedNameResult.data ?? []) as CompanyWorkspace[]),
  ]) {
    matches.set(row.company_workspace_id, row);
  }
  return matches.size === 1 ? [...matches.values()][0] : null;
}

async function findCompanyDbId(args: {
  admin: TalentAdminClient;
  companyName: string;
}) {
  const exactName = cleanText(args.companyName, 240);
  if (!exactName) return null;
  const escapedName = exactName.replace(
    /[\\%_]/g,
    (character) => `\\${character}`
  );
  const { data, error } = await args.admin
    .from("company_db")
    .select("id")
    .ilike("name", escapedName)
    .limit(2);
  if (error) throw new Error(error.message ?? "Failed to match company name.");
  const rows = (data ?? []) as Array<{ id: number }>;
  return rows.length === 1 ? rows[0].id : null;
}

async function findWorkspaceByCompanyDbId(
  admin: TalentAdminClient,
  companyDbId: number | null
) {
  if (!companyDbId) return null;
  return maybeSingle<CompanyWorkspace>(
    admin
      .from("company_workspace")
      .select("company_workspace_id, company_db_id")
      .eq("company_db_id", companyDbId)
      .eq("is_internal", false)
      .order("external_roles_enabled", { ascending: false })
      .order("is_scrape_original", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Failed to match company workspace."
  );
}

async function resolveWorkspace(args: {
  admin: TalentAdminClient;
  draft: CareerJobPostingDraft;
}) {
  const providerWorkspace = await findWorkspaceByProviderIdentity({
    admin: args.admin,
    provider: args.draft.provider,
    providerCompanyId: args.draft.providerCompanyId,
    providerCompanyUrl: args.draft.providerCompanyUrl,
  });
  if (providerWorkspace) return providerWorkspace;

  const urlWorkspace = await findWorkspaceByExactUrl({
    admin: args.admin,
    careerUrl: args.draft.providerCompanyUrl,
  });
  if (urlWorkspace) return urlWorkspace;

  const nameWorkspace = await findWorkspaceByExactName({
    admin: args.admin,
    companyName: args.draft.companyName,
  });
  if (nameWorkspace) return nameWorkspace;

  const companyDbId = await findCompanyDbId({
    admin: args.admin,
    companyName: args.draft.companyName,
  });
  return {
    companyDbId,
    workspace:
      (await findWorkspaceByCompanyDbId(args.admin, companyDbId)) ?? null,
  };
}

function buildRolePayload(
  draft: CareerJobPostingDraft | null,
  identity: CareerJobUrlIdentity
) {
  if (!draft) {
    return {
      canonicalUrl: identity.canonicalUrl,
      provider: identity.provider,
      providerJobId: identity.providerJobId,
      roleUrlVariants: identity.roleUrlVariants,
      userSubmittedSourceJobId: identity.userSubmittedSourceJobId,
    };
  }
  return {
    canonicalUrl: draft.canonicalUrl,
    companyLogoUrl: draft.companyLogoUrl,
    companyName: draft.companyName,
    description: draft.description,
    descriptionSummary: draft.descriptionSummary,
    employmentTypes: draft.employmentTypes,
    extractedBy: draft.extractedBy,
    location: draft.location,
    provider: draft.provider,
    providerCompanyId: draft.providerCompanyId,
    providerCompanyUrl: draft.providerCompanyUrl,
    providerJobId: draft.providerJobId,
    roleUrlVariants: draft.roleUrlVariants,
    salaryRange: draft.salaryRange,
    title: draft.title,
    userSubmittedSourceJobId: draft.userSubmittedSourceJobId,
    workMode: draft.workMode,
  };
}

function buildWorkspacePayload(
  draft: CareerJobPostingDraft | null,
  companyDbId: number | null
) {
  if (!draft) return {};
  return {
    careerUrl: draft.providerCompanyUrl,
    companyDbId,
    companyDescription: null,
    companyLogoUrl: draft.companyLogoUrl,
    companyName: draft.companyName,
  };
}

export async function importCareerJobLink(
  args: ImportCareerJobLinkArgs
): Promise<CareerJobLinkImportResult> {
  const identity = parseCareerJobUrl(args.url);
  const existingRole = await findExistingRole(args.admin, identity);
  let draft: CareerJobPostingDraft | null = null;
  let workspace: CompanyWorkspace | null = null;
  let companyDbId: number | null = null;

  if (!existingRole) {
    draft = await fetchCareerJobPosting({
      exa:
        args.exa ??
        (String(process.env.EXA_API_KEY ?? "").trim()
          ? getExaClient()
          : undefined),
      fetcher: args.fetcher,
      manual: args.manual,
      url: args.url,
    });
    const resolution = await resolveWorkspace({ admin: args.admin, draft });
    if ("workspace" in resolution) {
      workspace = resolution.workspace;
      companyDbId = resolution.companyDbId;
    } else {
      workspace = resolution;
      companyDbId = resolution.company_db_id;
    }
  }

  const { data, error } = await (args.admin.rpc as any)(
    "import_talent_job_link",
    {
      p_existing_role_id: existingRole?.role_id ?? null,
      p_role: buildRolePayload(draft, identity) as Json,
      p_saved_stage: args.savedStage,
      p_talent_id: args.talentId,
      p_workspace: buildWorkspacePayload(draft, companyDbId) as Json,
      p_workspace_id:
        existingRole?.company_workspace_id ??
        workspace?.company_workspace_id ??
        null,
    }
  );
  if (error) {
    throw new Error(error.message ?? "Failed to save job link.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    created_recommendation?: boolean;
    created_role?: boolean;
    created_workspace?: boolean;
    recommendation_id?: string;
    role_id?: string;
    role_source_provider?: string;
  } | null;
  const roleId = cleanText(row?.role_id, 120);
  const recommendationId = cleanText(row?.recommendation_id, 120);
  if (!roleId || !recommendationId) {
    throw new Error("Failed to save job link.");
  }

  return {
    createdRecommendation: row?.created_recommendation === true,
    createdRole: row?.created_role === true,
    createdWorkspace: row?.created_workspace === true,
    recommendationId,
    roleId,
    roleSourceProvider:
      cleanText(row?.role_source_provider, 120) ||
      (row?.created_role === true ? USER_SUBMITTED_ROLE_PROVIDER : "unknown"),
  };
}
