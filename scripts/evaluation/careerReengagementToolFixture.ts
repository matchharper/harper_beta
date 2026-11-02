import assert from "node:assert/strict";
import { CAREER_MATCHING_TOOLS } from "@/lib/career/matching/tools";
import { formatCareerMatchingResult } from "@/lib/career/matching/formatters";
import { formatPromptText } from "@/lib/llm/promptText";

/** Synthetic executor: production publication tool + formatter, in-memory RPC.
 * Search/read evidence is frozen; no network, production writes or messages.
 */
export function createReengagementToolFixture(fixture: any) {
  let matching = fixture.opportunitySnapshot.matching;
  let revision =
    fixture.opportunitySnapshot.listRevision ?? "synthetic-list-v1";
  let evaluations: any[] =
    fixture.allEvaluations ??
    fixture.opportunitySnapshot.results?.evaluations ??
    [];
  const published: any[] = [],
    calls: any[] = [];
  const admin = {
    rpc: async (name: string, args: any) => {
      if (name === "career_opportunity_list_revision")
        return { data: revision, error: null };
      const command = args.p_command;
      if (name === "write_career_matching") {
        assert.equal(command.action, "create");
        matching = {
          id: "00000000-0000-4000-8000-000000000007",
          title: command.title,
          criteria: command.criteria,
          revision: 1,
        };
        return { data: matching, error: null };
      }
      assert.equal(name, "write_career_opportunities");
      assert.equal(command.action, "add");
      assert.equal(command.matchingId, matching?.id);
      assert.equal(command.expectedRevision, revision);
      for (const item of command.items ?? []) {
        assert.ok(
          evaluations.some(
            (e) => e.id === item.evaluationId && e.role_id === item.roleId
          ),
          "Publication needs a real evaluation-role pair from this fixture"
        );
        published.push(item);
      }
      revision = "synthetic-list-v2";
      return {
        data: {
          ok: true,
          action: "add",
          recommendationIds: published.map(
            (_, i) =>
              `00000000-0000-4000-8000-${String(500 + i).padStart(12, "0")}`
          ),
          listRevision: revision,
        },
        error: null,
      };
    },
  };
  const execute = async ({
    name,
    input,
  }: {
    name: string;
    input: Record<string, any>;
  }) => {
    calls.push({ name, input });
    let result: any;
    if (name === "upsert_opportunities" || name === "upsert_matching") {
      result = await CAREER_MATCHING_TOOLS[name].execute!(input, {
        admin: admin as any,
        userId: "00000000-0000-4000-8000-000000000001",
        conversationId: "00000000-0000-4000-8000-000000000002",
        toolCallId: `fixture-${calls.length}`,
      });
    } else if (name === "search_opportunities") {
      if (input.source === "internal") {
        assert.ok(
          Array.isArray(fixture.internalSearchResults),
          "Internal-search fixture is required"
        );
        const result = {
          ok: true,
          source: "internal",
          status: "completed",
          runId: "00000000-0000-4000-8000-000000000092",
          evaluations: fixture.internalSearchResults,
          evaluationCount: fixture.internalSearchResults.length,
          remainingEvaluationCount: 0,
        };
        calls.at(-1).result = result;
        return { ...result, modelOutput: formatCareerMatchingResult(result) };
      }
      assert.equal(input.source, "external");
      assert.equal(input.matchingId, matching?.id);
      evaluations = input.roleIds
        ? fixture.searchResults.filter((e: any) =>
            input.roleIds.includes(e.role_id)
          )
        : fixture.searchResults;
      if (input.roleIds)
        assert.ok(
          evaluations.every((e) => input.roleIds.includes(e.role_id)),
          "Exact-role evaluation must stay within chosen roles"
        );
      result = {
        ok: true,
        source: "external",
        status: "completed",
        runId: "00000000-0000-4000-8000-000000000091",
        evaluations,
        evaluationCount: evaluations.length,
        remainingEvaluationCount: 0,
        expiredRoleCount: 0,
        listRevision: revision,
      };
    } else if (name === "read_matching" || name === "list_matchings") {
      result = {
        matching,
        matchings: matching ? [matching] : [],
        listRevision: revision,
        defaultListRevision: revision,
        evaluations,
        evaluationCount: evaluations.length,
        remainingEvaluationCount: 0,
        memberships: [],
        runs: [],
      };
    } else if (name === "read_talent_context") {
      result = { ok: true, modelOutput: fixture.talentContextSection };
    } else if (name === "read_recommended_opportunities") {
      result = {
        ok: true,
        modelOutput: published.length
          ? formatPromptText(
              published.map((item) => ({
                ...item,
                role: evaluations.find((e) => e.role_id === item.roleId)?.role,
                status: "recommended",
              }))
            )
          : "No previous recommendations in this synthetic fixture.",
      };
    } else if (name === "get_role_context") {
      result = {
        ok: true,
        modelOutput: formatPromptText(
          fixture.allRoleFacts ??
            fixture.opportunitySnapshot.roleFacts ??
            fixture.opportunitySnapshot.legacy
        ),
      };
    } else {
      throw new Error(`Unconfigured fixture tool: ${name}`);
    }
    const projected = {
      ...result,
      modelOutput: result.modelOutput ?? formatCareerMatchingResult(result),
    };
    calls.at(-1).result = projected;
    return projected;
  };
  return { execute, calls, published };
}
