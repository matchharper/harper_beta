import { RESUME_RENDER_VERSION } from "./template";
import Ajv from "ajv";
import { randomUUID } from "node:crypto";
import { applyResumeChanges, type ResumeChange } from "./changes";

export const GENERATED_RESUME_ORIGIN = "harper_generated_resume";
export const RESUME_SCHEMA_VERSION = 1;
export const RESUME_TEMPLATE_VERSION = RESUME_RENDER_VERSION;

export type ResumeEntry = {
  id?: string;
  title: string;
  organization?: string;
  location?: string;
  period?: string;
  description?: string;
  bullets?: string[];
  url?: string;
};
export type ResumeContent = {
  language: "ko" | "en";
  basics: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: { label: string; url: string }[];
  };
  experience?: ResumeEntry[];
  education?: ResumeEntry[];
  projects?: ResumeEntry[];
  extracurricular?: ResumeEntry[];
  skills?: { id?: string; title: string; items: string[] }[];
  additional_sections?: {
    id?: string;
    title: string;
    entries: ResumeEntry[];
  }[];
};
export type SourceReference = {
  section: string;
  entry_id?: string;
  kind: "document" | "profile" | "memory" | "message";
  id: string;
};
type ResumeInputMetadata = {
  document_name?: string;
  document_id?: string;
  expected_revision?: number;
  target_role?: { title: string; company?: string };
  source_document_ids?: string[];
  source_refs?: SourceReference[];
};
export type GenerateResumeInput = ResumeInputMetadata &
  (
    | { action: "create"; content: ResumeContent; changes?: never }
    | { action: "update"; changes: ResumeChange[]; content?: never }
  );
export type StructuredResume = {
  schema_version: 1;
  template_version: string;
  content: ResumeContent;
  target_role?: GenerateResumeInput["target_role"];
  source_document_ids: string[];
  source_refs: SourceReference[];
};

const str = (maxLength = 2000) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "\\S",
});
const id = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
};
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const arr = (items: unknown, maxItems = 60) => ({
  type: "array",
  items,
  maxItems,
});
const entry = obj(
  {
    id,
    title: str(300),
    organization: str(300),
    location: str(300),
    period: str(150),
    description: str(4000),
    bullets: arr(str(2000), 30),
    url: str(2000),
  },
  ["title"]
);

export const GENERATE_RESUME_PARAMETERS = obj(
  {
    action: {
      type: "string",
      enum: ["create", "update"],
      description:
        "create requires document_name and full content. update requires document_id, expected_revision and changes from read_document(format=structured); never send full content for update.",
    },
    document_name: {
      ...str(200),
      description:
        "Filename without .pdf; required for create. Include the person's known name and role/company/language. On update omit unless the user requested renaming or repurposing.",
    },
    document_id: id,
    expected_revision: { type: "integer", minimum: 1 },
    target_role: obj({ title: str(300), company: str(300) }, ["title"]),
    source_document_ids: arr(id, 20),
    changes: {
      ...arr(
        obj(
          {
            op: { type: "string", enum: ["set", "add", "remove"] },
            path: {
              ...str(500),
              description:
                "JSON pointer relative to content. Select existing entries by their exact id: /experience/<id>/description. Use numeric indices for bullets, skill items and contact links. set replaces only that field; remove deletes the exact field or entry. add appends one new item at a collection path (including a missing optional collection), or inserts before an existing item at its path. Never target id or replace existing entry collections; edit their fields. Escape ~ as ~0 and / as ~1.",
            },
            value: {
              description:
                "New JSON value for set/add; omit for remove. New entries must omit id.",
            },
          },
          ["op", "path"]
        ),
        100
      ),
      minItems: 1,
    },
    content: obj(
      {
        language: { type: "string", enum: ["ko", "en"] },
        basics: obj(
          {
            name: str(200),
            email: str(300),
            phone: str(100),
            location: str(300),
            links: arr(
              obj({ label: str(100), url: str(2000) }, ["label", "url"]),
              10
            ),
          },
          ["name"]
        ),
        experience: arr(entry),
        education: arr(entry),
        projects: arr(entry),
        extracurricular: arr(entry),
        skills: arr(
          obj({ id, title: str(200), items: arr(str(200), 60) }, [
            "title",
            "items",
          ]),
          30
        ),
        additional_sections: arr(
          obj({ id, title: str(200), entries: arr(entry) }, [
            "title",
            "entries",
          ]),
          15
        ),
      },
      ["language", "basics"]
    ),
    source_refs: arr(
      obj(
        {
          section: str(100),
          entry_id: id,
          kind: {
            type: "string",
            enum: ["document", "profile", "memory", "message"],
          },
          id: {
            ...str(200),
            description:
              "Use an identifier returned by a prior read tool: document UUID; memory ref number as a string; message ID; profile experience:<id>, education:<id>, extra:<id>, or user:<user_id>. Omit source_refs when no verified identifier is available; never invent one.",
          },
        },
        ["section", "kind", "id"]
      ),
      200
    ),
  },
  ["action"]
);

const validate = new Ajv({ allErrors: false }).compile(
  GENERATE_RESUME_PARAMETERS
);

// Optional model fields may arrive as empty strings/null. Missing facts are omitted,
// while required fields and unknown properties still go through strict validation.
function omitEmptyOptionalFields(value: unknown, schema: unknown): unknown {
  const rule = schema as {
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
  };
  if (Array.isArray(value) && rule.items)
    return value.map((item) => omitEmptyOptionalFields(item, rule.items));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !rule.properties
  )
    return value;
  const normalized = { ...value } as Record<string, unknown>;
  for (const [key, childSchema] of Object.entries(rule.properties)) {
    if (!(key in normalized)) continue;
    // Preserve edit commands exactly; normalize optional facts only after merging.
    if (schema === GENERATE_RESUME_PARAMETERS && key === "changes") continue;
    const child = normalized[key];
    if (
      !rule.required?.includes(key) &&
      (child === null || (typeof child === "string" && !child.trim()))
    )
      delete normalized[key];
    else normalized[key] = omitEmptyOptionalFields(child, childSchema);
  }
  return normalized;
}

export function parseResumeInput(value: unknown): GenerateResumeInput {
  if ((JSON.stringify(value)?.length ?? 0) > 150_000)
    throw new Error("Resume content is too large.");
  const normalized = omitEmptyOptionalFields(value, GENERATE_RESUME_PARAMETERS);
  // Older saved JSON can contain summary. Accept edits to those documents without
  // carrying that obsolete section into the new JSON, plain text, or PDF.
  if (normalized && typeof normalized === "object" && "content" in normalized) {
    const content = normalized.content;
    if (content && typeof content === "object" && !Array.isArray(content))
      delete (content as Record<string, unknown>).summary;
  }
  if (!validate(normalized))
    throw new Error(
      `Invalid resume input at ${validate.errors?.[0]?.instancePath || "/"}: ${validate.errors?.[0]?.message}`
    );
  const input = structuredClone(normalized) as unknown as GenerateResumeInput;
  if (
    input.action === "create" &&
    (!input.content || input.changes !== undefined)
  )
    throw new Error("create requires content and must not include changes.");
  if (
    input.action === "update" &&
    (!input.changes || input.content !== undefined)
  )
    throw new Error(
      "update requires changes and must not include full content."
    );
  if (
    input.action === "create" &&
    (!input.document_name ||
      input.document_id ||
      input.expected_revision !== undefined)
  )
    throw new Error(
      "create requires document_name and must not include document_id or expected_revision."
    );
  if (
    input.action === "update" &&
    (!input.document_id || input.expected_revision === undefined)
  )
    throw new Error("update requires document_id and expected_revision.");
  if (input.action === "update") return input;
  const checkUrl = (url: string) => {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Resume links must use https or http.");
  };
  input.content.basics.links?.forEach((x) => checkUrl(x.url));
  const all = resumeEntries(input.content);
  all.forEach((x) => {
    if ("url" in x && typeof x.url === "string") checkUrl(x.url);
  });
  const ids = all.flatMap((x) => (x.id ? [x.id] : []));
  if (new Set(ids).size !== ids.length)
    throw new Error("Resume item IDs must be unique.");
  return input;
}

export function resumeEntries(content: ResumeContent): Array<{ id?: string }> {
  return [
    ...(content.experience ?? []),
    ...(content.education ?? []),
    ...(content.projects ?? []),
    ...(content.extracurricular ?? []),
    ...(content.skills ?? []),
    ...(content.additional_sections ?? []).flatMap((s) => [s, ...s.entries]),
  ];
}

export function structureResume(
  input: GenerateResumeInput,
  previous?: StructuredResume
): StructuredResume {
  if (input.action === "update" && !previous)
    throw new Error("Partial resume edits require the current saved JSON.");
  const content =
    input.action === "create"
      ? structuredClone(input.content)
      : readResumeContent({
          schema_version: RESUME_SCHEMA_VERSION,
          content: applyResumeChanges(previous!.content, input.changes),
        });
  const previousIds = new Set(
    previous ? resumeEntries(previous.content).map((x) => x.id) : []
  );
  for (const item of resumeEntries(content)) {
    if (item.id && !previousIds.has(item.id))
      throw new Error(
        "New resume entries must omit id; preserve IDs only from the current document."
      );
    item.id ??= randomUUID();
  }
  return {
    schema_version: 1,
    template_version: RESUME_TEMPLATE_VERSION,
    content,
    target_role: input.target_role ?? previous?.target_role,
    source_document_ids:
      input.source_document_ids ?? previous?.source_document_ids ?? [],
    source_refs: input.source_refs ?? previous?.source_refs ?? [],
  };
}

export function resumeFileName(name: string) {
  const base = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .trim()
    .replace(/(?:\.pdf)+$/i, "")
    .trim()
    .slice(0, 180);
  if (!base || /^\.+$/.test(base))
    throw new Error("A document name is required.");
  return `${base}.pdf`;
}

// Validate stored documents at the display/export boundary; never trust arbitrary saved JSON.
export function readResumeContent(value: unknown): ResumeContent {
  const structured = value as Partial<StructuredResume> | null;
  if (structured?.schema_version !== RESUME_SCHEMA_VERSION)
    throw new Error("Unsupported resume schema version.");
  const input = parseResumeInput({
    action: "create",
    document_name: "resume",
    content: structured.content,
  });
  if (input.action !== "create") throw new Error("Invalid resume content.");
  return input.content;
}
