import { formatLlmPartialDate, projectLlmDateTimes } from "@/lib/llm/promptDateTime";
// External V2 scoring projection: career evidence only; execution/provenance
// metadata stays in the stored snapshot. Dates use the shared web contract.
type RecordValue = Record<string, unknown>;
const mapping = (v: unknown): v is RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function hasEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasEvidence);
  if (mapping(value)) return Object.values(value).some(hasEvidence);
  return true; // Zero and false are facts, not missing values.
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function renderEvidence(value: unknown, indent = 0): string {
  if (!hasEvidence(value)) return "";
  const pad = " ".repeat(indent);
  if (mapping(value)) {
    const entries = Object.entries(value).filter(([, item]) => hasEvidence(item));
    return entries.map(([key, item]) => mapping(item) || Array.isArray(item)
      ? `${pad}- ${key}:\n${renderEvidence(item, indent + 2)}`
      : `${pad}- ${key}: ${displayValue(item).replaceAll("\n", "\n" + pad + "  ")}`
    ).join("\n");
  }
  if (Array.isArray(value)) {
    return value.filter(hasEvidence).map((item, index) => mapping(item) || Array.isArray(item)
      ? `${pad}${index + 1}.\n${renderEvidence(item, indent + 3)}`
      : `${pad}${index + 1}. ${displayValue(item).replaceAll("\n", "\n" + pad + "   ")}`
    ).join("\n");
  }
  return displayValue(value).split("\n").map(line => pad + line).join("\n");
}

function profileText(profile: unknown): string {
  if (!mapping(profile)) return renderEvidence(profile);
  const info = mapping(profile.profile) ? profile.profile : profile;
  const lines = [renderEvidence(Object.fromEntries(
    ["name", "headline", "bio", "location", "current_location"].filter(key => hasEvidence(info[key])).map(key => [key, info[key]])
  ))];
  for (const [key, title] of [["experiences", "경력 (종료일 미제공은 현재 재직의 확인이 아님)"], ["educations", "학력"], ["extras", "기타 활동"]]) {
    const rows = profile[key];
    if (!Array.isArray(rows) || !rows.some(hasEvidence)) continue;
    lines.push(`#### ${title}`);
    rows.filter(hasEvidence).forEach((entry, index) => {
      if (!mapping(entry)) { lines.push(`${index + 1}. ${renderEvidence(entry)}`); return; }
      const start = entry.startDate ?? entry.start_date ?? entry.start;
      const end = entry.endDate ?? entry.end_date ?? entry.end;
      const period = start && end ? `기간: ${formatLlmPartialDate(start)} → ${formatLlmPartialDate(end)}`
        : start ? `시작: ${formatLlmPartialDate(start)}` : end ? `종료: ${formatLlmPartialDate(end)}` : "";
      lines.push(`${index + 1}. ${[entry.role ?? entry.degree ?? entry.title, entry.company_name ?? entry.company ?? entry.school, entry.field, entry.employment_type, entry.company_location, period, typeof entry.months === "number" ? `${entry.months} months` : null, entry.date ? formatLlmPartialDate(entry.date) : null].filter(hasEvidence).join(" · ")}`);
      for (const field of ["description", "memo"]) if (hasEvidence(entry[field])) lines.push(`${field}: ${displayValue(entry[field])}`);
    });
  }
  return lines.filter(Boolean).join("\n\n");
}

function briefText(value: unknown): string {
  if (!Array.isArray(value)) return renderEvidence(value);
  return value.map(entry => {
    if (!mapping(entry)) return renderEvidence(entry);
    return [entry.label, entry.content].filter(hasEvidence).map(displayValue).join(" : ");
  }).filter(Boolean).map((text, index) => `${index + 1}. ${text}`).join("\n");
}

export function talentText(talent: unknown): string {
  if (!mapping(talent)) return renderEvidence(talent);
  const titles: Record<string, string> = { profile: "Profile", searchBrief: "전체 Search Brief", search_brief: "전체 Search Brief", behaviorContext: "Talent Behavior Context (soft evidence)", behavior_context: "Talent Behavior Context (soft evidence)" };
  return Object.entries(talent).filter(([key]) => key !== "behavior_version").map(([key, value]) => {
    const text = key === "profile" ? profileText(value)
      : key === "searchBrief" || key === "search_brief" ? briefText(value)
      : renderEvidence(value);
    return text ? `### ${titles[key] ?? key}\n${text}` : "";
  }).filter(Boolean).join("\n\n");
}

export function externalScoringInput(payload: RecordValue): string {
  return Object.entries(projectLlmDateTimes(payload) as RecordValue).map(([key, value]) => {
    const text = key === "user_context" ? talentText(value) : renderEvidence(value);
    return text ? `## ${key}\n${text}` : "";
  }).filter(Boolean).join("\n\n");
}
