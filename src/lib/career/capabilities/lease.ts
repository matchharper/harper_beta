import {
  CAREER_CAPABILITIES,
  CAREER_CAPABILITY_GAP_MS,
  isCareerCapabilityId,
  type CareerCapabilityId,
  type CareerCapabilityMode,
} from "./registry";

export const CAREER_CAPABILITY_PAYLOAD_KEY = "careerCapabilityTurn";
export type CareerCapabilityTurnRecord = {
  version: 1;
  status: "in_progress" | "completed";
  mode: CareerCapabilityMode;
  activated: CareerCapabilityId[];
  used: CareerCapabilityId[];
};
export function initialCareerCapabilityPayload(mode: CareerCapabilityMode) {
  return {
    [CAREER_CAPABILITY_PAYLOAD_KEY]: {
      version: 1,
      status: "in_progress",
      mode,
      activated: [],
      used: [],
    } satisfies CareerCapabilityTurnRecord,
  };
}
export function parseCareerCapabilityTurn(
  payload: unknown
): CareerCapabilityTurnRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const value = (payload as Record<string, unknown>)[
    CAREER_CAPABILITY_PAYLOAD_KEY
  ];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    !["in_progress", "completed"].includes(String(row.status)) ||
    !["full", "progressive"].includes(String(row.mode))
  )
    return null;
  if (
    ![row.activated, row.used].every(
      (v) => Array.isArray(v) && v.every(isCareerCapabilityId)
    )
  )
    return null;
  return row as CareerCapabilityTurnRecord;
}
export function restoreCareerCapabilityLeases(args: {
  currentCreatedAt: string;
  rows: readonly { created_at: string; payload: unknown }[];
}): Set<CareerCapabilityId> {
  const loaded = new Set<CareerCapabilityId>();
  let newer = Date.parse(args.currentCreatedAt);
  if (!Number.isFinite(newer)) return loaded;
  for (const [index, row] of args.rows.entries()) {
    const older = Date.parse(row.created_at);
    const turn = parseCareerCapabilityTurn(row.payload);
    if (
      !Number.isFinite(older) ||
      newer < older ||
      newer - older > CAREER_CAPABILITY_GAP_MS ||
      !turn ||
      turn.status !== "completed" ||
      turn.mode !== "progressive"
    )
      break;
    for (const c of CAREER_CAPABILITIES) {
      if (
        index < c.turns &&
        (turn.activated.includes(c.id) || turn.used.includes(c.id))
      )
        loaded.add(c.id);
    }
    newer = older;
  }
  return loaded;
}
