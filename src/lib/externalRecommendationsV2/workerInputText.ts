// External V2 scoring projection. Shared date/fact formatting follows the Worker;
// missing fields and editing/provenance metadata are omitted at this read boundary.
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
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value))
      return value.slice(0, 16).replace("T", " ") + " (timezone unspecified)";
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(date);
      const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
    }
  }
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
  return Object.entries(profile).map(([key, value]) => {
    if (!hasEvidence(value)) return "";
    if (key === "profile" && mapping(value)) return renderEvidence(value);
    if (["experiences", "educations"].includes(key) && Array.isArray(value)) {
      const items = value.filter(hasEvidence).map((entry, i) => {
        if (!mapping(entry)) return `${i + 1}. ${renderEvidence(entry)}`;
        const start = ["startDate", "start_date", "start"].find(k => k in entry) ?? "startDate";
        const end = ["endDate", "end_date", "end"].find(k => k in entry) ?? "endDate";
        const facts = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== start && k !== end));
        const dates = hasEvidence(entry[start]) && hasEvidence(entry[end])
          ? `기간: ${displayValue(entry[start])} → ${displayValue(entry[end])}`
          : hasEvidence(entry[start]) ? `시작: ${displayValue(entry[start])}`
          : hasEvidence(entry[end]) ? `종료: ${displayValue(entry[end])}` : "";
        return `${i + 1}.${dates ? ` ${dates}` : ""}\n${renderEvidence(facts, 3)}`.trimEnd();
      });
      const title = key === "experiences" ? "경력 (종료일 미제공은 현재 재직의 확인이 아님)" : "학력";
      return `#### ${title}\n${items.join("\n")}`;
    }
    if (key === "extras" && Array.isArray(value))
      return renderEvidence({ extras: value.map(entry => mapping(entry)
        ? Object.fromEntries(Object.entries(entry).filter(([k]) => k !== "id"))
        : entry) });
    return renderEvidence({ [key]: value });
  }).filter(Boolean).join("\n\n");
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
  return Object.entries(payload).map(([key, value]) => {
    const text = key === "user_context" ? talentText(value) : renderEvidence(value);
    return text ? `## ${key}\n${text}` : "";
  }).filter(Boolean).join("\n\n");
}
