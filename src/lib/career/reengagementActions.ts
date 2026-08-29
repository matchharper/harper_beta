export const CAREER_REENGAGEMENT_ACTIONS_START =
  "[[CAREER_REENGAGEMENT_ACTIONS]]";
export const CAREER_REENGAGEMENT_ACTIONS_END =
  "[[/CAREER_REENGAGEMENT_ACTIONS]]";

const CAREER_REENGAGEMENT_ACTIONS_START_FRAGMENT =
  "[[CAREER_REENGAGEMENT_ACTIONS";
const CAREER_REENGAGEMENT_ACTIONS_PATTERN =
  /\[\[CAREER_REENGAGEMENT_ACTIONS\]\]\s*([\s\S]*?)\s*\[\[\/CAREER_REENGAGEMENT_ACTIONS\]\]/g;
const CAREER_PATH_PATTERN = /^\/career(?:\/|$)/;
const CAREER_PATH_BASE_URL = "https://career.matchharper.invalid";
const JSON_CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

export type CareerReengagementAction =
  | {
      label: string;
      action: {
        type: "send_message";
        message: string;
      };
    }
  | {
      label: string;
      action: {
        type: "open_path";
        path: string;
      };
    }
  | {
      label: string;
      action: {
        type: "open_pending_action";
        ref: string;
      };
    };

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function normalizeCareerPath(value: unknown) {
  const path = cleanString(value, 500);
  if (!path || path.startsWith("//")) return "";
  try {
    const url = new URL(path, CAREER_PATH_BASE_URL);
    if (
      url.origin !== CAREER_PATH_BASE_URL ||
      !CAREER_PATH_PATTERN.test(url.pathname)
    ) {
      return "";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function normalizePendingActionRef(value: unknown) {
  const ref = cleanString(value, 2000);
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ref) ? ref : "";
}

function normalizeCareerReengagementAction(
  value: unknown,
  resolvePendingActionRef?: (actionKey: string) => string | null
): CareerReengagementAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = cleanString(record.label, 80);
  if (!label || !record.action || typeof record.action !== "object") {
    return null;
  }

  const action = record.action as Record<string, unknown>;
  if (action.type === "send_message") {
    const message = cleanString(action.message, 1000);
    return message
      ? { label, action: { type: "send_message", message } }
      : null;
  }

  if (action.type === "open_path") {
    const path = normalizeCareerPath(action.path);
    return path ? { label, action: { type: "open_path", path } } : null;
  }

  if (action.type === "open_pending_action") {
    const ref = resolvePendingActionRef
      ? normalizePendingActionRef(
          resolvePendingActionRef(cleanString(action.actionKey, 80))
        )
      : normalizePendingActionRef(action.ref);
    return ref ? { label, action: { type: "open_pending_action", ref } } : null;
  }

  return null;
}

function getCareerReengagementActionKey(action: CareerReengagementAction) {
  switch (action.action.type) {
    case "send_message":
      return `send_message:${action.action.message}`;
    case "open_path":
      return `open_path:${action.action.path}`;
    case "open_pending_action":
      return `open_pending_action:${action.action.ref}`;
  }
}

function normalizeCareerReengagementActions(
  value: unknown,
  resolvePendingActionRef?: (actionKey: string) => string | null
) {
  const rawActions =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).actions
      : null;
  if (!Array.isArray(rawActions)) return [];

  const actions: CareerReengagementAction[] = [];
  const seenActions = new Set<string>();
  for (const rawAction of rawActions) {
    const action = normalizeCareerReengagementAction(
      rawAction,
      resolvePendingActionRef
    );
    if (!action) continue;
    const actionKey = getCareerReengagementActionKey(action);
    if (seenActions.has(actionKey)) continue;
    seenActions.add(actionKey);
    actions.push(action);
    if (actions.length >= 3) break;
  }
  return actions;
}

function parseCareerReengagementActionsPayload(payload: string) {
  const trimmed = payload.trim();
  const fencedPayload = trimmed.match(JSON_CODE_FENCE_PATTERN)?.[1];
  return JSON.parse((fencedPayload ?? trimmed).trim()) as unknown;
}

export function resolveCareerReengagementActionKeys(args: {
  content: string;
  resolvePendingActionRef: (actionKey: string) => string | null;
}) {
  let resolvedContent = args.content.replace(
    CAREER_REENGAGEMENT_ACTIONS_PATTERN,
    (_match, payload: string) => {
      try {
        const actions = normalizeCareerReengagementActions(
          parseCareerReengagementActionsPayload(payload),
          args.resolvePendingActionRef
        );
        if (actions.length === 0) return "";
        return `${CAREER_REENGAGEMENT_ACTIONS_START}\n${JSON.stringify({ actions })}\n${CAREER_REENGAGEMENT_ACTIONS_END}`;
      } catch {
        return "";
      }
    }
  );

  const incompleteBlockStart = resolvedContent.indexOf(
    CAREER_REENGAGEMENT_ACTIONS_START_FRAGMENT
  );
  if (
    incompleteBlockStart !== -1 &&
    resolvedContent.indexOf(
      CAREER_REENGAGEMENT_ACTIONS_END,
      incompleteBlockStart
    ) === -1
  ) {
    resolvedContent = resolvedContent.slice(0, incompleteBlockStart);
  }
  return resolvedContent.trim();
}

export function extractCareerReengagementActions(content: string) {
  const actions: CareerReengagementAction[] = [];
  const seenActions = new Set<string>();

  let strippedContent = content.replace(
    CAREER_REENGAGEMENT_ACTIONS_PATTERN,
    (_match, payload: string) => {
      try {
        for (const action of normalizeCareerReengagementActions(
          parseCareerReengagementActionsPayload(payload)
        )) {
          const actionKey = getCareerReengagementActionKey(action);
          if (seenActions.has(actionKey)) continue;
          seenActions.add(actionKey);
          actions.push(action);
          if (actions.length >= 3) break;
        }
      } catch {
        // Malformed UI metadata is hidden while the visible reply stays usable.
      }

      return "";
    }
  );

  const incompleteBlockStart = strippedContent.indexOf(
    CAREER_REENGAGEMENT_ACTIONS_START_FRAGMENT
  );
  if (incompleteBlockStart !== -1) {
    strippedContent = strippedContent.slice(0, incompleteBlockStart);
  }

  return {
    actions,
    content: strippedContent.trim(),
  };
}

export function stripCareerReengagementActions(content: string) {
  return extractCareerReengagementActions(content).content;
}
