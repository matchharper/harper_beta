import { externalSearchPlanSchema as plan } from "./searchPlan";
import { executeGeneralOpportunity, generalOpportunityProperties } from "../opportunities/tool";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { SALARY_TARGET_FX_CONTEXT } from "@/lib/externalRecommendationsV2/salary";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import { readMatchingWorkNoteContext } from "../notes/context";
import {
  listMatchings,
  readMatching,
  upsertMatching,
  upsertOpportunities,
  readExternalEvaluation,
} from "./store";
import {
  requestExternalMatchingSearch,
  controlExternalMatchingSearch,
} from "./externalSearch";
const str = { type: "string" },
  companyRefs = { type: "array", items: { type: ["integer", "string"] } },
  num = { type: "integer" },
  strings = { type: "array", items: str };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  execute: (
    input: any,
    context?: TalentToolExecutionContext
  ) => Promise<unknown>
): TalentToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute,
  };
}
export const CAREER_MATCHING_TOOLS: Record<string, TalentToolDefinition> = {
  list_matchings: tool(
    "list_matchings",
    TOOL_DESCRIPTIONS.list_matchings,
    { archived: { type: "boolean" }, cursor: str, limit: num },
    [],
    async (i, c) =>
      listMatchings({
        ...i,
        ...profileToolContext(c, "list_matchings", i, { readOnly: true }),
        includeOpportunityRevisions: true,
      })
  ),
  read_matching: tool(
    "read_matching",
    TOOL_DESCRIPTIONS.read_matching,
    {
      matchingId: str,
      section: { ...str, enum: ["history", "pool"], description: "history: the matching's search, page-read and research receipts. pool: every option evaluated for this matching, numbered, highest weighted score first. Omit for the overview." },
      historyCursor: { ...str, description: "For section=history, use the previous page's last operation ID." },
      cursor: { ...str, description: "Membership page: exact nextCursor from read_matching." },
      evaluationCursor: { ...str, description: "Evaluation page: exact evaluationCursor from read_matching, when present." },
      runCursor: { ...str, description: "Run history page: exact nextRunCursor from read_matching." },
      limit: num,
      runId: str,
    },
    ["matchingId"],
    async (i, c) => {
      const owner = profileToolContext(c, "read_matching", i, { readOnly: true });
      if (i.section === "history") {
        const { readMatchingResearchActivity } = await import("./researchActivity");
        return readMatchingResearchActivity({ ...owner, matchingId: i.matchingId, before: i.historyCursor, limit: i.limit });
      }
      const { readPoolPage, readPoolSummary } = await import("./poolRead");
      if (i.section === "pool" || i.section === "evaluations")
        return readPoolPage(owner.admin, { userId: owner.userId, matchingId: i.matchingId, cursor: i.cursor, limit: i.limit });
      const overview = readMatching({ ...i, ...owner });
      if (i.cursor || i.evaluationCursor || i.runCursor || i.runId) return overview;
      const [result, workNote, poolSummary] = await Promise.all([
        overview,
        readMatchingWorkNoteContext(owner, i.matchingId, { exploration: false })
          .catch((error: unknown) => `The work note could not be read: ${error instanceof Error ? error.message : String(error)}`),
        readPoolSummary(owner.admin, { userId: owner.userId, matchingId: i.matchingId }).catch(() => undefined),
      ]);
      // The pool is listed on request; listing it here steers a new search toward what was already seen.
      return { ...result, evaluations: [], evaluationsOmitted: true, evaluationCursor: null, ...(poolSummary ? { poolSummary } : {}),
        workNote, workNoteMatchingId: i.matchingId };
    }
  ),
  upsert_matching: tool(
    "upsert_matching",
    TOOL_DESCRIPTIONS.upsert_matching,
    {
      action: {
        type: "string",
        enum: ["create", "update", "archive", "restore"],
      },
      matchingId: str,
      expectedRevision: num,
      title: str,
      description: str,
      criteria: {
        type: "object",
        properties: {
          brief: {
            type: "array",
            items: {
              type: "object",
              properties: { ref: num, label: str, content: str },
              required: ["label", "content"],
            },
          },
          scope: str,
        },
        required: ["brief"],
      },
      previousMatchingId: str,
    },
    ["action"],
    async (i, c) => {
      const owner = profileToolContext(c, "upsert_matching", i);
      return upsertMatching({ ...i, ...owner });
    }
  ),
  search_opportunities: tool(
    "search_opportunities",
    TOOL_DESCRIPTIONS.search_opportunities,
    {
      action: { type: "string", enum: ["search", "read", "resume", "cancel"], description: "search starts a search from postings, companies and/or named; read/resume/cancel take the runId of a search." },
      runId: { ...str, description: "Exact search runId for read/resume/cancel; a matchingId is a different identifier." },
      matchingId: { ...str, description: "Matching whose saved criteria evaluate the options. Omit to evaluate against the current Search Brief; options are still numbered in the matching this request works on." },
      postings: {
        type: "object",
        description: "Public postings and hiring posts by title.",
        properties: { ...plan.properties, at: { ...companyRefs, description: "Only postings at these companies (option numbers, company IDs or names)." } },
        required: ["roleTitles", "countries"],
        additionalProperties: false,
      },
      companies: {
        type: "object",
        description: "Companies themselves as opportunities, whether or not they post a fitting role.",
        properties: {
          about: { ...str, description: "What the company does or the kind of team, in plain words." },
          like: { ...companyRefs, description: "Companies like these (option numbers, company IDs or names)." },
          size: { type: "string", enum: ["startup", "scaleup", "large"], description: "startup: up to 50 people; scaleup: 51–1000; large: over 1000." },
          places: { type: "array", items: str, description: "Places as written on LinkedIn, e.g. Seoul, South Korea; San Francisco." },
        },
        additionalProperties: false,
      },
      named: { type: "array", items: str, description: "Companies by name, official website or LinkedIn company page. A company's own site address or LinkedIn company page that Harper does not know yet adds the company; a page on a site, such as an article, does not." },
      roleIds: { ...strings, description: "Exact role IDs to evaluate." },
      evaluationLimit: num,
      targetSalaryKrw: {
        type: ["number", "null"],
        description: `Annual pre-tax base salary benchmark in KRW, inferred from the candidate's career and local hiring market or explicitly requested by the candidate. A soft ranking signal for posting searches. ${SALARY_TARGET_FX_CONTEXT}`,
      },
      profileId: str,
      profileRevision: num,
      cursor: str,
      limit: num,
    },
    ["action"],
    async (i, c) => {
      // Older tool calls included a source discriminator; Harper-connected roles have their own tools.
      if (i.source !== undefined && i.source !== "external")
        throw new Error("search_opportunities reads external opportunities. Harper-connected roles are read with read_recommended_opportunities.");
      const action = i.action ?? (i.runId ? "read" : "search");
      if (!["search", "read", "resume", "cancel"].includes(action))
        throw new Error("action must be search, read, resume or cancel.");
      if (action !== "search" && !i.runId)
        throw new Error(`${action} requires the runId returned by search_opportunities.`);
      if (action === "search" && i.runId)
        throw new Error("Use read or resume with an existing runId.");
      // A search reads these as objects; text would be read as string properties (e.g. String.prototype.at).
      if (action === "search") for (const field of ["postings", "companies"] as const)
        if (i[field] != null && (typeof i[field] !== "object" || Array.isArray(i[field])))
          throw new Error(`${field} must be an object, not ${typeof i[field] === "string" ? "text" : typeof i[field]}. Top-level arguments stay outside it.`);
      const args = profileToolContext(c, "search_opportunities", i, {
        readOnly: Boolean(i.runId && action !== "resume" && action !== "cancel"),
      });
      const { renderSearch } = await import("./searchOutput");
      if (i.runId) {
        if (action === "resume" || action === "cancel") {
          const controlled = await controlExternalMatchingSearch({
            ...args, runId: i.runId, action, signal: c?.abortSignal, deadlineAt: c?.deadlineAt,
          });
          return action === "cancel" ? controlled : renderSearch(args.admin, { userId: args.userId, runId: i.runId, poolMatchingId: c?.researchMatchingId, cursor: i.cursor, limit: i.limit, fallback: controlled });
        }
        return renderSearch(args.admin, { userId: args.userId, runId: i.runId, poolMatchingId: c?.researchMatchingId, cursor: i.cursor, limit: i.limit });
      }
      const poolMatchingId = i.matchingId ?? c?.researchMatchingId;
      const { resolveCompanyRefs, resolveNamed } = await import("./searchRoutes");
      const { searchCompaniesByText, similarCompanies, indexCompanies } = await import("../companies/discovery");
      const notes: string[] = [];
      const angles: Record<string, string[]> = {};
      const addCompanies = (ids: string[], angle: string) => ids.forEach(id => { angles[id] = [...new Set([...(angles[id] ?? []), angle])]; });
      const { at, ...retrievalPlan } = (i.postings ?? {}) as Record<string, unknown>;
      const atCompanies = at ? await resolveCompanyRefs(args.admin, poolMatchingId, at as unknown[]) : undefined;
      if (atCompanies) notes.push(...atCompanies.notes);
      const companies = i.companies ?? {};
      const [byText, byLike, byName] = await Promise.all([
        companies.about ? searchCompaniesByText(args.admin, companies.about, { places: companies.places, size: companies.size,
          limit: Math.min(i.evaluationLimit ?? 150, 1200), signal: c?.abortSignal }) : Promise.resolve([] as string[]),
        companies.like?.length ? resolveCompanyRefs(args.admin, poolMatchingId, companies.like).then(async seeds => {
          notes.push(...seeds.notes);
          return seeds.ids.length ? similarCompanies(args.admin, seeds.ids, { places: companies.places, size: companies.size, limit: 60 }) : [];
        }) : Promise.resolve([] as string[]),
        i.named?.length ? resolveNamed(args.admin, i.named) : Promise.resolve(undefined),
      ]);
      addCompanies(byText, "about");
      addCompanies(byLike, "like");
      if (byName) {
        notes.push(...byName.notes);
        // Whether the web still turns up companies Harper does not know is the fact for deciding to keep looking there.
        if (byName.ids.length) notes.push(`Named companies: ${byName.ids.length}; already in Harper's company directory: ${byName.ids.length - byName.registered.length}; added now: ${byName.registered.length}.`);
        addCompanies(byName.ids, "named");
        // Every named company gets its public overview and hiring signals before it is judged, in parallel.
        // What is not ready within the budget is judged with what exists and finishes in the background;
        // the search waits for it again after judging (externalSearch) and the next search uses it.
        if (byName.ids.length) {
          const { prepareCompanies, NAMED_COMPANY_PREPARATION_BUDGET_MS } = await import("../companies/fill");
          await prepareCompanies({ admin: args.admin, userId: args.userId }, byName.ids,
            { budgetMs: NAMED_COMPANY_PREPARATION_BUDGET_MS, signal: c?.abortSignal });
          // A company added from the web enters company search with what was prepared for it.
          if (byName.registered.length) await indexCompanies(args.admin, { ids: byName.registered }).catch(() => undefined);
        }
      }
      const companyCandidateIds = Object.keys(angles);
      const hasPostings = Boolean(i.postings);
      if (!hasPostings && !i.roleIds?.length && !companyCandidateIds.length)
        throw new Error(`${notes.join("; ") || "Nothing to evaluate"}. A search needs postings, companies, named companies or roleIds.`);
      const found = await requestExternalMatchingSearch({
        ...args,
        matchingId: i.matchingId,
        roleIds: i.roleIds,
        companyWorkspaceIds: atCompanies?.ids.length ? atCompanies.ids : undefined,
        ...(companyCandidateIds.length ? { companyCandidateIds, angles } : {}),
        titleHint: companies.about,
        kinds: hasPostings || i.roleIds?.length ? ["postings", "hiring_posts"] : undefined,
        plan: hasPostings ? retrievalPlan as never : undefined,
        evaluationLimit: i.evaluationLimit,
        profileId: i.profileId,
        profileRevision: i.profileRevision,
        targetSalaryKrw: i.targetSalaryKrw,
        conversationId: c?.conversationId,
        replyId: c?.resumeRequestId ?? undefined,
        locale: c?.responseLocale ?? undefined,
        signal: c?.abortSignal,
        deadlineAt: c?.deadlineAt,
      });
      const runId = (found as { runId?: string }).runId;
      if (!runId) return found;
      return renderSearch(args.admin, { userId: args.userId, runId, poolMatchingId, limit: i.limit, notes, fallback: found });
    }
  ),
  upsert_opportunities: tool(
    "upsert_opportunities",
    TOOL_DESCRIPTIONS.upsert_opportunities,
    {
      opportunityRef: generalOpportunityProperties.opportunityRef,
      labels: generalOpportunityProperties.labels,
      cursor: generalOpportunityProperties.cursor,
      limit: generalOpportunityProperties.limit,
      action: {
        type: "string",
        enum: ["add", "archive", "restore", "replace", "reset", "set_stage", "read"],
        description: "add publishes new Role or company opportunities and updates the explanation/order of items already in the list, in one call. archive/restore changes visibility; replace/reset changes the complete set and requires expectedRevision. read reads an opportunity reference returned by a list write.",
      },
      matchingId: { ...str, description: "Exact ID of the opportunity list to change. Omit to add to the matching this request is working on (or the default list when none), or with allLists." },
      allLists: { type: "boolean", description: "Target all opportunity lists for reset or archive." },
      expectedRevision: { ...str, description: "Opportunity list expectedRevision from the same target in list_matchings or read_matching. Required only for replace/reset. Optional for targeted changes; when supplied, it must match. Omit for add/restore unless the change depends on a particular list snapshot." },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            candidate: { type: "integer", description: "Option number from this matching's searches (a role or a company)." },
            recommendationId: { ...str, description: "Exact existing recommendation ID. Every item needs this, candidate, roleId or companyWorkspaceId." },
            roleId: { ...str, format: "uuid", description: "Exact roleId of a posting or hiring post returned by search/read." },
            companyWorkspaceId: { ...str, format: "uuid", description: "Exact company_workspace_id when the company itself is the recommendation." },
            explanation: str,
            rank: num,
            savedStage: { type: "string", enum: ["saved", "applied", "connected", "offer", "closed", "hidden"], description: "For set_stage: organize an existing saved opportunity using its actual progress. This records state; it does not submit or contact anyone." },
          },
          additionalProperties: false,
        },
      },
    },
    ["action"],
    async (i, c) => {
      if (i.action === "read") return executeGeneralOpportunity(i, c);
      // Option numbers name the role or company they were found as.
      const numbers = (Array.isArray(i.items) ? i.items : []).flatMap((item: any) => typeof item?.candidate === "number" ? [item.candidate] : []);
      if (numbers.length) {
        const { resolvePoolNumbers } = await import("./candidatePool");
        const options = await resolvePoolNumbers(profileToolContext(c, "upsert_opportunities", i).admin, i.matchingId ?? c?.researchMatchingId, numbers);
        i = { ...i, items: i.items.map(({ candidate, ...item }: any) => candidate === undefined ? item : {
          ...item, ...(options.get(candidate)?.roleId ? { roleId: options.get(candidate)!.roleId } : { companyWorkspaceId: options.get(candidate)!.companyWorkspaceId }),
        }) };
      }
      const written = await upsertOpportunities({
        ...i,
        // New recommendations made while working on a matching join its list.
        matchingId: i.matchingId ?? (i.action === "add" && !i.allLists ? c?.researchMatchingId : undefined),
        ...profileToolContext(c, "upsert_opportunities", i),
        backgroundRunId: c?.backgroundInvocation?.runId,
        returnRoleIds: c?.backgroundInvocation?.scheduledWork,
        signal: c?.abortSignal,
        alreadyRead: c?.companiesRead?.(),
      });
      // The search behind a recommendation is part of what makes it worth acting on.
      const work = ["add", "replace"].includes(i.action) ? c?.searchWorkSummary?.() : undefined;
      return work && written && typeof written === "object" ? { ...written, searchWork: work } : written;
    }
  ),
};
