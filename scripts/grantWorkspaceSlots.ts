/** Service-role operator tool. Preview is read-only; a stable request ID makes retries safe. */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const value = (name: string) =>
    process.argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const workspaceId = value("workspace");
  const quantity = Number(value("quantity"));
  const grantedBy = value("granted-by")?.trim();
  const reason = value("reason")?.trim();
  const apply = process.argv.includes("--apply");
  const requestId = value("request-id") ?? (apply ? undefined : randomUUID());
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !workspaceId ||
    !uuid.test(workspaceId) ||
    !requestId ||
    !uuid.test(requestId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 2147483647 ||
    !grantedBy ||
    grantedBy.length > 200 ||
    !reason ||
    reason.length > 2000
  ) {
    throw new Error(
      "Use --workspace=<uuid> --quantity=<count> --granted-by=<operator> --reason=<reason> [--request-id=<uuid>] [--apply]. Reuse the preview request ID when applying or retrying."
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Supabase server credentials are required.");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: workspace, error } = await db
    .from("company_workspace")
    .select("company_name,billing_model,billing_started_at")
    .eq("company_workspace_id", workspaceId)
    .single();
  if (error) throw error;
  console.log({
    workspaceId,
    companyName: workspace.company_name,
    requestId,
    quantity,
    creditsPerSlot: 50,
    duration: "One calendar month from grant time (Asia/Seoul)",
    grantedBy,
    reason,
    apply,
  });
  // A retry can read its original grant even if the agreement has since changed.
  if (
    !apply &&
    (!workspace.billing_started_at || workspace.billing_model !== "standard")
  ) {
    throw new Error(
      "This workspace has a legacy or Enterprise agreement. Explicitly enroll it in standard billing before granting slots; this tool does not change its agreement."
    );
  }
  if (!apply) return;
  const { data, error: grantError } = await db.rpc(
    "workspace_billing_grant_slots_v1",
    {
      p_workspace: workspaceId,
      p_request: requestId,
      p_quantity: quantity,
      p_granted_by: grantedBy,
      p_reason: reason,
    }
  );
  if (grantError) throw grantError;
  console.log(data);
}

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : ((error as { message?: string })?.message ?? "Slot grant failed")
  );
  process.exitCode = 1;
});
