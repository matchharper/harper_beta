import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export const resourceRefSchema = z.object({
  kind: z.enum([
    "company",
    "company_workspace",
    "company_datum",
    "role",
    "posting",
    "web_resource",
    "observation",
    "document",
    "memory",
    "profile",
    "message",
    "email_message",
    "opportunity",
    "operation",
  ]),
  id: z.string().min(1),
  revision: z.string().optional(),
});
export type ResourceRef = z.infer<typeof resourceRefSchema>;
export const predicateSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "in", "gte", "lte", "exists"]),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});
export const selectorSchema = z.object({
  itemIds: z.array(z.string().uuid()).optional(),
  excludeItemIds: z.array(z.string().uuid()).optional(),
  where: z.array(predicateSchema).optional(),
  orderBy: z
    .array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }))
    .optional(),
});
export const selectionSchema = z.union([
  z.object({ refs: z.array(resourceRefSchema) }),
  z.object({
    setId: z.string().uuid(),
    revision: z.number().int().positive(),
    selector: selectorSchema.optional(),
  }),
]);
export type Selection = z.infer<typeof selectionSchema>;
export type ResourceContext = { admin: TalentAdminClient; userId: string };
export type ResourceItem = {
  ref: ResourceRef;
  title: string;
  body: string;
  facts: Record<string, unknown>;
  sourceRefs: ResourceRef[];
  publicSourceLabels?: Record<string, string>;
  status: "available" | "unavailable" | "version_unavailable";
  latestRef?: ResourceRef;
  coverage?: string;
  publicCompany?: import("./companyData").CompanyProjection;
};
export const resourceDb = (admin: TalentAdminClient) =>
  admin as unknown as SupabaseClient;
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const rows = (value: unknown) =>
  Array.isArray(value) ? value.map(record) : [];
export const text = (value: unknown) =>
  typeof value === "string" ? value : "";
export function fingerprint(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)])
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
export function requestUuid(value: string) {
  const digest = fingerprint(value);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
export class ResourceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 503 = 400
  ) {
    super(message);
  }
}
export function databaseError(
  error: { message: string; code?: string } | null
) {
  // A missing backing table or RPC is a server configuration failure.
  if (error?.code === "PGRST205" || error?.code === "PGRST202")
    throw new ResourceError(error.message, 503);
  if (error)
    throw new ResourceError(
      error.message,
      error.code === "40001" || error.code === "23505"
        ? 409
        : /unavailable|not.found/i.test(error.message)
          ? 404
          : 400
    );
}
export function pageInput(cursor?: string, size = 50) {
  const offset = cursor ? Number(cursor) : 0;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(size) ||
    size < 1
  )
    throw new ResourceError("Invalid page cursor or size.");
  // A transport page, not a cap on the full search/selection.
  return { offset, limit: Math.min(size, 500) };
}
