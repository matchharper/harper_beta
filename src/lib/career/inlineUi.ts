import { isPostingRoleId, normalizePostingRoleId } from "./postingLinks";

/** Presentation references only. They never authorize or execute an action. */
export type CareerInlineUiReference =
  | { type: "forms"; formIds: number[]; grouped: boolean }
  | { type: "matching"; matchingId: string; runId?: string }
  | { type: "opportunities"; scope: "all" | "saved" | "progress" }
  | { type: "opportunities"; roleIds: string[] }
  | { type: "brief" }
  | { type: "meetings"; roleId?: string }
  | { type: "automations" }
  | { type: "actions" };

export type CareerInlineUiPart =
  | { kind: "text"; content: string; key: string }
  | { kind: "ui"; reference: CareerInlineUiReference; key: string }
  | { kind: "invalid"; key: string };

export const CAREER_INLINE_UI_PREFIX = "[[career_ui:";

export function readCareerInlineUiReference(
  value: unknown
): CareerInlineUiReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.type === "forms" && Array.isArray(row.formIds) && row.formIds.length && row.formIds.every(id => Number.isSafeInteger(id) && Number(id) > 0))
    return { type: "forms", formIds: [...new Set(row.formIds as number[])], grouped: row.grouped === true };
  if (row.type === "brief" || row.type === "automations" || row.type === "actions") return { type: row.type };
  if (row.type === "meetings") {
    if (row.roleId !== undefined && (typeof row.roleId !== "string" || !isPostingRoleId(row.roleId))) return null;
    return { type: "meetings", ...(typeof row.roleId === "string" ? { roleId: normalizePostingRoleId(row.roleId).toLowerCase() } : {}) };
  }
  if (
    row.type === "matching" &&
    typeof row.matchingId === "string" &&
    isPostingRoleId(row.matchingId)
  ) {
    if (
      row.runId !== undefined &&
      (typeof row.runId !== "string" || !isPostingRoleId(row.runId))
    )
      return null;
    return {
      type: "matching",
      matchingId: normalizePostingRoleId(row.matchingId).toLowerCase(),
      ...(typeof row.runId === "string"
        ? { runId: normalizePostingRoleId(row.runId).toLowerCase() }
        : {}),
    };
  }
  if (row.type !== "opportunities") return null;
  if (row.roleIds !== undefined) {
    if (
      row.scope !== undefined ||
      !Array.isArray(row.roleIds) ||
      !row.roleIds.length ||
      !row.roleIds.every((id) => typeof id === "string" && isPostingRoleId(id))
    )
      return null;
    return {
      type: "opportunities",
      roleIds: [
        ...new Set(
          (row.roleIds as string[]).map((id) =>
            normalizePostingRoleId(id).toLowerCase()
          )
        ),
      ],
    };
  }
  return row.scope === "all" ||
    row.scope === "saved" ||
    row.scope === "progress"
    ? { type: "opportunities", scope: row.scope }
    : null;
}

export function formatCareerInlineUiReference(
  reference: CareerInlineUiReference
) {
  return `${CAREER_INLINE_UI_PREFIX}${JSON.stringify(reference)}]]`;
}

/** Only standalone assistant control lines are interpreted; quoted/code content stays literal. */
export function parseCareerInlineUi(
  content: string,
  streaming = false
): CareerInlineUiPart[] {
  const parts: CareerInlineUiPart[] = [];
  let text: string[] = [];
  let fence: { token: string; length: number } | null = null;
  let offset = 0;
  let textStart = 0;
  const flush = () => {
    const value = text.join("\n").trim();
    if (value)
      parts.push({ kind: "text", content: value, key: `text-${textStart}` });
    text = [];
  };
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) {
      const token = delimiter[1];
      if (!fence) fence = { token: token[0], length: token.length };
      else if (token[0] === fence.token && token.length >= fence.length)
        fence = null;
      text.push(line);
      return;
    }
    if (fence || /^(?: {4}|\t|\s{0,3}>)/.test(line)) {
      text.push(line);
      return;
    }
    const formPrefixes = ["[[form:", "[[forms:"];
    const incompleteForm = streaming && index === lines.length - 1 && trimmed.length > 0 &&
      formPrefixes.some(prefix => prefix.startsWith(trimmed) || (trimmed.startsWith(prefix) && !trimmed.endsWith("]]")));
    if (incompleteForm) { flush(); return; }
    if (formPrefixes.some(prefix => trimmed.startsWith(prefix))) {
      flush();
      let reference: CareerInlineUiReference | null = null;
      try {
        const grouped = trimmed.startsWith("[[forms:");
        const raw = trimmed.slice(grouped ? 8 : 7, -2);
        const ids = grouped ? JSON.parse(raw) : [Number(raw)];
        if (trimmed.endsWith("]]")) reference = readCareerInlineUiReference({ type: "forms", formIds: ids, grouped });
      } catch { /* Unfinished or invalid references perform no action. */ }
      if (!reference && streaming && index === lines.length - 1) return;
      parts.push(reference ? { kind: "ui", reference, key: `ui-${start}` } : { kind: "invalid", key: `ui-${start}` });
      textStart = offset;
      return;
    }
    const incomplete =
      streaming &&
      index === lines.length - 1 &&
      trimmed.length > 0 &&
      (CAREER_INLINE_UI_PREFIX.startsWith(trimmed) ||
        (trimmed.startsWith(CAREER_INLINE_UI_PREFIX) &&
          !trimmed.endsWith("]]")));
    if (incomplete) {
      flush();
      return;
    }
    if (!trimmed.startsWith(CAREER_INLINE_UI_PREFIX)) {
      text.push(line);
      return;
    }
    flush();
    let reference: CareerInlineUiReference | null = null;
    if (trimmed.endsWith("]]")) {
      try {
        reference = readCareerInlineUiReference(
          JSON.parse(trimmed.slice(CAREER_INLINE_UI_PREFIX.length, -2))
        );
      } catch {
        /* Invalid control data must not start a request. */
      }
    }
    parts.push(
      reference
        ? { kind: "ui", reference, key: `ui-${start}` }
        : { kind: "invalid", key: `ui-${start}` }
    );
    textStart = offset;
  });
  flush();
  return parts;
}
