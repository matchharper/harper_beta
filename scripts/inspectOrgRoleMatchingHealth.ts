import dotenv from "dotenv";
import { isInternalDomainEmail } from "../src/lib/internalAccess";

dotenv.config({ path: ".env.local", quiet: true });

type Options = {
  maxRows?: number;
  roleId: string;
  userId?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function usage() {
  return [
    "Usage:",
    "  pnpm exec tsx scripts/inspectOrgRoleMatchingHealth.ts <role-id>",
    "  pnpm exec tsx scripts/inspectOrgRoleMatchingHealth.ts <role-id> --user-id=<company-user-id>",
    "",
    "Options:",
    "  --max-rows=<number>             Maximum fit/recommendation rows to inspect",
    "  --user-id=<uuid>                Company member actor; otherwise an owner/admin/member is selected",
  ].join("\n");
}

function optionValue(arguments_: string[], name: string) {
  return text(
    arguments_
      .find((argument) => argument.startsWith(`${name}=`))
      ?.slice(name.length + 1)
  );
}

function parseArgs(arguments_: string[]): Options | null {
  if (arguments_.includes("--help") || arguments_.includes("-h")) return null;
  const roleId = text(arguments_.find((argument) => !argument.startsWith("--")));
  if (!roleId) throw new Error(usage());

  const maxRowsValue = optionValue(arguments_, "--max-rows");
  const maxRows = maxRowsValue ? Number(maxRowsValue) : undefined;
  if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows <= 0)) {
    throw new Error("--max-rows must be a positive integer");
  }

  return {
    maxRows,
    roleId,
    userId: optionValue(arguments_, "--user-id") || undefined,
  };
}

function membershipRank(membership: {
  authority?: string | null;
  role?: string | null;
}) {
  const value = text(membership.authority || membership.role).toLowerCase();
  if (value === "owner") return 0;
  if (value === "admin") return 1;
  if (value === "member") return 2;
  return 3;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.log(usage());
    return;
  }

  const [{ getSupabaseAdmin }, { getOrgRoleMatchingHealthToolResult }] =
    await Promise.all([
      import("../src/lib/server/candidateAccess"),
      import("../src/lib/org/agent/roleMatchingHealthServer"),
    ]);
  const admin = getSupabaseAdmin();
  const { data: role, error: roleError } = await admin
    .from("company_roles")
    .select("role_id, company_workspace_id, name, source_type")
    .eq("role_id", options.roleId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error(`Role not found: ${options.roleId}`);
  if (role.source_type !== "internal") {
    throw new Error("Matching-health inspection currently supports internal Roles only");
  }

  let userId = options.userId;
  if (!userId) {
    const { data: memberships, error: membershipError } = await admin
      .from("company_user_workspace")
      .select("company_user_id, authority, role")
      .eq("company_workspace_id", role.company_workspace_id);
    if (membershipError) throw membershipError;
    const sortedMemberships = [...(memberships ?? [])].sort(
      (left, right) => membershipRank(left) - membershipRank(right)
    );
    for (const membership of sortedMemberships) {
      const authResult = await admin.auth.admin.getUserById(
        membership.company_user_id
      );
      if (!authResult.error && authResult.data.user) {
        userId = authResult.data.user.id;
        break;
      }
    }
  }
  if (!userId) throw new Error("No active company workspace member was found");

  const authResult = await admin.auth.admin.getUserById(userId);
  if (authResult.error) throw authResult.error;
  if (!authResult.data.user) throw new Error(`Auth user not found: ${userId}`);
  if (!isInternalDomainEmail(authResult.data.user.email)) {
    const { data: membership, error: membershipError } = await admin
      .from("company_user_workspace")
      .select("id")
      .eq("company_workspace_id", role.company_workspace_id)
      .eq("company_user_id", authResult.data.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("Workspace access denied");
  }

  console.error(
    `Read-only matching-health inspection: ${role.name} (${role.role_id})`
  );
  const result = await getOrgRoleMatchingHealthToolResult({
    admin,
    maxRows: options.maxRows,
    roleId: role.role_id,
    workspaceId: role.company_workspace_id,
  });
  console.log(result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
