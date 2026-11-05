import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import { RESUME_HANDBOOK_V1 } from "./resume";
import { APPLICATION_HANDBOOK } from "./application";
import { OPPORTUNITY_SEARCH_HANDBOOK } from "./opportunitySearch";
import { PROACTIVE_CAREER_HANDBOOK } from "./proactiveCareer";

export const CAREER_HANDBOOK_LOADER = "load_handbook";
export const CAREER_HANDBOOK_REPLIES = 3;
export const CAREER_HANDBOOKS = [
  { id: "resume", version: "2026-11-03-v3", description: "Read and improve a resume for the user's purpose; write useful proposals and questions and save the requested document.", body: RESUME_HANDBOOK_V1 },
  { id: "application", version: "2026-11-05-v5", description: "Prepare reviewable application materials, find a valid application route, and carry out the authorized application.", body: APPLICATION_HANDBOOK },
  { id: "opportunity_search", version: "2026-11-05-v13", description: "Find external career opportunities, manage matching criteria and existing recommendations, and help with internal Roles the candidate explicitly chose.", body: OPPORTUNITY_SEARCH_HANDBOOK },
  { id: "proactive_career", version: "2026-11-02-v2", description: "Continue delegated work from a schedule or source event, choose useful contact or silence, and save the next check.", body: PROACTIVE_CAREER_HANDBOOK },
] as const;
export type CareerHandbookId = (typeof CAREER_HANDBOOKS)[number]["id"];
export type CareerHandbookLease = { id: CareerHandbookId; version: string; remainingReplies: number };

export function findCareerHandbook(id: unknown) {
  return CAREER_HANDBOOKS.find(book => book.id === id);
}
export function careerHandbookCatalog() {
  return CAREER_HANDBOOKS.map(({ id, version, description, body }) => ({ id, version, description, characters: Array.from(body).length }));
}
export function renderCareerHandbookCatalog() {
  return [
    "## Available handbooks",
    "Use load_handbook when a guide would help. Loading grants no execution permission. A guide remains for three delivered replies, including the first reply after it is supplied; tool-loop completions do not consume extra replies.",
    ...careerHandbookCatalog().map(book => `- ${book.id}: ${book.description} (${book.characters} characters; version ${book.version})`),
  ].join("\n");
}
export const careerHandbookLoaderTool: TalentChatTool = {
  type: "function",
  function: {
    name: CAREER_HANDBOOK_LOADER,
    description: TOOL_DESCRIPTIONS.load_handbook(careerHandbookCatalog()),
    parameters: {
      type: "object", additionalProperties: false,
      properties: { handbook_ids: { type: "array", items: { type: "string", enum: CAREER_HANDBOOKS.map(book => book.id) } } },
      required: ["handbook_ids"],
    },
  },
};

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
