/** Evaluation-only machine contracts. Never judges conversational meaning. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveCandidateContactLifecycleAction } from "../../src/lib/org/agent/candidateContactAction";

export const evaluationSha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Read-only table fixtures; production readers/executors still own all projections. */
export function createEvaluationReadAdmin(tables: Record<string, Array<Record<string, any>>>) {
  return { from(table: string) {
    if (!Object.hasOwn(tables, table)) throw Error(`Missing frozen read table: ${table}`);
    let rows = structuredClone(tables[table]);
    const orders: Array<{ key: string; ascending: boolean }> = [];
    let range: [number, number] | null = null;
    let single = false;
    const query: any = {
      select() { return query; },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      is(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
      order(key: string, options: { ascending: boolean }) { orders.push({ key, ...options }); return query; },
      range(start: number, end: number) { range = [start, end]; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown) {
        rows.sort((a, b) => {
          for (const { key, ascending } of orders) {
            const compared = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
            if (compared) return ascending ? compared : -compared;
          }
          return 0;
        });
        const page = range ? rows.slice(range[0], range[1] + 1) : rows;
        if (single && page.length > 1) throw Error("Ambiguous frozen single-row result");
        return Promise.resolve(resolve({ data: single ? page[0] ?? null : page, error: null }));
      },
    };
    return query;
  } };
}

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
