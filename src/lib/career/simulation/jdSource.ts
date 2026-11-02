import { formatPromptText } from "@/lib/llm/promptText";
import { applicationFormText } from "./applicationFormText";

// Uses the same reader as open_url, without exposing arbitrary web tools to the session.
export async function readSimulationJdSource(
  url: unknown,
  readUrl: (url: string) => Promise<{
    markdown: string;
    title: string;
    url: string;
    cached: boolean;
  }>
) {
  if (typeof url !== "string" || !url.trim())
    return {
      status: "unavailable",
      reason:
        "No JD URL is saved. Additional submission requirements cannot be confirmed from the live page.",
    };
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Invalid URL");
    const result = await readUrl(url);
    if (!result.markdown.trim()) throw new Error("Empty JD page");
    return {
      status: "read",
      url: result.url,
      title: result.title,
      markdown: result.markdown,
      cached: result.cached,
    };
  } catch {
    return {
      status: "unavailable",
      url,
      reason:
        "The JD page could not be read. Use saved requirements only; do not infer that additional materials are absent.",
    };
  }
}

// Saved JD is authoritative for role analysis; the live form is independent evidence.
export async function buildSimulationRoleInput(
  roleName: string,
  jdPage: Awaited<ReturnType<typeof readSimulationJdSource>>,
  loadSavedRole: () => Promise<Record<string, unknown>>,
  applicationForm?: import("./applicationForm").ApplicationForm
) {
  const savedRole = await loadSavedRole();
  const hasSavedJd = typeof savedRole.description === "string" && savedRole.description.trim();
  if (!hasSavedJd && jdPage.status !== "read")
    throw new Error("Neither the JD page nor the saved role description is readable.");
  const company = savedRole.company && typeof savedRole.company === "object"
    ? savedRole.company as Record<string, unknown>
    : {};
  const teamSize = company.employeeCountRange;
  const teamRange = teamSize && typeof teamSize === "object" && !Array.isArray(teamSize)
    ? teamSize as Record<string, unknown>
    : null;
  const detail = (label: string, value: unknown) =>
    value !== null && value !== undefined && value !== ""
      ? `${label}: ${formatPromptText(value)}`
      : "";
  const roleFacts = [
    detail("Role reference", savedRole.roleId),
    detail("Title", savedRole.name),
    detail("Company", typeof savedRole.company === "string" ? savedRole.company : company.name),
    detail("Location", savedRole.location),
    detail("Work arrangement", savedRole.workMode),
    detail("Seniority", savedRole.seniority),
    detail("Compensation", savedRole.compensation),
    detail("Posting URL", savedRole.externalJdUrl),
  ].filter(Boolean).join("\n");
  const companyFacts = [
    detail("Headquarters", company.hqLocation),
    detail("Founded", company.foundedYear),
    detail("Team size", teamRange && ("start" in teamRange || "end" in teamRange)
      ? `${teamRange.start ?? "unknown"}–${teamRange.end ?? "unknown"}`
      : teamSize),
    savedRole.companyDescription,
    company.shortDescription,
    company.description,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join("\n\n");
  return [
    `## Target role: ${roleName}`,
    roleFacts,
    companyFacts && `## Company context\n\n${companyFacts}`,
    hasSavedJd
      ? `## Saved job description\n\n${savedRole.description}`
      : [
          "## Job description from the posting",
          detail("Source", jdPage.url),
          detail("Page title", jdPage.title),
          jdPage.markdown,
        ].filter(Boolean).join("\n\n"),
    applicationForm && `## Observed application requirements\n\n${applicationFormText(applicationForm)}`,
  ].filter(Boolean).join("\n\n");
}
