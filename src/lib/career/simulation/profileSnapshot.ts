import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

function dateText(value: string | null | undefined) {
  if (!value) return undefined;
  const formatted = formatLlmDateTime(value);
  // Career dates can be year/month-only or user-authored descriptions.
  return formatted === "-" ? value : formatted.split(" ")[0];
}

function detail(label: string, value: string | number | null | undefined) {
  return value !== null && value !== undefined && value !== ""
    ? `${label}: ${value}`
    : "";
}

function profileItem(title: string, metadata: string[], content: Array<string | null | undefined>) {
  return [
    `### ${title}`,
    metadata.filter(Boolean).join("\n"),
    ...content.filter(Boolean),
  ].filter(Boolean).join("\n\n");
}

// Include career evidence without contact details, row IDs or account settings.
export function simulationProfileSnapshot(profile: TalentStructuredProfile) {
  const user = profile.talentUser;
  const experiences = profile.talentExperiences.map((e) => profileItem(
    [e.role, e.company_name].filter(Boolean).join(" — ") || "Experience",
    [
      detail("Start date", dateText(e.start_date)),
      detail("End date", dateText(e.end_date)),
      detail("Recorded duration in months", e.months),
      detail("Employment type", e.employment_type),
      detail("Location", e.company_location),
      detail("Company link", e.company_link),
    ],
    [e.description, e.memo],
  ));
  const education = profile.talentEducations.map((e) => profileItem(
    [e.school, e.degree, e.field].filter(Boolean).join(" — ") || "Education",
    [
      detail("Start date", dateText(e.start_date)),
      detail("End date", dateText(e.end_date)),
      detail("Link", e.url),
    ],
    [e.description, e.memo],
  ));
  const additionalExperience = profile.talentExtras.map((e) => profileItem(
    e.title || "Additional experience",
    [detail("Date", dateText(e.date))],
    [e.description, e.memo],
  ));
  return [
    "## Profile",
    "Saved profile evidence. Omitted values are unrecorded, not evidence of current employment, completion or absent experience. Recorded durations do not establish calendar dates. Dated records use Asia/Seoul; partial dates retain their source precision.",
    [
      detail("Headline", user?.headline),
      detail("Location", user?.current_location ?? user?.location),
    ].filter(Boolean).join("\n"),
    user?.bio,
    experiences.length && `## Experience\n\n${experiences.join("\n\n")}`,
    education.length && `## Education\n\n${education.join("\n\n")}`,
    additionalExperience.length && `## Additional experience\n\n${additionalExperience.join("\n\n")}`,
  ].filter(Boolean).join("\n\n");
}
