import { z } from "zod";
import { predicateSchema, type ResourceItem } from "./types";

export const factualFiltersSchema = z
  .object({ where: z.array(predicateSchema).default([]) })
  .strict();
/** Exact facts only. Missing facts do not satisfy a requested condition. */
export function matchesResourceFacts(
  item: ResourceItem,
  filters: z.infer<typeof factualFiltersSchema>
) {
  return filters.where.every((predicate) => {
    const value =
      predicate.field === "title" ? item.title : item.facts[predicate.field];
    if (predicate.op === "exists") return value !== null && value !== undefined;
    if (value === null || value === undefined) return false;
    if (predicate.op === "eq") return value === predicate.value;
    if (predicate.op === "in")
      return (
        Array.isArray(predicate.value) &&
        predicate.value.includes(String(value))
      );
    if (typeof value === "number" && typeof predicate.value === "number")
      return predicate.op === "gte"
        ? value >= predicate.value
        : value <= predicate.value;
    if (typeof value === "string" && typeof predicate.value === "string")
      return predicate.op === "gte"
        ? value >= predicate.value
        : value <= predicate.value;
    return false;
  });
}
