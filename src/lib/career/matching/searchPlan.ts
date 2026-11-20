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
      description: "Map of ISO country codes to search conditions, for example KR: {weight: 1}. Each country's remoteOnly is optional and defaults to false, allowing both office and remote postings unless restricted by the global remote flags. Countries filter posting location, not work authorization.",
      additionalProperties: {
        type: "object",
        properties: {
          weight: { type: "number", exclusiveMinimum: 0 },
          remoteOnly: { type: "boolean", default: false, description: "Require remote work in this country. Defaults to false." },
        },
        required: ["weight"],
      },
    },
    includeContract: { type: "boolean", default: false, description: "Include contract roles alongside full-time roles. Defaults to false." },
    includeParttime: { type: "boolean", default: false, description: "Include part-time roles alongside full-time roles. Defaults to false." },
    includeIntern: { type: "boolean", default: false, description: "Include internships alongside full-time roles. Defaults to false." },
    includeRemote: { type: "boolean", default: true, description: "Allow remote roles alongside onsite and hybrid roles. Defaults to true." },
    remoteOnly: { type: "boolean", default: false, description: "Require remote work in every country. Defaults to false." },
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
      `Invalid search plan: ${details}. The retrieval plan requires roleTitles and countries keyed by ISO country code.`
    );
  }
  const input = value as Record<string, any>;
  return {
    ...input,
    includeContract: input.includeContract ?? false,
    includeParttime: input.includeParttime ?? false,
    includeIntern: input.includeIntern ?? false,
    includeRemote: input.includeRemote ?? true,
    remoteOnly: input.remoteOnly ?? false,
    searchIntentSummary: input.searchIntentSummary ?? "",
    ftsKeywords: input.ftsKeywords ?? [],
    isPreferEntry: input.isPreferEntry ?? 0,
    postingRecency: input.postingRecency ? {
      maxAgeDays: null, recentDays: null, recentWeight: null, olderWeight: null,
      ...input.postingRecency,
    } : null,
    countries: Object.entries(input.countries as Record<string, { weight: number; remoteOnly?: boolean }>)
      .map(([countryCode, conditions]) => ({ countryCode, ...conditions, remoteOnly: conditions.remoteOnly ?? false })),
  } as V2SearchPlan;
}
