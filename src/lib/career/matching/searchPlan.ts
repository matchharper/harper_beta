import Ajv from "ajv";
import type { V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";

const str = { type: "string" };
const strings = { type: "array", items: str };

export const externalSearchPlanSchema = {
  type: "object",
  properties: {
    searchIntentSummary: str,
    roleTitles: strings,
    ftsKeywords: {
      type: "array",
      items: {
        type: "object",
        properties: { terms: strings, weight: { type: "number" } },
        required: ["terms", "weight"],
      },
    },
    countries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          countryCode: str,
          weight: { type: "number" },
          remoteOnly: { type: "boolean" },
        },
        required: ["countryCode", "weight", "remoteOnly"],
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
        recentDays: { type: "number" },
        recentWeight: { type: "number" },
        olderWeight: { type: "number" },
      },
    },
  },
  required: [
    "searchIntentSummary",
    "roleTitles",
    "ftsKeywords",
    "countries",
    "includeContract",
    "includeParttime",
    "includeIntern",
    "includeRemote",
    "remoteOnly",
    "isPreferEntry",
    "postingRecency",
  ],
};

// One machine-consumed contract serves both the tool provider and its executor.
const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(
  externalSearchPlanSchema
);
export function parseExternalSearchPlan(value: unknown): V2SearchPlan {
  if (!validate(value)) {
    const details = validate.errors
      ?.map(
        (error) =>
          `${error.instancePath || "plan"} ${error.message}${error.keyword === "required" ? `: ${error.params.missingProperty}` : ""}`
      )
      .join("; ");
    throw new Error(
      `Invalid search plan: ${details}. Supply plan as an object with the tool's declared fields.`
    );
  }
  return value as V2SearchPlan;
}
