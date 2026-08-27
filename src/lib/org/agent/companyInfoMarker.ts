export const ORG_AGENT_COMPANY_INFO_MARKER = "[[company_info]]";

const LEGACY_ORG_AGENT_COMPANY_INFO_MARKER = "[company_info]";

export type OrgAgentCompanyInfoSegment =
  | { kind: "company_info" }
  | { kind: "text"; text: string };

function cleanRenderedText(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isCompanyInfoMarkerLine(line: string) {
  const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;
  if (leadingSpaces > 3) return false;
  const trimmed = line.trim();
  return (
    trimmed === ORG_AGENT_COMPANY_INFO_MARKER ||
    trimmed === LEGACY_ORG_AGENT_COMPANY_INFO_MARKER
  );
}

function appendTextSegment(
  segments: OrgAgentCompanyInfoSegment[],
  lines: string[]
) {
  const text = cleanRenderedText(lines.join("\n"));
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.kind === "text") {
    previous.text = cleanRenderedText(`${previous.text}\n\n${text}`);
    return;
  }
  segments.push({ kind: "text", text });
}

/**
 * Splits the company-side LLM's private company-information marker from the
 * surrounding prose without losing its intended render position. Only a
 * standalone marker line is recognized so normal prose and code samples remain
 * untouched. The legacy single-bracket marker remains readable for persisted
 * messages.
 */
export function splitOrgAgentCompanyInfoMarker(
  message: string
): OrgAgentCompanyInfoSegment[] {
  const source = String(message ?? "");
  const segments: OrgAgentCompanyInfoSegment[] = [];
  let textLines: string[] = [];
  let companyInfoAdded = false;
  let fenced = false;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      textLines.push(line);
      continue;
    }
    if (!fenced && isCompanyInfoMarkerLine(line)) {
      appendTextSegment(segments, textLines);
      textLines = [];
      if (!companyInfoAdded) {
        segments.push({ kind: "company_info" });
        companyInfoAdded = true;
      }
      continue;
    }
    textLines.push(line);
  }
  appendTextSegment(segments, textLines);
  return segments;
}

/**
 * Strips the private marker for surfaces such as Slack that render their own
 * company-information action separately.
 */
export function parseOrgAgentCompanyInfoMarker(message: string): {
  hasCompanyInfo: boolean;
  text: string;
} {
  const segments = splitOrgAgentCompanyInfoMarker(message);
  return {
    hasCompanyInfo: segments.some((segment) => segment.kind === "company_info"),
    text: cleanRenderedText(
      segments
        .filter(
          (
            segment
          ): segment is Extract<OrgAgentCompanyInfoSegment, { kind: "text" }> =>
            segment.kind === "text"
        )
        .map((segment) => segment.text)
        .join("\n\n")
    ),
  };
}

/**
 * Keeps the company-information acknowledgement deterministic when a model
 * correctly rewrites a description from the canonical company document but
 * forgets to emit the private rendering marker requested by the prompt.
 */
export function ensureOrgAgentCompanyInfoMarker(message: string) {
  const source = String(message ?? "").trim();
  if (!source || parseOrgAgentCompanyInfoMarker(source).hasCompanyInfo) {
    return source;
  }
  return `${source}\n\n${ORG_AGENT_COMPANY_INFO_MARKER}`;
}

/**
 * Removes private rendering markers from candidate-visible persisted copy.
 * Unlike the reply parser, this deliberately strips inline and fenced
 * occurrences too: the token is never meaningful inside a saved description.
 */
export function stripOrgAgentCompanyInfoMarker(message: string) {
  return cleanRenderedText(
    String(message ?? "").replace(
      /[ \t]*(?:\[\[company_info\]\]|\[company_info\])[ \t]*/g,
      " "
    )
  );
}

/**
 * Replaces the private marker with one compact, inline Slack link at the
 * model-selected position. This keeps company context visible without adding
 * a separate Block Kit card that interrupts the role-creation conversation.
 */
export function renderOrgAgentCompanyInfoSlackLink(
  message: string,
  companyInfoUrl: string
): { hasCompanyInfo: boolean; text: string } {
  const segments = splitOrgAgentCompanyInfoMarker(message);
  const url = String(companyInfoUrl ?? "").trim();
  const hasCompanyInfo = segments.some(
    (segment) => segment.kind === "company_info"
  );
  return {
    hasCompanyInfo,
    text: cleanRenderedText(
      segments
        .flatMap((segment) => {
          if (segment.kind === "text") return [segment.text];
          return url ? [`<${url}|회사 정보>를 작성에 참고했어요.`] : [];
        })
        .join("\n\n")
    ),
  };
}
