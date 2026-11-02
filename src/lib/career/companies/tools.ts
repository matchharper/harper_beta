import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { createHash } from "node:crypto";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  searchCareerCompanies,
  listCareerCompanyFollows,
  writeCareerCompanyFollow,
  formatCompanySearch,
  formatCompanyFollows,
  COMPANY_FOLLOW_COVERAGE,
} from "./server";
const base = (context: TalentToolExecutionContext | undefined) => {
  if (!context?.admin || !context.userId)
    throw new Error("Authenticated Career user required.");
  return {
    admin: context.admin as TalentAdminClient,
    userId: context.userId,
    conversationId: context.conversationId,
  };
};
export const CAREER_COMPANY_TOOLS: Record<string, TalentToolDefinition> = {
  search_companies: {
    name: "search_companies",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.search_companies,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const result = await searchCareerCompanies({
        ...base(context),
        query: String(input.query),
        offset: input.offset as number | undefined,
      });
      return {
        ...result,
        modelOutput: formatCompanySearch(result.companies, result.nextOffset),
      };
    },
  },
  follow_company: {
    name: "follow_company",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.follow_company(COMPANY_FOLLOW_COVERAGE),
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "read", "follow", "update", "unfollow"],
        },
        include_unfollowed: {
          type: "boolean",
          description:
            "For list: include previously unfollowed companies. Defaults to false.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description:
            "For list/read: pagination offset from the previous result.",
        },
        follow_id: { type: "string" },
        expected_revision: { type: "integer" },
        scope: { type: "string", enum: ["company", "workspace"] },
        company_db_id: { type: "integer" },
        company_workspace_id: { type: "string" },
        instruction: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    async execute(input, context) {
      if (input.action === "read") {
        const { readFollowInventory } = await import("./inventory");
        const { formatFollowRoles } = await import("./preparation");
        const { readHiringNews, formatHiringNews } =
          await import("./hiringNews");
        const args = base(context);
        const inventory = await readFollowInventory(args.admin, args.userId);
        const company = inventory.companies.find(
          (item) => item.id === input.follow_id
        );
        if (!company) throw new Error("Active followed company unavailable.");
        const all = inventory.roles.filter((role) =>
          role.followIds.includes(company.id)
        );
        const offset = Number(input.offset ?? 0),
          roles = all.slice(offset, offset + 30);
        const nextOffset = offset + 30 < all.length ? offset + 30 : null;
        const news = await readHiringNews(args.admin, company);
        return {
          company,
          roles,
          nextOffset,
          news,
          modelOutput: [
            COMPANY_FOLLOW_COVERAGE,
            `${company.name}; follow ${company.id}; instruction: ${company.instruction || "none"}`,
            formatFollowRoles(roles),
            formatHiringNews(news),
            nextOffset === null
              ? "End of current roles."
              : `More roles: follow_company action=read follow_id=${company.id} offset=${nextOffset}`,
          ].join("\n\n"),
        };
      }
      if (input.action === "list") {
        const result = await listCareerCompanyFollows({
          ...base(context),
          includeUnfollowed: input.include_unfollowed === true,
          offset: input.offset as number | undefined,
        });
        return {
          ...result,
          modelOutput: formatCompanyFollows(result.follows, result.nextOffset),
        };
      }
      const requestId = `${context?.resumeRequestId ?? context?.userMessageId ?? context?.toolCallId}:follow:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
      const follow = await writeCareerCompanyFollow({
        ...base(context),
        requestId,
        input,
      });
      return {
        follow,
        modelOutput: follow.id
          ? formatCompanyFollows([follow])
          : "This company scope is not followed.",
      };
    },
  },
};
