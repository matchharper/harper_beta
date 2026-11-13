import Ajv from "ajv";
import { countriesSchema, countryCodes, type V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";

const str = { type: "string" };
const strings = { type: "array", items: str };

export const externalSearchPlanSchema = {
  type: "object",
  description: "Retrieval conditions as an object. Choose conditions from the current request and Search Brief. Countries are keyed by ISO country code; each country has one weight and remote-work condition.",
  properties: {
    searchIntentSummary: str,
    roleTitles: { ...strings, minItems: 1, description: "Job titles to retrieve. Required for a new search unless exact roleIds are supplied." },
    ftsKeywords: {
      type: "array",
      items: {
        type: "object",
        properties: { terms: strings, weight: { type: "number" } },
        required: ["terms", "weight"],
      },
    },
    countries: {
      type: "object",
      minProperties: 1,
      propertyNames: { enum: countryCodes },
      description: "Map of ISO country codes to search conditions, for example KR: {weight: 1, remoteOnly: false}. With includeRemote=true, remoteOnly=false includes both office and remote postings in that country. Countries filter posting location, not work authorization.",
      additionalProperties: {
        type: "object",
        properties: {
          weight: { type: "number", exclusiveMinimum: 0 },
          remoteOnly: { type: "boolean" },
        },
        required: ["weight", "remoteOnly"],
      },
    },
    includeContract: { type: "boolean" },
    includeParttime: { type: "boolean" },
    includeIntern: { type: "boolean" },
    includeRemote: { type: "boolean" },
    remoteOnly: { type: "boolean" },
    isPreferEntry: { type: "integer", enum: [-1, 0, 1] },
    postingRecency: {
      type: ["object", "null"],
      properties: {
        maxAgeDays: { type: ["number", "null"] },
        recentDays: { type: ["number", "null"] },
        recentWeight: { type: ["number", "null"] },
        olderWeight: { type: ["number", "null"] },
      },
    },
  },
  required: [
    "roleTitles",
    "countries",
    "includeContract",
    "includeParttime",
    "includeIntern",
    "includeRemote",
    "remoteOnly",
  ],
};

// One machine-consumed contract serves both the tool provider and its executor.
const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(
  externalSearchPlanSchema
);
export function parseExternalSearchPlan(value: unknown): V2SearchPlan {
  // Persisted/in-flight plans used an array before the keyed tool contract.
  // Preserve their exact country conditions; do not merge conflicting entries.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    if (Array.isArray(input.countries)) {
      value = { ...input, countries: Object.fromEntries(countriesSchema.parse(input.countries)
        .map(({ countryCode, ...conditions }) => [countryCode, conditions])) };
    }
  }
  if (!validate(value)) {
    const details = validate.errors
      ?.map(
        (error) =>
          `${error.instancePath || "plan"} ${error.message}${error.keyword === "required" ? `: ${error.params.missingProperty}` : ""}`
      )
      .join("; ");
    throw new Error(
      `Invalid search plan: ${details}. Supply the declared retrieval fields directly to search_opportunities.`
    );
  }
  const input = value as Record<string, any>;
  return {
    ...input,
    searchIntentSummary: input.searchIntentSummary ?? "",
    ftsKeywords: input.ftsKeywords ?? [],
    isPreferEntry: input.isPreferEntry ?? 0,
    postingRecency: input.postingRecency ? {
      maxAgeDays: null, recentDays: null, recentWeight: null, olderWeight: null,
      ...input.postingRecency,
    } : null,
    countries: Object.entries(input.countries).map(([countryCode, conditions]) => ({ countryCode, ...(conditions as { weight: number; remoteOnly: boolean }) })),
  } as V2SearchPlan;
}
