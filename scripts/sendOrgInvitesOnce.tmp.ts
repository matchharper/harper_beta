import { config } from "dotenv";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { sendOrgWorkspaceInvitations } from "@/lib/org/server";

config({ path: ".env.local", quiet: true });

const targets = [
  { email: "uther.kim@gbike.io", workspaceId: "7fb81e49-7e72-40b5-b290-9bd588d3c30c", name: "GBIKE | GCOO", homepage: "https://gcoo.io", linkedin: "https://www.linkedin.com/company/gbikekorea/" },
  { email: "dan@canopy.im", workspaceId: "da2bc254-eb68-4131-ba81-538987a67957", name: "Canopy", homepage: "https://canopy.im", linkedin: "https://www.linkedin.com/company/hellocanopy/" },
  { email: "kevin@stadiumliveapp.com", workspaceId: "1b543a61-425e-4c99-a5fa-e0c6ca5440e8", name: "Stadium Live Studios", homepage: "https://stadiumverse.com/", linkedin: "https://www.linkedin.com/company/stadiumlive" },
  { email: "T.kim@eatsopo.com", workspaceId: "587163e0-0e1b-42cd-8f7e-6321b55c5f14", name: "Sopo", homepage: "http://eatsopo.com", linkedin: "https://www.linkedin.com/company/eatsopo" },
  { email: "y@gaudiolab.com", workspaceId: "d531a3c1-7e52-43e5-acce-9dd2c461d306", name: "가우디오랩", homepage: "https://www.gaudiolab.com/ko", linkedin: "https://www.linkedin.com/company/gaudiolab" },
  { email: "ben.hong@laplacian.cc", workspaceId: "68bd5e4b-3c91-4d38-8e95-110391ff0635", name: "Laplacian Robotics", homepage: "https://www.laplacian.cc/en/", linkedin: "https://www.linkedin.com/company/laplacian-robotics" },
  { email: "kimmy@vooy.com", workspaceId: "204a6717-004d-42a8-8860-99489a0a1b68", name: "vooy", homepage: "https://vooy.com/en", linkedin: "https://www.linkedin.com/company/vooykorea/" },
] as const;

async function main() {
const admin = getSupabaseAdmin();
const { data: authResult, error: authError } = await admin.auth.admin.getUserById(
  "2c3a9d50-d392-4764-8bd1-6d9c036ddc87"
);
if (authError || !authResult.user || authResult.user.email?.toLowerCase() !== "daniel@matchharper.com") {
  throw new Error("Inviter identity mismatch");
}
const user = authResult.user;

// Validate all seven exact workspace records before the first invitation is sent.
for (const target of targets) {
  const { data: workspace, error } = await admin
    .from("company_workspace")
    .select("company_name,homepage_url,linkedin_url,is_internal")
    .eq("company_workspace_id", target.workspaceId)
    .single();
  if (error || !workspace || !workspace.is_internal || workspace.company_name !== target.name ||
      workspace.homepage_url !== target.homepage || workspace.linkedin_url !== target.linkedin) {
    throw new Error(`Workspace mismatch for ${target.email}`);
  }
  const { data: invitations, error: invitationError } = await admin
    .from("company_workspace_invitations")
    .select("invitation_id")
    .ilike("email", target.email)
    .limit(1);
  if (invitationError || (invitations?.length ?? 0) !== 0) {
    throw new Error(`Existing invitation or lookup failure for ${target.email}`);
  }
  const { data: existingUser, error: userError } = await admin
    .from("company_users")
    .select("user_id")
    .ilike("email", target.email)
    .limit(1);
  if (userError || (existingUser?.length ?? 0) !== 0) {
    throw new Error(`Existing company user or lookup failure for ${target.email}`);
  }
  console.log(`PREFLIGHT ${target.email.toLowerCase()} -> ${target.name} (${target.workspaceId}), owner`);
}

if (process.argv.includes("--send")) {
  for (const target of targets) {
    const result = await sendOrgWorkspaceInvitations({
      emails: [target.email],
      role: "owner",
      siteUrl: "https://matchharper.com",
      user,
      workspaceId: target.workspaceId,
    });
    const delivery = result.results[0];
    if (delivery?.status !== "sent") {
      throw new Error(`Invitation failed for ${target.email}: ${delivery?.status ?? "no result"}`);
    }
    const { data: saved, error: savedError } = await admin
      .from("company_workspace_invitations")
      .select("email,company_workspace_id,role,last_sent_at,accepted_at")
      .eq("company_workspace_id", target.workspaceId)
      .ilike("email", target.email)
      .single();
    if (savedError || !saved || saved.role !== "owner" || saved.accepted_at !== null ||
        saved.company_workspace_id !== target.workspaceId || saved.email.toLowerCase() !== target.email.toLowerCase()) {
      throw new Error(`Invitation verification failed for ${target.email}`);
    }
    console.log(`SENT ${target.email.toLowerCase()} -> ${target.name}, owner, ${saved.last_sent_at}`);
  }
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
