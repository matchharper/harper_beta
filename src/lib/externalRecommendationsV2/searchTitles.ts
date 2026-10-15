// Preserve the former maximum five × 1,000-title recall budget in one ANN pass.
export const SEARCH_TITLE_NEIGHBOR_LIMIT = 5000;

export const SEARCH_TITLE_INSTRUCTION = `Return a compact role_titles array describing 1–5 meaningful target roles, with at most 24 strings including translations. For each relevant preferred search-country language, include a natural local-language job title alongside the English title: for example, a Korea search for AI Engineer includes both "AI Engineer" and "AI 엔지니어"; a Japan search includes the corresponding Japanese title. Choose languages from the actual search countries and user's preferences, not merely the chat language. Avoid redundant same-language synonyms, vague umbrella titles, company names, skills and locations. The application joins every returned title with comma-space into ONE text and embeds it ONCE for ONE semantic title search; the array entries are not separate searches or literal ILIKE gates.`;

export function searchTitleText(titles: string[]) {
  const text = titles
    .map((title) => title.trim())
    .filter(Boolean)
    .join(", ");
  if (!text) throw new Error("Expected nonempty search titles");
  return text;
}
