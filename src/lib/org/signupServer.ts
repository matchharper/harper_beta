import type { User } from "@supabase/supabase-js";
import { parse } from "tldts";
import freeEmailDomains from "free-email-domains";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getExaClient, type ExaSearchClient } from "@/lib/tools/exaClient";
import type { SignupCompany, SignupEntry } from "./signup";

const personalDomains = new Set<string>(freeEmailDomains);
export function companyEmailDomain(
  user: Pick<User, "email" | "email_confirmed_at" | "is_anonymous">
) {
  if (!user.email_confirmed_at || user.is_anonymous || !user.email) return null;
  const host = user.email.split("@")[1]?.toLowerCase();
  if (!host || personalDomains.has(host)) return null;
  const parsed = parse(host, { allowPrivateDomains: true });
  if (
    !parsed.domain ||
    !(parsed.isIcann || parsed.isPrivate) ||
    parsed.isIp ||
    personalDomains.has(parsed.domain)
  )
    return null;
  return parsed.domain;
}
export async function signupRpc<T>(
  name: string,
  values: Record<string, unknown>
): Promise<T> {
  const { data, error } = await (getSupabaseAdmin().rpc as any)(name, values);
  if (error && !error.message.startsWith("signup_"))
    console.error("[org/signup:rpc]", name, error.code);
  if (error)
    throw new Error(
      error.message.startsWith("signup_") ? error.message : "signup_unavailable"
    );
  return data as T;
}
export async function signupEntry(
  user: User,
  create = false
): Promise<SignupEntry> {
  const domain = companyEmailDomain(user);
  if (!domain) return { status: "work_email_required" };
  return signupRpc<SignupEntry>("workspace_signup_begin_v1", {
    p_user: user.id,
    p_domain: domain,
    p_create: create,
  });
}
export function normalizedLinkedinUrl(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 400)
    throw new Error("signup_invalid_company");
  let url: URL;
  try {
    const input = value.trim();
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("signup_invalid_company");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !["linkedin.com", "www.linkedin.com"].includes(
      url.hostname.toLowerCase()
    ) ||
    !/^\/company\/[^/]+\/?$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("signup_invalid_company");
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
}
export function companyInput(value: Record<string, unknown>) {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  if (!name || name.length > 160 || description.length > 8000)
    throw new Error("signup_invalid_company");
  return {
    name,
    description,
    linkedinUrl: normalizedLinkedinUrl(value.linkedinUrl),
  };
}

// Exa only receives the verified domain and public pages, never the person's email.
// Its structured extraction supplies editable suggestions, never access permissions.
export async function researchSignupCompany(
  domain: string,
  exa: ExaSearchClient = getExaClient()
): Promise<SignupCompany | null> {
  const properties = Object.fromEntries(
    [
      "name",
      "description",
      "linkedinUrl",
      "location",
      "totalFundingRaised",
      "mainInvestors",
      "lastFundingStage",
      "lastFundingRoundDescription",
    ].map((key) => [key, { type: "string" }])
  );
  const result = await exa.search(
    `Company information about ${domain}: official company name, what the company does, headquarters and LinkedIn company page`,
    {
      type: "auto",
      includeDomains: [domain],
      numResults: 3,
      contents: {
        summary: {
          query:
            "Extract the company operating this website, not its customers or partners. Use only facts supported by this page. Keep the description concise. Return empty strings for unknown fields. linkedinUrl must be an official LinkedIn company page explicitly linked or stated in the source.",
          schema: {
            type: "object",
            properties,
            required: Object.keys(properties),
            additionalProperties: false,
          },
        },
      },
    }
  );
  for (const row of result.results) {
    const sourceDomain = parse(row.url, { allowPrivateDomains: true }).domain;
    if (sourceDomain !== domain || !row.summary) continue;
    try {
      if (!["https:", "http:"].includes(new URL(row.url).protocol)) continue;
      const data = JSON.parse(row.summary);
      // An absent/invalid optional link should not discard supported company facts.
      try {
        data.linkedinUrl = normalizedLinkedinUrl(data.linkedinUrl);
      } catch {
        data.linkedinUrl = "";
      }
      const company = companyInput(data);
      return {
        ...company,
        location:
          typeof data.location === "string" ? data.location.slice(0, 300) : "",
        ...Object.fromEntries(
          [
            "totalFundingRaised",
            "mainInvestors",
            "lastFundingStage",
            "lastFundingRoundDescription",
          ].map((key) => [
            key,
            typeof data[key] === "string" ? data[key].slice(0, 1200) : "",
          ])
        ),
        sources: [{ title: row.title || domain, url: row.url }],
      };
    } catch {
      /* Unknown or malformed provider data is not a company fact. */
    }
  }
  return null;
}
export async function runSignupResearch(userId: string, workspaceId: string) {
  const claim = await signupRpc<{
    claimed: boolean;
    token?: string;
    domain?: string;
  }>("workspace_signup_update_v1", {
    p_user: userId,
    p_workspace: workspaceId,
    p_action: "research_start",
  });
  if (!claim.claimed || !claim.domain) return;
  let company: SignupCompany | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    company = await Promise.race([
      researchSignupCompany(claim.domain),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 45000);
      }),
    ]);
  } catch {
    /* A provider failure must leave manual company entry usable. */
  } finally {
    clearTimeout(timer);
  }
  await signupRpc("workspace_signup_update_v1", {
    p_user: userId,
    p_workspace: workspaceId,
    p_action: "research_finish",
    p_values: { token: claim.token, ...(company ? { company } : {}) },
  });
}
