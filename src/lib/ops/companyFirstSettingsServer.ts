import { CronExpressionParser } from "cron-parser";
import { InternalApiError } from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type {
  CompanyFirstSettings,
  CompanyFirstSettingsResponse,
} from "@/lib/ops/companyFirstSettings";

export function parseCompanyFirstSettings(
  value: unknown
): CompanyFirstSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InternalApiError(400, "설정 값을 확인해 주세요.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.scheduled_enabled !== "boolean") {
    throw new InternalApiError(400, "정기 검색 상태를 확인해 주세요.");
  }
  const cron =
    typeof input.schedule_cron === "string"
      ? input.schedule_cron.trim().replace(/\s+/g, " ")
      : "";
  if (
    cron.length > 120 ||
    cron.split(" ").length !== 5 ||
    !/^[0-9*/,\-\s]+$/.test(cron)
  ) {
    throw new InternalApiError(
      400,
      "실행 주기는 숫자로 된 5개 cron 필드로 입력해 주세요."
    );
  }
  let zone =
    typeof input.schedule_timezone === "string"
      ? input.schedule_timezone.trim()
      : "";
  try {
    if (!zone || zone.length > 100) throw new Error("missing timezone");
    zone = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions()
      .timeZone;
    CronExpressionParser.parse(cron, { tz: zone }).next();
  } catch {
    throw new InternalApiError(400, "실행 주기와 시간대를 확인해 주세요.");
  }
  const limits: Record<string, number> = {};
  for (const [key, label, maximum] of [
    ["scheduled_role_limit", "정기 검색 인원", 50],
    ["requested_role_limit", "직접 요청 검색 인원", 50],
    ["ready_backlog_limit", "미처리 제안 한도", 500],
  ] as const) {
    const number = input[key];
    if (
      typeof number !== "number" ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > maximum
    ) {
      throw new InternalApiError(
        400,
        `${label}은 1~${maximum} 사이의 정수로 입력해 주세요.`
      );
    }
    limits[key] = number;
  }
  return {
    scheduled_enabled: input.scheduled_enabled,
    schedule_cron: cron,
    schedule_timezone: zone,
    scheduled_role_limit: limits.scheduled_role_limit,
    requested_role_limit: limits.requested_role_limit,
    ready_backlog_limit: limits.ready_backlog_limit,
  };
}

function response(row: {
  company_first: unknown;
  updated_at: string;
}): CompanyFirstSettingsResponse {
  const settings = parseCompanyFirstSettings(row.company_first);
  const expression = CronExpressionParser.parse(settings.schedule_cron, {
    tz: settings.schedule_timezone,
  });
  return {
    settings,
    updatedAt: row.updated_at,
    nextSlots: settings.scheduled_enabled
      ? Array.from({ length: 3 }, () =>
          expression.next().toDate().toISOString()
        )
      : [],
  };
}

export async function fetchCompanyFirstSettings() {
  const { data, error } = await getTalentSupabaseAdmin()
    .from("worker_runtime_settings")
    .select("company_first,updated_at")
    .eq("name", "default")
    .single();
  if (error) throw new Error(error.message);
  return response(data);
}

export async function saveCompanyFirstSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InternalApiError(400, "설정 값을 확인해 주세요.");
  }
  const input = value as Record<string, unknown>;
  const settings = parseCompanyFirstSettings(input.settings);
  if (
    typeof input.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.updatedAt))
  ) {
    throw new InternalApiError(400, "설정을 다시 불러온 뒤 저장해 주세요.");
  }
  const { data, error } = await getTalentSupabaseAdmin()
    .from("worker_runtime_settings")
    .update({ company_first: settings, updated_at: new Date().toISOString() })
    .eq("name", "default")
    .eq("updated_at", input.updatedAt)
    .select("company_first,updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new InternalApiError(
      409,
      "다른 팀원이 설정을 변경했습니다. 다시 불러온 뒤 저장해 주세요."
    );
  }
  return response(data);
}
