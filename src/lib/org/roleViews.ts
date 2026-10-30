// Shapes shared by the inbox list columns, the board view and their API.

/** Candidates whose cells one fill request writes; the list sends the rest after. */
export const ORG_LIST_COLUMN_FILL_BATCH = 20;
/** The cell for a candidate whose profile does not show the fact. */
export const ORG_LIST_COLUMN_NOT_SHOWN = "—";

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

/**
 * A text box written on a Role's board, in black at `size` px. Shared by
 * everyone who can open the Role, with who last changed it.
 */
export type OrgBoardText = OrgBoardPoint & {
  id: string;
  size: number;
  text: string;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

export const ORG_BOARD_TEXT_SIZES = [14, 18, 24, 32, 48, 64, 96, 128];
export const ORG_BOARD_TEXT_DEFAULT_SIZE = 24;
/** Keeps one box a note rather than a document. */
export const ORG_BOARD_TEXT_MAX_LENGTH = 5_000;

/** The offered size that reads like `screenPx` at this zoom. */
export function orgBoardTextSizeForZoom(zoom: number, screenPx = 18) {
  const wanted = screenPx / (zoom > 0 ? zoom : 1);
  return closestOrgBoardTextSize(wanted);
}

export function closestOrgBoardTextSize(size: number) {
  return ORG_BOARD_TEXT_SIZES.reduce((best, option) =>
    Math.abs(option - size) < Math.abs(best - size) ? option : best
  );
}

/**
 * Where the team placed candidate cards on a Role's board, shared by
 * everyone who can open the Role. Keys are recommendation IDs.
 */
export type OrgBoardPositions = Record<string, OrgBoardPoint>;

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

/** A submitted text box, or null when it has no place or no words. */
export function normalizeOrgBoardText(value: unknown) {
  const { id, size, text, x, y } = (value ?? {}) as {
    id?: unknown;
    size?: unknown;
    text?: unknown;
    x?: unknown;
    y?: unknown;
  };
  if (typeof id !== "string" || !id || !finite(x) || !finite(y)) return null;
  if (typeof text !== "string" || !text.trim()) return null;
  return {
    id,
    size: finite(size)
      ? closestOrgBoardTextSize(size as number)
      : ORG_BOARD_TEXT_DEFAULT_SIZE,
    text: text.slice(0, ORG_BOARD_TEXT_MAX_LENGTH),
    x: x as number,
    y: y as number,
  };
}

export function normalizeOrgBoardPositions(value: unknown): OrgBoardPositions {
  const positions: OrgBoardPositions = {};
  if (!value || typeof value !== "object") return positions;
  for (const [key, point] of Object.entries(value as Record<string, unknown>)) {
    const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
    if (key && finite(x) && finite(y)) {
      positions[key] = { x: x as number, y: y as number };
    }
  }
  return positions;
}

export function normalizeOrgBoardViewport(
  value: unknown
): OrgBoardViewport | null {
  const viewport = (value ?? null) as Partial<OrgBoardViewport> | null;
  return viewport &&
    finite(viewport.x) &&
    finite(viewport.y) &&
    finite(viewport.zoom)
    ? {
        x: viewport.x as number,
        y: viewport.y as number,
        zoom: viewport.zoom as number,
      }
    : null;
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
