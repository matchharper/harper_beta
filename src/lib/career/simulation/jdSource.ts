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
  const text = JSON.stringify(savedRole);
  return JSON.stringify({
    roleName,
    savedJd: hasSavedJd ? (text.length <= 40000 ? text : text.slice(0, 40000) + "\n[Saved source truncated; omitted information is unknown.]") : undefined,
    jdPage: hasSavedJd ? undefined : jdPage,
    applicationForm,
  });
}
