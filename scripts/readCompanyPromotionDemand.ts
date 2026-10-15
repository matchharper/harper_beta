/** Canonical read-only input for the existing LinkedIn Jobs inventory operator. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("company_roles").select("role_id,name,status,information,expires_at,company_internal_roles!inner(is_promote,is_anonymous,promotion_demand)")
    .eq("source_type", "internal").eq("status", "active").not("is_expired", "is", true)
    .eq("company_internal_roles.is_promote", true);
  if (error) throw error;
  const now = Date.now();
  console.log(JSON.stringify((data ?? []).flatMap((role: any) => {
    const internal = Array.isArray(role.company_internal_roles) ? role.company_internal_roles[0] : role.company_internal_roles;
    const demand = internal?.promotion_demand;
    if (role.information?.testOnly === true || role.expires_at && Date.parse(role.expires_at) <= now || !demand || Date.parse(demand.validUntil) <= now) return [];
    return [{ roleId: role.role_id, roleName: role.name, anonymous: internal.is_anonymous === true,
      demand: demand.level, reason: demand.reason, requestedAt: demand.updatedAt, validUntil: demand.validUntil }];
  }), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
