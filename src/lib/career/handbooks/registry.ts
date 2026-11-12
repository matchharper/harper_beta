import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { SALARY_TARGET_FX_CONTEXT } from "@/lib/externalRecommendationsV2/salary";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import { RESUME_HANDBOOK_V1 } from "./resume";
import { APPLICATION_HANDBOOK } from "./application";
import { OPPORTUNITY_SEARCH_HANDBOOK } from "./opportunitySearch";
import { PROACTIVE_CAREER_HANDBOOK } from "./proactiveCareer";
import { INTERNAL_RECOMMENDATION_WRITING, EXTERNAL_RECOMMENDATION_WRITING } from "./recommendationWriting";

export const CAREER_HANDBOOK_LOADER = "load_handbook";
export const CAREER_HANDBOOK_REPLIES = 3;
export const CAREER_HANDBOOKS = [
  { id: "internal_recommendation_writing", scheduledOnly: true, version: "2026-11-12-v2", description: "Explain why a Harper-connected role matters to this candidate and what accepting its introduction will do.", body: INTERNAL_RECOMMENDATION_WRITING },
  { id: "external_recommendation_writing", scheduledOnly: true, version: "2026-11-12-v2", description: "Choose useful detail for public job recommendations and explain their direct application path.", body: EXTERNAL_RECOMMENDATION_WRITING },
  { id: "resume", version: "2026-11-08-v5", description: "Create or improve a resume when writing is needed; research experience context, discover missing material and save useful, accurate documents.", body: RESUME_HANDBOOK_V1 },
  { id: "application", version: "2026-11-09-v21", description: "Explore ways into a company the candidate wants to join, including companies outside recommendations or without an open role; prepare available web applications and evidenced email or LinkedIn outreach for review, then carry out final approved actions.", body: APPLICATION_HANDBOOK },
  { id: "opportunity_search", version: "2026-11-11-v17", description: "Find external career opportunities, manage matching criteria and existing recommendations, and help with internal Roles the candidate explicitly chose.", body: `${OPPORTUNITY_SEARCH_HANDBOOK}\n\n${SALARY_TARGET_FX_CONTEXT}` },
  { id: "proactive_career", backgroundOnly: true, version: "2026-11-12-v4", description: "Continue delegated work from a schedule or source event, choose useful contact or silence, and save the next check.", body: PROACTIVE_CAREER_HANDBOOK },
] as const;
export type CareerHandbookId = (typeof CAREER_HANDBOOKS)[number]["id"];
export type CareerHandbookLease = { id: CareerHandbookId; version: string; remainingReplies: number };

export function findCareerHandbook(id: unknown) {
  return CAREER_HANDBOOKS.find(book => book.id === id);
}
export function isCareerHandbookAvailable(id: unknown, background: boolean, scheduled = false) {
  const book = findCareerHandbook(id);
  return Boolean(book && (!("backgroundOnly" in book) || background) && (!("scheduledOnly" in book) || scheduled));
}
export function careerHandbookCatalog(background = true, scheduled = false) {
  return CAREER_HANDBOOKS.filter(book => isCareerHandbookAvailable(book.id, background, scheduled)).map(({ id, version, description, body }) => ({ id, version, description, characters: Array.from(body).length }));
}
export function renderCareerHandbookCatalog(background = true, scheduled = false) {
  return [
    "## Available handbooks",
    "Use load_handbook when a guide would help. Loading grants no execution permission. A guide remains for three delivered replies, including the first reply after it is supplied; tool-loop completions do not consume extra replies.",
    ...careerHandbookCatalog(background, scheduled).map(book => `- ${book.id}: ${book.description} (${book.characters} characters; version ${book.version})`),
  ].join("\n");
}
export function careerHandbookLoaderToolFor(background = true, scheduled = false): TalentChatTool { return {
  type: "function",
  function: {
    name: CAREER_HANDBOOK_LOADER,
    description: TOOL_DESCRIPTIONS.load_handbook(careerHandbookCatalog(background, scheduled)),
    parameters: {
      type: "object", additionalProperties: false,
      properties: { handbook_ids: { type: "array", items: { type: "string", enum: careerHandbookCatalog(background, scheduled).map(book => book.id) } } },
      required: ["handbook_ids"],
    },
  },
}; }
export const careerHandbookLoaderTool = careerHandbookLoaderToolFor();

/** Keep the remaining lifetime while resolving each guide to its current source. */
export function normalizeCareerHandbookLeases(value: unknown): CareerHandbookLease[] {
  if (!Array.isArray(value)) return [];
  const leases = new Map<CareerHandbookId, CareerHandbookLease>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const book = findCareerHandbook(item.id);
    if (book && Number.isInteger(item.remainingReplies) && item.remainingReplies > 0)
      leases.set(book.id, { id: book.id, version: book.version, remainingReplies: item.remainingReplies });
  }
  return [...leases.values()];
}
