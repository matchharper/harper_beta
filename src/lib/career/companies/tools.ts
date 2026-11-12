import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { createHash } from "node:crypto";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { z } from "zod";
import { formatToolError, throwIfToolControlError } from "@/lib/llm/toolError";
const errorText = (error: unknown) =>
  formatToolError(error instanceof Error ? error.message : error);
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
const followBatchSchema = z
  .array(
    z
      .object({
        company_workspace_id: z.string().uuid().optional(),
        company_name: z.string().trim().min(1).optional(),
        instruction: z.string().optional(),
      })
      .refine(
        (company) => company.company_workspace_id || company.company_name,
        {
          message: "company_workspace_id or company_name is required.",
        }
      )
  )
  .min(1);
const followChangeBatchSchema = z
  .array(
    z.object({
      follow_id: z.string().min(1),
      expected_revision: z.number().int(),
      instruction: z.string().optional(),
    })
  )
  .min(1);
const followReadBatchSchema = z
  .array(
    z.object({
      follow_id: z.string().min(1),
      offset: z.number().int().nonnegative().optional(),
    })
  )
  .min(1);
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
        queries: { type: "array", items: { type: "string" }, minItems: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      required: ["queries"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const result = await searchCareerCompanies({
        ...base(context),
        // Previously saved tool calls may still contain the single-query input.
        queries: (input.queries ??
          (typeof input.query === "string"
            ? [input.query]
            : undefined)) as string[],
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
          description: "For list: pagination offset from the previous result.",
        },
        companies: {
          type: "array",
          minItems: 1,
          description:
            "For follow/read/update/unfollow: one entry per company. Follow uses company_workspace_id or company_name; read uses follow_id and optional offset; update/unfollow require follow_id and expected_revision.",
          items: {
            type: "object",
            properties: {
              company_workspace_id: { type: "string" },
              company_name: {
                type: "string",
                description: "Company name; sufficient without a workspace ID.",
              },
              instruction: { type: "string" },
              follow_id: { type: "string" },
              expected_revision: { type: "integer" },
              offset: { type: "integer", minimum: 0 },
            },
            additionalProperties: false,
          },
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    async execute(input, context) {
      if (input.action === "read") {
        const { readFollowInventory } = await import("./inventory");
        const { formatFollowRoles } = await import("./preparation");
        const args = base(context);
        const inventory = await readFollowInventory(args.admin, args.userId);
        const readOne = (item: { follow_id: unknown; offset?: unknown }) => {
          const company = inventory.companies.find(
            (company) => company.id === item.follow_id
          );
          if (!company) throw new Error("Active followed company unavailable.");
          const all = inventory.roles.filter((role) =>
            role.followIds.includes(company.id)
          );
          const offset = Number(item.offset ?? 0),
            roles = all.slice(offset, offset + 30);
          const nextOffset = offset + 30 < all.length ? offset + 30 : null;
          return {
            company,
            roles,
            nextOffset,
            modelOutput: [
              COMPANY_FOLLOW_COVERAGE,
              `${company.name}; follow ${company.id}; revision ${company.revision}; followed ${formatLlmDateTime(company.followedAt)} Asia/Seoul; instruction: ${company.instruction || "none"}`,
              company.scope === "name"
                ? "Followed by name; no linked directory roles."
                : "",
              formatFollowRoles(roles),
              nextOffset === null
                ? "End of external roles and existing internal recommendations."
                : `More roles: follow_company action=read companies=[{follow_id: "${company.id}", offset: ${nextOffset}}]`,
            ].join("\n\n"),
          };
        };
        if (input.companies === undefined)
          return readOne({ follow_id: input.follow_id, offset: input.offset });
        const companies = followReadBatchSchema.parse(input.companies);
        const results = companies.map((item, index) => {
          try {
            return {
              index,
              followId: item.follow_id,
              ok: true,
              ...readOne(item),
            };
          } catch (error) {
            return {
              index,
              followId: item.follow_id,
              ok: false,
              modelOutput: `Follow ${item.follow_id}: ${errorText(error)}`,
            };
          }
        });
        return {
          ok: results.every((result) => result.ok),
          results,
          modelOutput: results.map((result) => result.modelOutput).join("\n\n"),
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
      const owner = base(context);
      const requestIdentity = (item: Record<string, unknown>) =>
        `${context?.resumeRequestId ?? context?.userMessageId ?? context?.toolCallId}:follow:${createHash("sha256").update(JSON.stringify(item)).digest("hex")}`;
      if (input.companies !== undefined) {
        if (!["follow", "update", "unfollow"].includes(String(input.action)))
          throw new Error("Unsupported company action.");
        const companies = (
          input.action === "follow"
            ? followBatchSchema
            : followChangeBatchSchema
        ).parse(input.companies);
        const results = await Promise.allSettled(
          companies.map((company) => {
            const item = { action: input.action, ...company };
            return writeCareerCompanyFollow({
              ...owner,
              requestId: requestIdentity(item),
              input: item,
            });
          })
        );
        for (const result of results)
          if (result.status === "rejected")
            throwIfToolControlError(result.reason);
        const follows = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        );
        const failures = results.flatMap((result, index) =>
          result.status === "rejected"
            ? [
                {
                  ...("company_workspace_id" in companies[index]
                    ? {
                        companyWorkspaceId:
                          companies[index].company_workspace_id,
                      }
                    : {}),
                  ...("follow_id" in companies[index]
                    ? { followId: companies[index].follow_id }
                    : {}),
                  ...("company_name" in companies[index] &&
                  companies[index].company_name
                    ? { companyName: companies[index].company_name }
                    : {}),
                  error: errorText(result.reason),
                },
              ]
            : []
        );
        return {
          ok: failures.length === 0,
          results: results.map((result, index) =>
            result.status === "fulfilled"
              ? { index, ok: true, follow: result.value }
              : { index, ok: false, error: errorText(result.reason) }
          ),
          follows,
          failures,
          modelOutput: [
            follows.length
              ? formatCompanyFollows(follows)
              : "No follows saved by this batch.",
            ...failures.map(
              (failure) =>
                `Follow failed for ${failure.followId ? `follow_id ${failure.followId}` : failure.companyWorkspaceId ? `company_workspace_id ${failure.companyWorkspaceId}` : failure.companyName}: ${failure.error}`
            ),
          ].join("\n\n"),
        };
      }
      // Already-saved provider transcripts may still carry a single company scope.
      const requestId = requestIdentity(input);
      const follow = await writeCareerCompanyFollow({
        ...owner,
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
