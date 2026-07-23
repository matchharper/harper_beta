import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ROLE_ID = "26d82bd5-595d-4fe9-ac7e-ff089ed9a28d";
const COMMIT_RUN_ID = "20260723T105538Z";
const REQUESTED_BY = "kimhojin";
const SELECTED = [
  {
    name: "이은서",
    userId: "69f4a8f1-a09a-478e-95fb-95883446f469",
    reason:
      "Binance Korea/APAC와 Web3 스타트업 생태계에서 커뮤니티, 파트너십, PR, 이벤트를 hands-on으로 운영한 경험이 SBVA Value Creation/Communications 역할과 연결됩니다.",
  },
  {
    name: "Seunghee Agnes Hong",
    userId: "e45f985f-6938-4d56-adea-fe42ef89bc52",
    reason:
      "Burson의 corporate PR·media relations 경험과 블록체인 커뮤니티·콘텐츠 운영 경험이 SBVA 포트폴리오 PR과 커뮤니티 운영 scope에 잘 맞습니다.",
  },
  {
    name: "Minsu Kang",
    userId: "5cf87aad-f9fc-4e38-bbdb-c30e787b7d52",
    reason:
      "비즈니스 기자, VC 인턴, AI/AX market intelligence 경험이 있어 SBVA 포트폴리오사의 기술·시장 내러티브를 정리하는 역할과 연결됩니다.",
  },
  {
    name: "Dahsoam Jeong",
    userId: "f8374ce1-0805-4266-93bc-c8e81873a02e",
    reason:
      "AI/IT 창업교육 파트너십과 브랜드 커뮤니티 운영 경험이 SBVA의 founder community, portfolio support, 이벤트 운영 업무와 연결됩니다.",
  },
  {
    name: "Brasley Byun",
    userId: "7a4aceb2-4161-4f2f-992e-d80d8e677e1e",
    reason:
      "Creator·MCN·brand partnership pipeline과 executive event coordination 경험이 SBVA의 외부 파트너십, 커뮤니티, 이벤트 운영 업무와 연결됩니다.",
  },
];

type AnyRow = Record<string, any>;

function mustEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function artifactDir() {
  return path.resolve(
    process.cwd(),
    "output/internal_role_matching",
    ROLE_ID,
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  );
}

function selectedIds() {
  return SELECTED.map((item) => item.userId);
}

function normalizeCompany(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|llc|co)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

async function queryOrThrow<T = AnyRow>(query: any, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

async function main() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const outDir = artifactDir();
  fs.mkdirSync(outDir, { recursive: true });

  const commitDir = path.resolve(
    process.cwd(),
    "output/internal_role_matching",
    ROLE_ID,
    COMMIT_RUN_ID
  );
  const commitManifest = JSON.parse(
    fs.readFileSync(path.join(commitDir, "run_manifest.json"), "utf8")
  );
  if (commitManifest.status !== "completed_commit_fit") {
    throw new Error("commit_fit run is not complete");
  }

  const ids = selectedIds();
  const [roleRows, workspaceRows, settingsRows, existingRecs, fitRows] =
    await Promise.all([
      queryOrThrow<AnyRow[]>(
        admin
          .from("company_roles")
          .select("role_id,company_workspace_id,status,is_expired,information,updated_at,name")
          .eq("role_id", ROLE_ID),
        "load role"
      ),
      queryOrThrow<AnyRow[]>(
        admin
          .from("company_workspace")
          .select("company_workspace_id,company_name")
          .eq("company_workspace_id", commitManifest.sourceMaterial?.workspace?.company_workspace_id ?? "00000000-0000-0000-0000-000000000000"),
        "load workspace"
      ).catch(() => []),
      queryOrThrow<AnyRow[]>(
        admin
          .from("talent_setting")
          .select("user_id,profile_visibility,get_internal_recommendation,blocked_companies")
          .in("user_id", ids),
        "load settings"
      ),
      queryOrThrow<AnyRow[]>(
        admin
          .from("talent_opportunity_recommendation")
          .select("id,talent_id,role_id,feedback,processed_stage,saved_stage,dismissed_at,recommended_at,discovery_run_id")
          .eq("role_id", ROLE_ID)
          .in("talent_id", ids),
        "load existing recs"
      ),
      queryOrThrow<AnyRow[]>(
        admin
          .from("talent_opportunity_fit")
          .select("talent_id,opportunity_id,kind,label,score,human_label")
          .eq("opportunity_id", ROLE_ID)
          .in("talent_id", ids),
        "load fits"
      ),
    ]);

  const role = roleRows[0];
  if (!role) throw new Error("role not found");
  if (!["active", "top_priority", "paused"].includes(String(role.status))) {
    throw new Error(`role status is not sendable: ${role.status}`);
  }
  if (role.is_expired === true) throw new Error("role is expired");
  if (
    String(role.information?.benchmark?.doNotSend ?? "")
      .trim()
      .toLowerCase() === "true"
  ) {
    throw new Error("role benchmark doNotSend=true");
  }

  const workspace =
    workspaceRows[0] ??
    (
      await queryOrThrow<AnyRow[]>(
        admin
          .from("company_workspace")
          .select("company_workspace_id,company_name")
          .eq("company_workspace_id", role.company_workspace_id),
        "load workspace fallback"
      )
    )[0];
  const blockedCompany = normalizeCompany(workspace?.company_name ?? "SBVA");
  const settingsById = new Map(settingsRows.map((row) => [row.user_id, row]));
  const fitById = new Map(fitRows.map((row) => [row.talent_id, row]));

  const preflight = SELECTED.map((item) => {
    const setting = settingsById.get(item.userId) ?? {};
    const blocked = Array.isArray(setting.blocked_companies)
      ? setting.blocked_companies.map(normalizeCompany)
      : [];
    const fit = fitById.get(item.userId);
    return {
      name: item.name,
      userId: item.userId,
      alreadyRecommended: existingRecs.some((row) => row.talent_id === item.userId),
      profileVisibility: setting.profile_visibility ?? null,
      internalRecommendationEnabled:
        setting.get_internal_recommendation !== false,
      blockedCompany: blocked.includes(blockedCompany),
      fitReady:
        fit?.kind === "codex" &&
        fit?.label === "fit" &&
        Number(fit?.score ?? 0) >= 80,
      humanOverride: Boolean(fit?.human_label),
    };
  });

  const failed = preflight.filter(
    (item) =>
      item.alreadyRecommended ||
      item.profileVisibility === "dont_share" ||
      !item.internalRecommendationEnabled ||
      item.blockedCompany ||
      !item.fitReady ||
      item.humanOverride
  );
  if (failed.length > 0) {
    fs.writeFileSync(
      path.join(outDir, "send_preflight_failed.json"),
      JSON.stringify({ failed, preflight }, null, 2)
    );
    throw new Error(`send preflight failed for ${failed.length} selected candidates`);
  }

  const { queueManualInternalRecommendationRun } = await import(
    "../src/lib/ops/careerServer"
  );

  const queued: AnyRow[] = [];
  for (const item of SELECTED) {
    const before = await queryOrThrow<AnyRow[]>(
      admin
        .from("talent_opportunity_recommendation")
        .select("id,talent_id,role_id")
        .eq("role_id", ROLE_ID)
        .eq("talent_id", item.userId),
      `pre-send duplicate check ${item.name}`
    );
    if (before.length > 0) {
      throw new Error(`duplicate appeared before sending ${item.name}`);
    }

    const result = await queueManualInternalRecommendationRun({
      reason: item.reason,
      requestedBy: REQUESTED_BY,
      roleId: ROLE_ID,
      userId: item.userId,
    });
    if (!result?.ok || result.role?.roleId !== ROLE_ID || !result.run?.id) {
      throw new Error(`unexpected queue result for ${item.name}`);
    }

    const runRows = await queryOrThrow<AnyRow[]>(
      admin
        .from("opportunity_discovery_run")
        .select("id,talent_id,status,error_message,created_at,completed_at,trigger,trigger_payload")
        .eq("id", result.run.id),
      `verify run ${item.name}`
    );
    const run = runRows[0];
    if (!run || run.talent_id !== item.userId) {
      throw new Error(`queued run talent mismatch for ${item.name}`);
    }
    queued.push({
      name: item.name,
      userId: item.userId,
      runId: result.run.id,
      runStatus: run.status,
      roleId: result.role.roleId,
    });
  }

  const runIds = queued.map((item) => item.runId);
  const [runs, recsAfter, deliveries] = await Promise.all([
    queryOrThrow<AnyRow[]>(
      admin
        .from("opportunity_discovery_run")
        .select("id,talent_id,status,error_message,created_at,completed_at,trigger")
        .in("id", runIds),
      "load queued runs"
    ),
    queryOrThrow<AnyRow[]>(
      admin
        .from("talent_opportunity_recommendation")
        .select("id,talent_id,role_id,discovery_run_id,opportunity_type,fit_summary,fit_reasons,tradeoffs,score,created_at")
        .in("discovery_run_id", runIds),
      "load recommendations after queue"
    ),
    queryOrThrow<AnyRow[]>(
      admin
        .from("talent_opportunity_delivery")
        .select("discovery_run_id,talent_id,channel,status,sent_at,error_message,created_at")
        .in("discovery_run_id", runIds),
      "load deliveries after queue"
    ),
  ]);

  const manifest = {
    roleId: ROLE_ID,
    commitRunId: COMMIT_RUN_ID,
    sendRunId: path.basename(outDir),
    executionMode: "send",
    requestedBy: REQUESTED_BY,
    status: "queued_manual_internal_recommendations",
    preflight,
    queued,
    verification: {
      runs,
      recommendationsCreated: recsAfter.length,
      deliveriesCreated: deliveries.length,
      deliveries,
    },
  };
  fs.writeFileSync(
    path.join(outDir, "send_manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "verification.md"),
    [
      "# Send Verification",
      "",
      `- role_id: \`${ROLE_ID}\``,
      `- commit_run_id: \`${COMMIT_RUN_ID}\``,
      `- queued_runs: \`${queued.length}\``,
      `- recommendations_created_at_check_time: \`${recsAfter.length}\``,
      `- deliveries_created_at_check_time: \`${deliveries.length}\``,
      "",
      ...queued.map(
        (item) =>
          `- ${item.name}: run \`${item.runId}\`, status \`${item.runStatus}\``
      ),
    ].join("\n")
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
