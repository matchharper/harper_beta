import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "./admin";
import { profileExtraEntries } from "./profileStore";
import { normalizeProfileDate } from "./profileDate";

const FIELDS = {
  experience: [
    "role",
    "company_name",
    "company_link",
    "company_location",
    "employment_type",
    "start_date",
    "end_date",
    "description",
    "memo",
  ],
  education: [
    "school",
    "degree",
    "field",
    "start_date",
    "end_date",
    "url",
    "description",
    "memo",
  ],
  extra: ["title", "date", "description", "memo"],
} as const;
type RowType = keyof typeof FIELDS;
const fieldNames = [...new Set(Object.values(FIELDS).flat())];
const rowType = { type: "string", enum: Object.keys(FIELDS) };
export const PROFILE_ROWS_PARAMETERS = {
  type: "array",
  maxItems: 10,
  description:
    "Add, update or delete actual profile rows from explicit user facts/requests. Update/delete use exact RowID; omitted fields stay unchanged, null clears a field. Read a row before replacing its description; supply the complete replacement. Experience/education dates accept calendar dates, years, or year-months. Partial start dates use the first day, partial end dates the last day of that period; these are storage boundaries, not evidence of an exact day. Null clears a date. Deletes require an explicit removal request.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["type", "operation"],
    properties: {
      type: rowType,
      operation: { type: "string", enum: ["add", "update", "delete"] },
      rowId: { type: "string" },
      fields: {
        type: "object",
        additionalProperties: false,
        description:
          "experience: role, company_name/link/location, employment_type, start/end_date. education: school, degree, field, start/end_date, url. extra: title, date. All support description and memo.",
        properties: Object.fromEntries(
          fieldNames.map((name) => [name, { type: ["string", "null"] }])
        ),
      },
    },
  },
};
export const PROFILE_READ_ROWS_PARAMETERS = {
  type: "array",
  maxItems: 5,
  description:
    "Read full existing rows only when the compact profile is insufficient for an edit. Exact RowIDs from the profile are required.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["type", "rowId"],
    properties: { type: rowType, rowId: { type: "string" } },
  },
};

function parseChange(value: unknown, read: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid profile row operation.");
  const row = value as Record<string, unknown>;
  if (typeof row.type !== "string" || !(row.type in FIELDS))
    throw new Error("Invalid profile row type.");
  const type = row.type as RowType;
  const operation = read ? "read" : row.operation;
  if (!["read", "add", "update", "delete"].includes(String(operation)))
    throw new Error("Invalid profile row operation.");
  const rowId = typeof row.rowId === "string" ? row.rowId.trim() : "";
  if (operation !== "add" && !rowId)
    throw new Error("An existing RowID is required.");
  const fields = row.fields ?? {};
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    throw new Error("Profile fields must be an object.");
  const patch: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      !(FIELDS[type] as readonly string[]).includes(key) ||
      (value !== null && typeof value !== "string")
    )
      throw new Error(`Invalid ${type} field: ${key}`);
    if (
      typeof value === "string" &&
      (value.includes("\0") ||
        value.length >
          (key === "memo" ? 2000 : key === "description" ? 8000 : 2000))
    )
      throw new Error(`Invalid or oversized profile field: ${key}`);
    patch[key] = value;
  }
  if (
    (operation === "add" || operation === "update") &&
    !Object.keys(patch).length
  )
    throw new Error("Profile fields are required.");
  return {
    type,
    operation: operation as "read" | "add" | "update" | "delete",
    rowId,
    patch,
  };
}

export async function executeProfileRows(args: {
  admin: TalentAdminClient;
  userId: string;
  requestId?: string | number | null;
  rows?: unknown;
  readRows?: unknown;
}) {
  const db = args.admin as unknown as SupabaseClient;
  if (
    args.rows !== undefined &&
    (!Array.isArray(args.rows) || args.rows.length > 10)
  )
    throw new Error("rows must contain at most 10 operations.");
  if (
    args.readRows !== undefined &&
    (!Array.isArray(args.readRows) || args.readRows.length > 5)
  )
    throw new Error("readRows must contain at most 5 references.");
  // Validate all structural input before the first mutation. Results report each write independently.
  const changes = [
    ...(args.readRows ?? []).map((r: unknown) => parseChange(r, true)),
    ...(args.rows ?? []).map((r: unknown) => parseChange(r, false)),
  ];
  const results: Record<string, unknown>[] = [];
  for (const change of changes) {
    const { type, operation, patch } = change;
    let rowId = change.rowId;
    try {
      if (type !== "extra") {
        for (const key of ["start_date", "end_date"] as const) {
          if (key in patch) {
            patch[key] = normalizeProfileDate(patch[key], key === "start_date" ? "start" : "end");
          }
        }
      }
      if (operation === "add") {
        if (!args.requestId)
          throw new Error("A stable request is required to add a profile row.");
        const digest = createHash("sha256")
          .update(JSON.stringify([args.userId, args.requestId, type, patch]))
          .digest();
        // Stable primary keys make a retried add idempotent without a new persistence table.
        rowId =
          type === "extra"
            ? `extra_${digest.toString("hex").slice(0, 24)}`
            : String(digest.readUIntBE(0, 6) || 1);
      }
      if (type === "extra") {
        const { data, error } = await db
          .from("talent_extras")
          .select("content")
          .eq("talent_id", args.userId)
          .maybeSingle();
        if (error) throw error;
        const entries = profileExtraEntries(data?.content);
        const index = entries.rows.findIndex((r) => r.id === rowId);
        if (operation !== "add" && index < 0)
          throw new Error("Profile row not found.");
        if (operation === "read") {
          results.push({
            type,
            rowId,
            operation,
            ok: true,
            fields: entries.rows[index].fields,
          });
          continue;
        }
        if (operation === "add" && index >= 0) {
          results.push({ type, rowId, operation, ok: true, changed: false });
          continue;
        }
        const content = entries.mutate({ rowId, operation, patch });
        const query = data
          ? db
              .from("talent_extras")
              .update({ content })
              .eq("talent_id", args.userId)
              .filter(
                "content",
                data.content === null ? "is" : "eq",
                data.content === null ? null : JSON.stringify(data.content)
              )
          : db
              .from("talent_extras")
              .insert({ talent_id: args.userId, content });
        const saved = await query.select("talent_id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data)
          throw new Error(
            "Profile changed while saving. Read it again before retrying."
          );
      } else {
        if (!/^[1-9]\d*$/.test(rowId) || !Number.isSafeInteger(Number(rowId)))
          throw new Error("Invalid RowID.");
        const table =
          type === "experience" ? "talent_experiences" : "talent_educations";
        const { data: current, error } = await db
          .from(table)
          .select(["id", ...FIELDS[type]].join(","))
          .eq("id", Number(rowId))
          .eq("talent_id", args.userId)
          .maybeSingle();
        if (error) throw error;
        if (operation !== "add" && !current)
          throw new Error("Profile row not found.");
        if (operation === "read") {
          results.push({ type, rowId, operation, ok: true, fields: current });
          continue;
        }
        if (operation === "add" && current) {
          results.push({ type, rowId, operation, ok: true, changed: false });
          continue;
        }
        const fields = {
          ...patch,
          ...(type === "experience" &&
          ("start_date" in patch || "end_date" in patch)
            ? { months: null }
            : {}),
        };
        let query =
          operation === "add"
            ? db
                .from(table)
                .insert({
                  ...fields,
                  id: Number(rowId),
                  talent_id: args.userId,
                })
            : (operation === "delete"
                ? db.from(table).delete()
                : db.from(table).update(fields)
              )
                .eq("id", Number(rowId))
                .eq("talent_id", args.userId);
        if (current) {
          const previous = current as unknown as Record<string, unknown>;
          for (const key of operation === "delete"
            ? FIELDS[type]
            : Object.keys(patch))
            query = query.filter(
              key,
              previous[key] === null ? "is" : "eq",
              previous[key]
            );
        }
        const saved = await query.select("id").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data)
          throw new Error(
            "Profile changed while saving. Read it again before retrying."
          );
      }
      results.push({
        type,
        rowId,
        operation,
        ok: true,
        changed: true,
        fields: Object.keys(patch),
        ...(type !== "extra" && ("start_date" in patch || "end_date" in patch)
          ? { storedDates: Object.fromEntries(Object.entries(patch).filter(([key]) => key === "start_date" || key === "end_date")) }
          : {}),
      });
    } catch (error) {
      results.push({
        type,
        rowId,
        operation,
        ok: false,
        error:
          error && typeof error === "object" && "message" in error && typeof error.message === "string"
            ? error.message
            : "Profile row could not be saved.",
      });
    }
  }
  return results;
}
