/** Evaluation-only machine contracts. Never judges conversational meaning. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveCandidateContactLifecycleAction } from "../../src/lib/org/agent/candidateContactAction";

export const evaluationSha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Execution completeness only. A completed run still needs semantic review. */
export function evaluationExecutionComplete(results: Array<{ error: unknown; turns: number; expectedTurns: number }>): boolean {
  return results.length > 0 && results.every(result => !result.error && result.expectedTurns > 0 && result.turns === result.expectedTurns);
}

/** Frozen dialogue protocol only; never used by the production agent. */
export function contactEvaluationSteps(input: { candidateFirst?: string }): string[] {
  return input.candidateFirst
    ? ["candidate-first", "event", "company", "deliver-candidate", "candidate", "event"]
    : ["company", "deliver-candidate", "candidate", "event"];
}

export function assertContactEvaluationStep(input: { candidateFirst?: string }, completed: string[], command: string) {
  const expected = contactEvaluationSteps(input);
  if (completed.some((value, index) => expected[index] !== value) || expected[completed.length] !== command) {
    throw Error(`Frozen conversation order mismatch: expected ${expected[completed.length] ?? "end"}, received ${command}. Use a fresh fixture/run; do not repair the transcript.`);
  }
}

export function readFrozenDataset(directory: string, entry: string, files: Record<string, string>, seen = new Set<string>()): any {
  if (path.basename(entry) !== entry || seen.has(entry)) throw Error("Invalid or circular frozen dataset dependency");
  seen.add(entry);
  const raw = readFileSync(path.join(directory, entry), "utf8");
  if (!files[entry] || evaluationSha(raw) !== files[entry]) throw Error(`Frozen input mismatch: ${entry}`);
  const spec = JSON.parse(raw);
  return spec.baseDataset ? { ...readFrozenDataset(directory, spec.baseDataset, files, seen), ...spec } : spec;
}

export function evaluateContactLifecycle(record: any, input: any, clock: string) {
  const mode = input.deliveryMode ?? "standard";
  if (!["standard", "immediate"].includes(mode)) throw Error("Invalid deliveryMode");
  const action = resolveCandidateContactLifecycleAction({ action: input.action, deliveryMode: mode, workflowStatus: record.status });
  if (action === "schedule") {
    if (record.status !== "draft") throw Error("Not a draft");
    if (input.expectedRevision !== record.revision) throw Error("Missing or stale contact revision");
    record.status = "queued";
    record.scheduledAt = new Date(Date.parse(clock) + (mode === "standard" ? 300_000 : 0)).toISOString();
    return { status: mode === "immediate" ? "immediate" : "queued", candidateContactState: "scheduled", deliveryMode: mode, scheduledAt: record.scheduledAt, candidateMessageSent: false };
  }
  if (action === "immediate") {
    if (!["queued", "failed"].includes(record.status)) throw Error("Not changeable; an unapproved draft cannot be sent with immediate");
    record.status = "queued";
    record.scheduledAt = new Date(clock).toISOString();
    return { status: "immediate", candidateContactState: "scheduled", deliveryMode: "immediate", scheduledAt: record.scheduledAt, candidateMessageSent: false };
  }
  if (action === "cancel") {
    if (!["draft", "queued", "failed"].includes(record.status)) throw Error("Not changeable");
    record.status = "cancelled";
    return { status: "cancelled", candidateContactState: "cancelled", candidateMessageSent: false };
  }
  throw Error("Unsupported lifecycle action");
}

export function fixtureRoleName(roles: any[], roleId: string): string {
  const role = roles.find(role => role.roleId === roleId);
  if (!role) throw Error("Unknown fixture Role");
  return role.name;
}
