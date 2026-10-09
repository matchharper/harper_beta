/** Explicit contract migration; defaults to read-only preview. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import {
  billingDb,
  billingRpc,
  getBillingSummary,
  throwBillingDbError,
} from "../src/lib/org/billing/store";
import { syncWorkspaceSubscriptions } from "../src/lib/org/billing/service";
async function main() {
  const value = (name: string) =>
    process.argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const workspaceId = value("workspace");
  const model = value("model");
  const keep = value("keep-role");
  if (!workspaceId || !["free", "scale"].includes(model ?? ""))
    throw new Error(
      "Use --workspace=<uuid> --model=free|scale [--keep-role=<uuid>] [--apply]"
    );
  const { data: workspace, error } = await billingDb()
    .from("company_workspace")
    .select("company_name,billing_model,billing_started_at,stripe_customer_id")
    .eq("company_workspace_id", workspaceId)
    .single();
  throwBillingDbError(error);
  const { data: roles, error: roleError } = await billingDb()
    .from("company_roles")
    .select("role_id,name,status")
    .eq("company_workspace_id", workspaceId)
    .eq("source_type", "internal")
    .in("status", ["active", "open", "top_priority"])
    .not("is_expired", "is", true);
  throwBillingDbError(roleError);
  console.log({
    workspaceId,
    companyName: workspace?.company_name,
    targetModel: model,
    keepRole: keep ?? null,
    activeRoles: roles,
    apply: process.argv.includes("--apply"),
  });
  if (!process.argv.includes("--apply")) return;
  // Discover subscriptions missed by a webhook before changing the contract.
  if (workspace?.stripe_customer_id)
    await syncWorkspaceSubscriptions(workspaceId);
  await billingRpc("workspace_billing_enroll_v1", {
    p_workspace: workspaceId,
    p_model: model === "free" ? "standard" : "scale",
    p_keep_role: keep ?? null,
  });
  console.log(await getBillingSummary(workspaceId));
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Enrollment failed");
  process.exitCode = 1;
});
