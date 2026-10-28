// Shapes shared by the inbox list columns, the board view and their API.

/** A comparison column the company asked Harper to add to the inbox list. */
export type OrgRoleListColumn = {
  description: string | null;
  id: string;
  label: string;
  updatedAt: string;
  /** Cell text by talent ID. */
  values: Record<string, string>;
};

export type OrgBoardPoint = { x: number; y: number };

export type OrgBoardViewport = { x: number; y: number; zoom: number };

/** One teammate's arrangement of a Role's board. Keys are recommendation IDs. */
export type OrgBoardLayout = {
  positions: Record<string, OrgBoardPoint>;
  viewport: OrgBoardViewport | null;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeOrgBoardLayout(value: unknown): OrgBoardLayout {
  const raw = (value ?? {}) as { positions?: unknown; viewport?: unknown };
  const positions: Record<string, OrgBoardPoint> = {};
  if (raw.positions && typeof raw.positions === "object") {
    for (const [key, point] of Object.entries(
      raw.positions as Record<string, unknown>
    )) {
      const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
      if (key && finite(x) && finite(y)) {
        positions[key] = { x: x as number, y: y as number };
      }
    }
  }
  const viewport = raw.viewport as Partial<OrgBoardViewport> | null;
  return {
    positions,
    viewport:
      viewport &&
      finite(viewport.x) &&
      finite(viewport.y) &&
      finite(viewport.zoom)
        ? {
            x: viewport.x as number,
            y: viewport.y as number,
            zoom: viewport.zoom as number,
          }
        : null,
  };
}

export function normalizeOrgListColumnValues(value: unknown) {
  const values: Record<string, string> = {};
  if (value && typeof value === "object") {
    for (const [key, text] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (key && typeof text === "string" && text.trim()) values[key] = text;
    }
  }
  return values;
}
