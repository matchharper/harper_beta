import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_STREAMING_TERMINAL_TOOL_NAMES,
  CAREER_STREAMING_TOOL_CHAIN,
  getCareerStreamingNextToolNames,
} from "./streamingToolChainPolicy";

test("supports dependent document reads, pagination, and updates", () => {
  assert.deepEqual(getCareerStreamingNextToolNames(["list_documents"]), [
    "list_documents",
    "read_document",
    "update_document",
  ]);
  assert.deepEqual(getCareerStreamingNextToolNames(["read_document"]), [
    "read_document",
    "update_document",
  ]);
});

test("supports the other identifier-dependent Career tool workflows", () => {
  assert.deepEqual(
    getCareerStreamingNextToolNames(["read_recommended_opportunities"]),
    [
      "get_role_context",
      "update_recommended_opportunity_feedback",
      "internal_role_priority_review",
    ]
  );
  assert.deepEqual(getCareerStreamingNextToolNames(["get_internal_roles"]), [
    "internal_role_priority_review",
    "get_role_context",
    "get_internal_roles",
  ]);
  assert.deepEqual(getCareerStreamingNextToolNames(["update_talent_profile"]), [
    "recommend_job_postings",
    "get_internal_roles",
  ]);
});

test("deduplicates follow-up tools while preserving dependency order", () => {
  assert.deepEqual(
    getCareerStreamingNextToolNames([
      "list_documents",
      "read_document",
      "unknown_tool",
    ]),
    ["list_documents", "read_document", "update_document"]
  );
});

test("keeps chain sources, terminal tools, and follow-up targets consistent", () => {
  const chainSources = Object.keys(CAREER_STREAMING_TOOL_CHAIN);
  const terminalToolNames = [...CAREER_STREAMING_TERMINAL_TOOL_NAMES];
  const classifiedToolNameSet = new Set([
    ...chainSources,
    ...terminalToolNames,
  ]);

  assert.equal(
    classifiedToolNameSet.size,
    chainSources.length + terminalToolNames.length
  );

  for (const nextToolNames of Object.values(CAREER_STREAMING_TOOL_CHAIN)) {
    for (const nextToolName of nextToolNames) {
      assert.ok(
        classifiedToolNameSet.has(nextToolName),
        `${nextToolName} must have an explicit streaming chain classification`
      );
    }
  }

  assert.ok(
    terminalToolNames.includes("search_connected_gmail"),
    "Gmail search should end the streaming tool chain"
  );
});
