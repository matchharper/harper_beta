import { TOOL_RUNTIME_CONTROL } from "../../src/lib/llm/toolError";

/** Account activity from outside this run invalidates a frozen scenario. */
export class CareerScenarioInputConflict extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor(ids: number[]) {
    super(`Account received non-test input (${ids.join(', ')}); stop testing and preserve the new conversation before any reset.`);
    this.name = "CareerScenarioInputConflict";
  }
}

export function assertScenarioInputsOwned(rows: { id: number }[], owned: ReadonlySet<number>) {
  const foreign = rows.filter(row => !owned.has(Number(row.id)));
  if (foreign.length) throw new CareerScenarioInputConflict(foreign.map(row => Number(row.id)));
}
