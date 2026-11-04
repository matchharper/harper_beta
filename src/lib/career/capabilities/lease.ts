import {
  CAREER_CAPABILITIES,
  CAREER_CAPABILITY_GAP_MS,
  isCareerCapabilityId,
  type CareerCapabilityId,
  type CareerCapabilityMode,
} from "./registry";
import type { CareerHandbookLease } from "../handbooks/registry";
import type { CareerToolUseFact } from "./decisions";

export const CAREER_CAPABILITY_PAYLOAD_KEY = "careerCapabilityTurn";
export type CareerCapabilityTurnRecord = {
  version: 1 | 2;
  status: "in_progress" | "completed";
  mode: CareerCapabilityMode;
  activated: CareerCapabilityId[];
  used: CareerCapabilityId[];
  replyId?: string;
  offered?: CareerCapabilityId[];
  toolResults?: CareerToolUseFact[];
  handbooks?: CareerHandbookLease[];
  loadedHandbooks?: string[];
  injectedHandbooks?: string[];
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
    (row.version !== 1 && row.version !== 2) ||
    !["in_progress", "completed"].includes(String(row.status)) ||
    !["full", "progressive"].includes(String(row.mode))
  )
    return null;
  // Prior turns may name the former resume capability. This is a persisted
  // availability hint only; the current loader exposes the unified capability.
  const normalize = (values: unknown): CareerCapabilityId[] | null => {
    if (!Array.isArray(values)) return null;
    const ids = values.map((id) => id === "resume_authoring" ? "documents" : id);
    // Removed capabilities remain historical execution facts, not loadable tools.
    return [...new Set(ids.filter(isCareerCapabilityId))];
  };
  const activated = normalize(row.activated);
  const used = normalize(row.used);
  if (!activated || !used) return null;
  return { ...row, activated, used } as CareerCapabilityTurnRecord;
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
