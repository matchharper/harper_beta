import "server-only";

import { gtmStructuredCall } from "@/lib/gtmPlays/llm.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  careerLines,
  shareLinkYearMonth as yearMonth,
  type ShareLinkPosting,
  type ShareLinkScope,
  type ShareLinkSnapshot,
} from "./shared";

type Admin = ReturnType<typeof getSupabaseAdmin>;

type ProfileFacts = {
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  locale: "ko" | "en" | null;
  blockedCompanies: string[];
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null; description: string | null }>;
  educations: Array<{ school: string | null; degree: string | null; field: string | null }>;
  brief: Array<{ label: string | null; content: string | null }>;
};

const text = (value: unknown) => String(value ?? "").trim();

/** The candidate as the company may see them: profile, career, education and the search brief they keep. */
export async function readShareLinkProfile(admin: Admin, talentId: string): Promise<ProfileFacts | null> {
  const [user, setting, experiences, educations, brief] = await Promise.all([
    admin.from("talent_users").select("name,email,headline,bio,location,current_location,deleted_at")
      .eq("user_id", talentId).maybeSingle(),
    admin.from("talent_setting").select("blocked_companies,preferred_locale,setting_locale").eq("user_id", talentId).maybeSingle(),
    admin.from("talent_experiences").select("role,company_name,start_date,end_date,description")
      .eq("talent_id", talentId).order("start_date", { ascending: false, nullsFirst: false }),
    admin.from("talent_educations").select("school,degree,field").eq("talent_id", talentId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    admin.from("talent_contexts").select("label,content").eq("talent_id", talentId).eq("collection", "brief")
      .is("deleted_at", null).order("ref"),
  ]);
  for (const result of [user, setting, experiences, educations, brief]) if (result.error) throw result.error;
  const row = user.data as { name: string | null; email: string | null; headline: string | null; bio: string | null;
    location: string | null; current_location: string | null; deleted_at: string | null } | null;
  if (!row || row.deleted_at) return null;
  const settingRow = setting.data as { blocked_companies: string[] | null; preferred_locale: string | null; setting_locale: string | null } | null;
  const localeText = text(settingRow?.setting_locale || settingRow?.preferred_locale).toLowerCase();
  return {
    name: text(row.name) || text(row.email).split("@")[0],
    headline: text(row.headline) || null,
    bio: text(row.bio) || null,
    location: text(row.location) || text(row.current_location) || null,
    locale: localeText.startsWith("ko") ? "ko" : localeText.startsWith("en") ? "en" : null,
    blockedCompanies: (settingRow?.blocked_companies ?? []).map((name) => text(name).toLowerCase()).filter(Boolean),
    experiences: ((experiences.data ?? []) as Array<Record<string, string | null>>).map((item) => ({
      role: text(item.role) || null, company: text(item.company_name) || null,
      start: item.start_date ?? null, end: item.end_date ?? null, description: text(item.description) || null,
    })),
    educations: ((educations.data ?? []) as Array<Record<string, string | null>>).map((item) => ({
      school: text(item.school) || null, degree: text(item.degree) || null, field: text(item.field) || null,
    })),
    brief: ((brief.data ?? []) as Array<{ label: string | null; content: string | null }>)
      .filter((item) => text(item.content)),
  };
}

type Written = { summary: string; fit: string[]; wants: string[] };

function profileText(profile: ProfileFacts) {
  return [
    `Name: ${profile.name}`,
    profile.headline ? `Headline: ${profile.headline}` : null,
    profile.location ? `Location: ${profile.location}` : null,
    profile.bio ? `About: ${profile.bio.slice(0, 1_500)}` : null,
    "Career (newest first):",
    ...profile.experiences.slice(0, 8).map((item) =>
      `- ${[item.role, item.company, [yearMonth(item.start), yearMonth(item.end) ?? "now"].join("–")].filter(Boolean).join(" · ")}${item.description ? `: ${item.description.slice(0, 600)}` : ""}`),
    profile.educations.length ? "Education:" : null,
    ...profile.educations.slice(0, 3).map((item) => `- ${[item.degree, item.field, item.school].filter(Boolean).join(", ")}`),
    profile.brief.length ? "What they are looking for (their own search brief):" : null,
    ...profile.brief.slice(0, 20).map((item) => `- ${item.label ? `${item.label}: ` : ""}${text(item.content).slice(0, 400)}`),
  ].filter(Boolean).join("\n");
}

/**
 * What the company sees on /c and in the mail box. The model writes the words from the facts it is given; it is
 * not given anything the candidate did not agree to show (compensation only with scope.compensation).
 */
export async function writeShareLinkSnapshot(args: {
  profile: ProfileFacts;
  companyName: string;
  posting: ShareLinkPosting | null;
  scope: ShareLinkScope;
  language: "ko" | "en";
}): Promise<ShareLinkSnapshot> {
  const { profile, language } = args;
  const base = {
    name: profile.name,
    headline: profile.headline,
    location: profile.location,
    career: careerLines(profile.experiences, language),
  };
  let written: Written | null = null;
  try {
    written = await gtmStructuredCall<Written>({
      label: "share-link:snapshot",
      schemaName: "share_link_snapshot",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "fit", "wants"],
        properties: {
          summary: { type: "string" },
          fit: { type: "array", items: { type: "string" } },
          wants: { type: "array", items: { type: "string" } },
        },
      },
      system: [
        "You introduce one candidate to a hiring team that just received this candidate's application or email.",
        `Write in ${language === "ko" ? "Korean" : "English"}.`,
        "summary: one sentence about who this person is for this team (role, depth, the strongest fact). No praise words without a fact.",
        args.posting
          ? "fit: up to 3 short lines, each a concrete reason this person fits this posting, citing their actual experience. If a reason needs a fact the profile does not show, leave it out."
          : "fit: up to 3 short lines, each a concrete reason this person could help this company, citing their actual experience.",
        "wants: up to 3 short lines on what the person is looking for (role, work type, location, timing) from their search brief.",
        args.scope.compensation
          ? "Compensation the person stated may appear in wants."
          : "Never mention compensation, salary or numbers about pay.",
        "Leave out private reasons for leaving, personal circumstances, other companies they are talking to, and anything not stated in the facts.",
      ].join("\n"),
      user: [
        `Hiring company: ${args.companyName}`,
        args.posting ? `Posting: ${args.posting.title}` : "No posting (the candidate wrote to the company directly).",
        args.posting?.description ? `Posting text:\n${args.posting.description.slice(0, 6_000)}` : null,
        "",
        "Candidate:",
        profileText(profile),
      ].filter((line) => line !== null).join("\n"),
    });
  } catch (error) {
    console.warn("[share-link] snapshot writer failed, using the profile as it is", error);
  }
  const lines = (values: unknown) => (Array.isArray(values) ? values : []).map(text).filter(Boolean).slice(0, 3);
  const fallbackSummary = profile.headline || base.career[0] || profile.name;
  return {
    ...base,
    summary: text(written?.summary) || fallbackSummary,
    fit: lines(written?.fit),
    wants: lines(written?.wants),
  };
}

export type { ProfileFacts as ShareLinkProfile };
