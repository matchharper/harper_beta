/** The writer consumes these arrays; unrelated or truncated JSON is not a profile. */
export function parseProfileSourceJson(
  raw: string
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    if (
      !Array.isArray(parsed.experiences ?? parsed.talentExperiences) ||
      !Array.isArray(parsed.educations ?? parsed.talentEducations)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}
