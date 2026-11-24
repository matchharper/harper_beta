import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";

export const WEB_SEARCH_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      TOOL_DESCRIPTIONS.web_search,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact search query to run on the web.",
        },
        structured_text: {
          type: "string",
          description: "Describe the text answer to synthesize from the search results.",
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 10,
          description: "Maximum number of results to inspect.",
        },
        startPublishedDate: { type: "string", description: "Earliest publication date (ISO). Not available with company or people categories." },
        endPublishedDate: { type: "string", description: "Latest publication date (ISO). Publication time is different from fetch time. Not available with company or people categories." },
        includeDomains: { type: "array", items: { type: "string" } },
        excludeDomains: { type: "array", items: { type: "string" } },
        category: {
          type: "string",
          enum: ["company", "publication", "news", "personal site", "financial report", "people"],
          description: "company and people search the provider's dedicated indexes of company and person profiles, which support semantic search only: both reject published-date filters, and people also rejects excludeDomains.",
        },
        mode: { type: "string", enum: ["auto", "fast", "deep", "deep-reasoning"], description: "Provider search mode. Deeper search has its own latency and cost." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const OPEN_URL_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "open_url",
    description:
      TOOL_DESCRIPTIONS.open_url,
    parameters: {
      type: "object",
      properties: {
        url: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" }, minItems: 1 },
          ],
          description: "One exact http(s) URL, or a list of independent URLs to read together. Each page returns its own content or error.",
        },
        maxMarkdownChars: {
          type: "integer",
          minimum: 1000,
          maximum: 40000,
          default: 20000,
          description:
            "Optional maximum markdown characters returned to the model.",
        },
        offset: { type: "integer", minimum: 0, description: "Character offset for continuing the same long source; use the returned nextOffset." },
        find: { type: "string", description: "Return only the paragraphs containing these words (alternatives separated by |), with their character offsets, instead of the page text." },
        maxAgeHours: { type: "integer", minimum: -1, maximum: 720, description: "Provider cache freshness request. 0 requests live content, -1 uses cache, omitted reuses saved public evidence. A successful fallback may still be older; inspect the receipt." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

