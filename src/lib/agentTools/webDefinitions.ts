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
          maximum: 10,
          default: 10,
          description: "Maximum number of results to inspect.",
        },
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
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

