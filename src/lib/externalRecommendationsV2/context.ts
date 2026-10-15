import { fetchTalentStructuredProfile } from "../talentOnboarding/profileStore";
import { fetchAllTalentContexts } from "../talentOnboarding/talentContexts";
import { normalizeTalentBlockedCompanies } from "../talentOnboarding/server";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { fingerprint } from "./contract";

export async function loadExternalContext(
  admin: TalentAdminClient,
  userId: string,
  behaviorSnapshot?: { text: string; version: number }
) {
  const [profile, brief, behavior, setting, user] = await Promise.all([
    fetchTalentStructuredProfile({ admin, userId }),
    fetchAllTalentContexts({ admin, userId, collection: "brief" }),
    admin
      .from("talent_behavior_contexts" as never)
      .select("context_text,context_version")
      .eq("talent_id", userId)
      .maybeSingle(),
    admin
      .from("talent_setting")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("talent_users")
      .select("user_id,deleted_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  for (const r of [behavior, setting, user])
    if (r.error) throw new Error(r.error.message);
  if (!user.data || user.data.deleted_at)
    throw new Error("Talent is unavailable");
  const s = setting.data as Record<string, any> | null;
  const b = behavior.data as {
    context_text: string;
    context_version: number;
  } | null;
  const context = {
    profile: {
      headline: profile.talentUser?.headline,
      bio: profile.talentUser?.bio,
      location: profile.talentUser?.location,
      current_location: profile.talentUser?.current_location,
      experiences: profile.talentExperiences.map(
        ({
          role,
          description,
          employment_type,
          start_date,
          end_date,
          months,
          company_name,
          company_location,
          memo,
        }) => ({
          role,
          description,
          employment_type,
          start_date,
          end_date,
          months,
          company_name,
          company_location,
          memo,
        })
      ),
      educations: profile.talentEducations.map(
        ({
          school,
          degree,
          description,
          field,
          start_date,
          end_date,
          memo,
        }) => ({
          school,
          degree,
          description,
          field,
          start_date,
          end_date,
          memo,
        })
      ),
      extras: profile.talentExtras,
    },
    search_brief: brief.map(({ ref, label, content }) => ({
      ref,
      label,
      content,
    })),
    behavior_context: behaviorSnapshot?.text ?? b?.context_text ?? null,
    behavior_version: behaviorSnapshot?.version ?? b?.context_version ?? 0,
    matching_preferences: {
      engagement_types: s?.engagement_types,
      blocked_companies: s?.blocked_companies,
    },
  };
  return {
    context,
    contextFingerprint: fingerprint(context),
    setting: s,
    blockedCompanies: normalizeTalentBlockedCompanies(
      s?.blocked_companies ?? []
    ),
    externalEnabled: s?.get_external_recommendation !== false,
    // Visiting Career can surface opportunities even when scheduled recommendations are off.
    dailyEnabled: s?.is_onboarding_done === true,
  };
}
// Recursive rendering retains JSON values instead of producing '[object Object]'.
export function evidenceText(value: unknown, indent = ""): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value))
    return value
      .map((v) => `${indent}- ${evidenceText(v, indent + "  ")}`)
      .join("\n");
  return Object.entries(value)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `${indent}${k}: ${typeof v === "object" ? "\n" + evidenceText(v, indent + "  ") : String(v)}`
    )
    .join("\n");
}
