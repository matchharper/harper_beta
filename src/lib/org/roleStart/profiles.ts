import "server-only";

import { roleStartSql } from "./db";

export type RoleStartProfile = {
  talentId: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  current: string | null;
  document: string;
};

function clip(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, max);
}

const DOCUMENT_LIMIT = 12_000;

/** Resumes carry contact lines; the verdict and cards never need them. */
export function withoutContacts(value: string | null) {
  return String(value ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[연락처 생략]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[링크 생략]")
    .replace(/(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]\d{4}/g, "[연락처 생략]");
}
const RESUME_MIN = 500;

/**
 * Structured profile first; the resume as written fills what is left of the
 * limit, since it often holds the detail the structured fields lost.
 */
function withResume(structured: string, resume: string | null) {
  const head = structured.slice(0, DOCUMENT_LIMIT);
  const room = DOCUMENT_LIMIT - head.length - 20;
  const text = clip(withoutContacts(resume), room);
  return room >= RESUME_MIN && text ? `${head}\n이력서 원문:\n${text}` : head;
}

/** Company-safe career projection for cards and the verdict prompt (no contact data). */
/** Where the person said they can move to, as Korean country names ("한국, 일본"). */
export function relocationNames(codes: string[] | null | undefined) {
  if (!codes?.length) return "";
  const names = new Intl.DisplayNames(["ko"], { type: "region" });
  return codes.map((code) => (code === "KR" ? "한국" : names.of(code) ?? code)).join(", ");
}

export async function loadRoleStartProfiles(ids: string[]) {
  if (!ids.length) return new Map<string, RoleStartProfile>();
  const sql = roleStartSql();
  const rows = await sql<
    Array<{
      talent_id: string;
      name: string | null;
      headline: string | null;
      bio: string | null;
      resume_text: string | null;
      location: string | null;
      relocation_countries: string[] | null;
      experiences: Array<Record<string, unknown>> | null;
      educations: Array<Record<string, unknown>> | null;
      extras: Record<string, unknown> | null;
    }>
  >`
    select t.user_id::text as talent_id, t.name, t.headline, t.bio, t.resume_text,
      coalesce(nullif(t.location, ''), t.current_location) as location,
      f.relocation_countries,
      (select jsonb_agg(jsonb_build_object('company', e.company_name, 'role', e.role, 'start', e.start_date,
          'end', e.end_date, 'description', left(e.description, 1500)) order by e.start_date desc nulls last)
        from (select * from public.talent_experiences where talent_id = t.user_id
              order by start_date desc nulls last limit 12) e) as experiences,
      (select jsonb_agg(jsonb_build_object('school', d.school, 'degree', d.degree, 'field', d.field,
          'start', d.start_date, 'end', d.end_date) order by d.start_date desc nulls last)
        from (select * from public.talent_educations where talent_id = t.user_id
              order by start_date desc nulls last limit 6) d) as educations,
      x.content as extras
    from public.talent_users t
    left join public.talent_extras x on x.talent_id = t.user_id
    left join public.talent_location_facets f on f.talent_id = t.user_id
    where t.user_id = any(${ids}::uuid[])
  `;
  const map = new Map<string, RoleStartProfile>();
  for (const row of rows) {
    const experiences = row.experiences ?? [];
    const latest = experiences[0];
    const moves = relocationNames(row.relocation_countries);
    const location = [row.location ? clip(row.location, 120) : "", moves ? `${moves} 이주 가능` : ""].filter(Boolean).join(" · ") || null;
    const lines = [
      row.headline ? `헤드라인: ${clip(row.headline, 200)}` : "",
      location ? `지역: ${location}` : "",
      row.bio ? `소개: ${clip(row.bio, 800)}` : "",
      ...experiences.map((item) =>
        `경력: ${[item.company, item.role, `${item.start ?? "시작일 미상"} ~ ${item.end ?? "현재 또는 미상"}`]
          .filter(Boolean)
          .join(" · ")}\n${clip(item.description, 1500)}`.trim()
      ),
      ...(row.educations ?? []).map((item) =>
        `학력: ${[item.school, item.degree, item.field].filter(Boolean).join(" · ")}`
      ),
      ...(((row.extras?.talent_extras ?? row.extras?.talentExtras) as Array<Record<string, unknown>> | undefined) ?? [])
        .slice(0, 8)
        .map((item) => `기타: ${[item.title, item.date].filter(Boolean).join(" · ")} ${clip(item.description, 400)}`),
    ].filter(Boolean);
    map.set(row.talent_id, {
      talentId: row.talent_id,
      name: row.name,
      headline: row.headline,
      location,
      current: latest
        ? [latest.company, latest.role].filter(Boolean).join(" · ") || null
        : null,
      document: withResume(lines.join("\n"), row.resume_text),
    });
  }
  return map;
}

/**
 * Work history with its descriptions for the first-three profile panel, with
 * contact details taken out. Temporary until the panel merges into the shared
 * candidate review screen (#14 3.2 item 3).
 */
export async function loadFirstThreeExperiences(ids: string[]) {
  const byTalent = new Map<string, Array<{ company: string | null; role: string | null; start: string | null; end: string | null; description: string | null }>>();
  if (!ids.length) return byTalent;
  const sql = roleStartSql();
  const rows = await sql<Array<{ talent_id: string; company_name: string | null; role: string | null; start_date: string | null; end_date: string | null; description: string | null }>>`
    select talent_id, company_name, role, start_date::text, end_date::text, description
    from public.talent_experiences
    where talent_id = any(${ids})
    order by start_date desc nulls last
  `;
  for (const row of rows) {
    const list = byTalent.get(row.talent_id) ?? [];
    list.push({
      company: row.company_name,
      role: row.role,
      start: row.start_date?.slice(0, 7) ?? null,
      end: row.end_date?.slice(0, 7) ?? null,
      description: withoutContacts(row.description)?.slice(0, 1_500) || null,
    });
    byTalent.set(row.talent_id, list);
  }
  return byTalent;
}
