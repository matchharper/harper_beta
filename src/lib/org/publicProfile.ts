import type { OrgTalentDetailResponse } from "./server";

type PublicRow = Record<string, unknown>;
const stringOrNull = (value: unknown) =>
  typeof value === "string" && value.length ? value : null;

/** Public professional fields only. Explicit full reads preserve the original text and every row. */
export function projectCompanyPublicExtras(value: unknown) {
  let items: unknown[] = [];
  if (Array.isArray(value)) items = value;
  else if (value && typeof value === "object") {
    const record = value as PublicRow;
    for (const key of [
      "talent_extras",
      "talentExtras",
      "extras",
      "items",
      "publications",
      "projects",
      "activities",
    ]) {
      if (Array.isArray(record[key])) {
        items = record[key];
        break;
      }
    }
  }
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as PublicRow;
    const title = stringOrNull(row.title ?? row.name ?? row.role);
    const date = stringOrNull(
      row.date ?? row.issued_at ?? row.published_at ?? row.start_date
    );
    const description = stringOrNull(
      row.description ?? row.content ?? row.summary
    );
    return title || date || description ? [{ title, date, description }] : [];
  });
}

export function projectCompanyPublicProfile(args: {
  bio: unknown;
  location: unknown;
  experiences: PublicRow[];
  education: PublicRow[];
  extras: unknown;
}) {
  return {
    bio: stringOrNull(args.bio),
    location: stringOrNull(args.location),
    experiences: args.experiences.map((row) => ({
      company_name: stringOrNull(row.company_name),
      role: stringOrNull(row.role),
      employment_type: stringOrNull(row.employment_type),
      company_location: stringOrNull(row.company_location),
      start_date: stringOrNull(row.start_date),
      end_date: stringOrNull(row.end_date),
      description: stringOrNull(row.description),
    })),
    education: args.education.map((row) => ({
      school: stringOrNull(row.school),
      degree: stringOrNull(row.degree),
      field: stringOrNull(row.field),
      start_date: stringOrNull(row.start_date),
      end_date: stringOrNull(row.end_date),
      description: stringOrNull(row.description),
    })),
    extras: projectCompanyPublicExtras(args.extras),
  };
}

/** Card details may also contain private documents/memos; those are never part of this projection. */
export function projectCompanyPublicProfileFromDetail(
  profile: OrgTalentDetailResponse["profile"]
) {
  return projectCompanyPublicProfile({
    bio: profile.bio,
    location: profile.location,
    experiences: profile.experiences.map((row) => ({
      company_name: row.companyName,
      role: row.role,
      employment_type: row.employmentType,
      company_location: row.companyLocation,
      start_date: row.startDate,
      end_date: row.endDate,
      description: row.description,
    })),
    education: profile.educations.map((row) => ({
      school: row.school,
      degree: row.degree,
      field: row.field,
      start_date: row.startDate,
      end_date: row.endDate,
      description: row.description,
    })),
    extras: profile.extras,
  });
}
