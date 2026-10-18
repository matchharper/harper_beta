// TypeScript counterpart of opportunity worker opp/matching/text.py and
// opp/utils/llm_input_text.py. Cross-runtime tests keep the reading contract equal.
type RecordValue = Record<string, unknown>;
const mapping = (v: unknown): v is RecordValue =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "미제공";
  if (value === "") return "(빈 값)";
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
  const pad = " ".repeat(indent);
  if (mapping(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return pad + "(항목 없음)";
    return entries.map(([key, item]) => mapping(item) || Array.isArray(item)
      ? `${pad}- ${key}:\n${renderEvidence(item, indent + 2)}`
      : `${pad}- ${key}: ${displayValue(item).replaceAll("\n", "\n" + pad + "  ")}`
    ).join("\n");
  }
  if (Array.isArray(value)) {
    if (!value.length) return pad + "(항목 없음)";
    return value.map((item, index) => mapping(item) || Array.isArray(item)
      ? `${pad}${index + 1}.\n${renderEvidence(item, indent + 3)}`
      : `${pad}${index + 1}. ${displayValue(item).replaceAll("\n", "\n" + pad + "   ")}`
    ).join("\n");
  }
  return displayValue(value).split("\n").map(line => pad + line).join("\n");
}

function profileText(profile: unknown): string {
  if (!mapping(profile)) return renderEvidence(profile);
  return Object.entries(profile).map(([key, value]) => {
    if (key === "profile" && mapping(value)) return renderEvidence(value);
    if (["experiences", "educations"].includes(key) && Array.isArray(value)) {
      const items = value.map((entry, i) => {
        if (!mapping(entry)) return `${i + 1}. ${renderEvidence(entry)}`;
        const start = ["startDate", "start_date", "start"].find(k => k in entry) ?? "startDate";
        const end = ["endDate", "end_date", "end"].find(k => k in entry) ?? "endDate";
        const facts = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== start && k !== end));
        return `${i + 1}. 기간: ${displayValue(entry[start])} → ${displayValue(entry[end])}\n${renderEvidence(facts, 3)}`;
      });
      const title = key === "experiences" ? "경력 (종료일 미제공은 현재 재직의 확인이 아님)" : "학력";
      return `#### ${title}\n${items.length ? items.join("\n") : "(항목 없음)"}`;
    }
    return renderEvidence({ [key]: value });
  }).join("\n\n");
}

export function talentText(talent: unknown): string {
  if (!mapping(talent)) return renderEvidence(talent);
  const titles: Record<string, string> = { profile: "Profile", searchBrief: "전체 Search Brief", search_brief: "전체 Search Brief", behaviorContext: "Talent Behavior Context (soft evidence)", behavior_context: "Talent Behavior Context (soft evidence)" };
  return Object.entries(talent).map(([key, value]) => `### ${titles[key] ?? key}\n${key === "profile" ? profileText(value) : renderEvidence(value)}`).join("\n\n");
}

export function externalScoringInput(payload: RecordValue): string {
  return Object.entries(payload).map(([key, value]) => `## ${key}\n${key === "user_context" ? talentText(value) : renderEvidence(value)}`).join("\n\n");
}
