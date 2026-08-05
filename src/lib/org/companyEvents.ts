const COMPANY_EVENT_CONTENT_MAX_LENGTH = 300;
const COMPANY_EVENT_ACTOR_MAX_LENGTH = 40;
const COMPANY_EVENT_KEY_MAX_LENGTH = 48;
const COMPANY_EVENT_VALUE_MAX_LENGTH = 52;

export type CompanyEventSource = "chat" | "slack" | "website";

export type CompanyEventChange = {
  after: unknown;
  before: unknown;
  key: string;
};

type CompanyEventInsertRow = {
  content: string;
  source: CompanyEventSource;
  workspace_id: string;
};

export type CompanyEventInsertClient = {
  from: (table: "company_events") => {
    insert: (
      row: CompanyEventInsertRow
    ) => PromiseLike<{ error: unknown | null }>;
  };
};

function clipText(value: string, maxLength: number) {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  if (maxLength <= 1) return "…";
  return `${characters.slice(0, maxLength - 1).join("")}…`;
}

function sanitizeSingleLine(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeComparable(nestedValue)])
    );
  }
  return value === undefined ? null : value;
}

function valuesEqual(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "없음";

  let formatted: string;
  if (typeof value === "string") {
    formatted = `"${sanitizeSingleLine(value).replaceAll('"', "'")}"`;
  } else if (Array.isArray(value)) {
    formatted = `[${value.map(sanitizeSingleLine).join(", ")}]`;
  } else if (typeof value === "object") {
    formatted = JSON.stringify(normalizeComparable(value));
  } else {
    formatted = String(value);
  }
  return clipText(
    sanitizeSingleLine(formatted),
    COMPANY_EVENT_VALUE_MAX_LENGTH
  );
}

function formatChange(change: CompanyEventChange) {
  const key =
    clipText(sanitizeSingleLine(change.key), COMPANY_EVENT_KEY_MAX_LENGTH) ||
    "value";
  return `${key}: - ${formatValue(change.before)} + ${formatValue(change.after)}`;
}

export function getCompanyEventActorLabel(args: {
  email?: unknown;
  name?: unknown;
}) {
  return clipText(
    (
      sanitizeSingleLine(args.name) ||
      sanitizeSingleLine(args.email) ||
      "회사 사용자"
    ).replaceAll("·", " "),
    COMPANY_EVENT_ACTOR_MAX_LENGTH
  );
}

export function getCompanyEventActorLabelFromUser(user: {
  email?: unknown;
  user_metadata?: Record<string, unknown> | null;
}) {
  const fullName = sanitizeSingleLine(user.user_metadata?.full_name);
  const name = sanitizeSingleLine(user.user_metadata?.name);
  return getCompanyEventActorLabel({
    email: user.email,
    name: fullName || name,
  });
}

export function buildCompanyEventContent(args: {
  actorLabel: string;
  changes: CompanyEventChange[];
}) {
  const changes = args.changes.filter(
    (change) => !valuesEqual(change.before, change.after)
  );
  if (changes.length === 0) return null;

  const actorLabel = getCompanyEventActorLabel({ name: args.actorLabel });
  const prefix = `${actorLabel} · `;
  const entries = changes.map(formatChange);
  const included: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const nextIncluded = [...included, entries[index]];
    const omittedCount = entries.length - nextIncluded.length;
    const suffix = omittedCount > 0 ? `; 외 ${omittedCount}개` : "";
    const candidate = `${prefix}${nextIncluded.join("; ")}${suffix}`;
    if (Array.from(candidate).length > COMPANY_EVENT_CONTENT_MAX_LENGTH) break;
    included.push(entries[index]);
  }

  if (included.length === 0) {
    return clipText(`${prefix}${entries[0]}`, COMPANY_EVENT_CONTENT_MAX_LENGTH);
  }

  const omittedCount = entries.length - included.length;
  const suffix = omittedCount > 0 ? `; 외 ${omittedCount}개` : "";
  return `${prefix}${included.join("; ")}${suffix}`;
}

export async function writeCompanyEvent(args: {
  actorLabel: string;
  changes: CompanyEventChange[];
  client: CompanyEventInsertClient;
  source: CompanyEventSource;
  workspaceId: string;
}) {
  const content = buildCompanyEventContent(args);
  if (!content) return { content: null, recorded: false as const };

  const { error } = await args.client.from("company_events").insert({
    content,
    source: args.source,
    workspace_id: args.workspaceId,
  });
  if (error) throw error;

  return { content, recorded: true as const };
}
