/**
 * Tool calls of one reply that run at the same time. Only preparation runs of use_browser qualify: they fill an
 * application form with the facts they are given but never upload, check consents, verify or submit, so two of them
 * in different browsers for different roles cannot affect each other. A group never mixes in another tool, an execute run, a saved-login run, a run with
 * documents, a second run on the same browser or a second run for the same role; those run one after another as before.
 * A call with a preparation list (use_browser runs) is one preparation that holds every role in its list.
 */
type ToolCall = { name: string; input: unknown };
type Preparation = { session?: string; roles: string[]; key: string };

function preparationRun(call: ToolCall): Preparation | null {
  if (call.name !== "use_browser" || !call.input || typeof call.input !== "object" || Array.isArray(call.input)) return null;
  const input = call.input as Record<string, unknown>;
  if (input.action !== "run" || (input.mode !== undefined && input.mode !== "prepare")) return null;
  if (input.save_login !== undefined && input.save_login !== false) return null;
  if (input.documents !== undefined) return null;
  if (input.session_id !== undefined && typeof input.session_id !== "string") return null;
  // A preparation list (runs) counts every role it prepares.
  const list = input.runs ?? [];
  if (!Array.isArray(list) || list.some((run) => !run || typeof run !== "object" || Array.isArray(run))) return null;
  const roles = [input.role_refs ?? [], ...list.map((run) => (run as Record<string, unknown>).role_refs ?? [])];
  if (roles.some((group) => !Array.isArray(group) || group.some((role) => typeof role !== "string"))) return null;
  return { session: input.session_id as string | undefined, roles: (roles as string[][]).flat(), key: JSON.stringify(input) };
}

function fitsWith(group: Preparation[], run: Preparation) {
  return group.every((other) => other.key !== run.key
    && (!run.session || run.session !== other.session)
    && !run.roles.some((role) => other.roles.includes(role)));
}

/** Index groups in call order. A group of two or more runs at the same time; every other group has one call. */
export function careerToolCallGroups(calls: readonly ToolCall[]): number[][] {
  const groups: number[][] = [];
  let current: { indexes: number[]; runs: Preparation[] } | null = null;
  calls.forEach((call, index) => {
    const run = preparationRun(call);
    if (run && current && fitsWith(current.runs, run)) {
      current.indexes.push(index);
      current.runs.push(run);
      return;
    }
    current = run ? { indexes: [index], runs: [run] } : null;
    groups.push(current ? current.indexes : [index]);
  });
  return groups;
}
