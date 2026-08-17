export const OPPORTUNITY_RUN_MARKER_LABEL = "opportunity_run";

export type OpportunityRunMarkerRelation =
  | "accepted"
  | "same_request"
  | "blocking_other_request";

export type OpportunityRunMarker = {
  relation: OpportunityRunMarkerRelation;
  runId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPPORTUNITY_RUN_MARKER_PATTERN =
  /\[opportunity_run\]\((\/career\?[^)\s]+)\)/i;
const ANY_OPPORTUNITY_RUN_LINK_PATTERN = /\[opportunity_run\]\([^\r\n)]*\)/gi;
const STANDALONE_OPPORTUNITY_RUN_MARKER_LINE_PATTERN =
  /^\s*(?:[-*+]\s+|\d+[.)]\s*)?\[opportunity_run\]\(\/career\?[^)]+\)\s*$/i;

function normalizeRelation(
  value: string | null
): OpportunityRunMarkerRelation | null {
  if (!value) return "accepted";
  return value === "accepted" ||
    value === "same_request" ||
    value === "blocking_other_request"
    ? value
    : null;
}

function parseMarkerHref(href: string): OpportunityRunMarker | null {
  try {
    const url = new URL(href, "https://career.harper.example");
    if (url.pathname !== "/career") return null;
    const runId = url.searchParams.get("opportunityRunId")?.trim() ?? "";
    const relation = normalizeRelation(url.searchParams.get("relation"));
    if (!UUID_PATTERN.test(runId) || !relation) return null;
    return { relation, runId: runId.toLowerCase() };
  } catch {
    return null;
  }
}

export function createOpportunityRunMarker(
  runId: string,
  relation: OpportunityRunMarkerRelation = "accepted"
) {
  const normalizedRunId = String(runId ?? "")
    .trim()
    .toLowerCase();
  if (!UUID_PATTERN.test(normalizedRunId)) {
    throw new Error("A valid opportunity discovery run ID is required.");
  }
  return `[${OPPORTUNITY_RUN_MARKER_LABEL}](/career?opportunityRunId=${normalizedRunId}&relation=${relation})`;
}

export function extractOpportunityRunMarkers(content: string) {
  const markers: OpportunityRunMarker[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!STANDALONE_OPPORTUNITY_RUN_MARKER_LINE_PATTERN.test(line)) continue;
    const match = OPPORTUNITY_RUN_MARKER_PATTERN.exec(line);
    if (!match) continue;
    const marker = parseMarkerHref(match[1]);
    if (!marker) continue;
    const key = `${marker.runId}:${marker.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push(marker);
  }

  return markers;
}

export function stripOpportunityRunMarkers(content: string) {
  const withoutCompleteLinks = content.replace(
    ANY_OPPORTUNITY_RUN_LINK_PATTERN,
    ""
  );
  const incompleteMarkerIndex = withoutCompleteLinks
    .toLowerCase()
    .indexOf(`[${OPPORTUNITY_RUN_MARKER_LABEL}`);
  const visibleContent =
    incompleteMarkerIndex >= 0
      ? withoutCompleteLinks.slice(0, incompleteMarkerIndex)
      : withoutCompleteLinks;

  return visibleContent
    .split(/\r?\n/)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ensureOpportunityRunMarker(
  content: string,
  marker: { relation: OpportunityRunMarkerRelation; runId: string }
) {
  const visibleContent = stripOpportunityRunMarkers(content);
  const canonicalMarker = createOpportunityRunMarker(
    marker.runId,
    marker.relation
  );
  return [visibleContent, canonicalMarker].filter(Boolean).join("\n\n");
}
