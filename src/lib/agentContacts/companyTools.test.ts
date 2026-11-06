import assert from "node:assert/strict";
import { test } from "node:test";
import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { executeCompanyCorrespondence } from "./companyTools";
import { CompanyScheduleInputError } from "./schedules";
import { AgentContactSupersededError } from "./store";

// A run woken by an ordinary schedule (not tied to an introduction).
const source = { kind: "company_event", workspaceId: "workspace", roleId: "role", jobId: "job", leaseOwner: "lease" } as const;
const database = (transaction: () => Promise<never>): Database => ({
  query: async (sql) =>
    sql.includes("company_agent_web_action_jobs") ? [{ action_context: { scheduleId: "schedule" } }] : [{ target_refs: {} }],
  transaction,
});
const manage = (input: Record<string, unknown>, db: Database) =>
  executeCompanyCorrespondence(
    { source, name: "manage_agent_schedule", input: { roleId: "role", ...input }, sourceMessageId: 1, conversationId: "conversation" },
    db
  );

// The tool loop returns an OrgAgentToolInputError to the model even in event and
// schedule runs; other tool errors fail the run.
test("schedule tool input errors go back to the model in a schedule run", async () => {
  const untouched = database(async () => {
    throw new Error("no schedule change expected");
  });
  await assert.rejects(
    manage({ action: "create", title: "Check again", instruction: "Look at the result" }, untouched),
    (error) => error instanceof OrgAgentToolInputError && /operationId/.test(error.message)
  );
  const limit = database(async () => {
    throw new CompanyScheduleInputError("A Harper schedule repeats at most once a day.");
  });
  await assert.rejects(
    manage({ action: "create", operationId: "check", title: "Check again", instruction: "Look at the result" }, limit),
    (error) => error instanceof OrgAgentToolInputError && error.message === "A Harper schedule repeats at most once a day."
  );
  const superseded = new AgentContactSupersededError("Company schedule changed");
  await assert.rejects(
    manage({ action: "list" }, database(async () => {
      throw superseded;
    })),
    (error) => error === superseded
  );
});
