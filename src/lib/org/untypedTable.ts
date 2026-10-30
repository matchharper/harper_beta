import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * A table read without the generated types. `src/types/database.types.ts`
 * is older than several org tables and columns (for example
 * `company_talent_followups` and `company_talent_requests.ops_only`), so
 * typed reads of them fail to compile. Callers state the row type of what
 * they select instead of using `any`.
 */
export function untypedTable(
  admin: ReturnType<typeof getSupabaseAdmin>,
  name: string
) {
  return (admin as unknown as SupabaseClient).from(name);
}
