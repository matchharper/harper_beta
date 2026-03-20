export type ScholarProfilePreview = {
  scholarProfileId: string;
  affiliation: string | null;
  topics: string | null;
  hIndex: number | null;
  paperCount: number;
  citationCount: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, value));
}

export function formatScholarPaperCount(count: number) {
  return `${formatCount(count)} papers`;
}

export function formatScholarCitationCount(count: number) {
  return `${formatCount(count)} citations`;
}

export function buildScholarResearchTooltip(
  preview?: ScholarProfilePreview | null
) {
  if (!preview) return "Scholar research signals unavailable";

  const lines = [
    preview.affiliation ? `Affiliation: ${preview.affiliation}` : "",
    preview.topics ? `Topics: ${preview.topics}` : "",
    `Papers: ${formatCount(preview.paperCount)}`,
    `Citations: ${formatCount(preview.citationCount)}`,
    preview.hIndex != null ? `h-index: ${formatCount(preview.hIndex)}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}
