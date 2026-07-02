import Head from "next/head";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

export const FETCH_LIMIT = 40;
export const OPPORTUNITY_RUN_FETCH_LIMIT = 20;

export type DebugTabId = "calls" | "emails" | "opportunityRuns";

export function debugTabTitle(tab: DebugTabId) {
  if (tab === "emails") return "메일 로그";
  if (tab === "calls") return "콜 로그";
  return "Opportunity Runs";
}

export function debugTabDescription(tab: DebugTabId) {
  if (tab === "emails") {
    return "career 유저에게 저장된 메일 본문과 internal role 제안 메일을 확인합니다.";
  }
  if (tab === "calls") {
    return "talent_calls별로 저장된 통화 transcript와 wrap-up 메시지를 확인합니다.";
  }
  return "최근 opportunity_discovery_run의 추천 저장, 발송, action, partial 사유를 확인합니다.";
}

export function useCanFetchInternal() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  return !authLoading && isInternalEmail(user?.email);
}

export function useDebugCopyToClipboard() {
  return useCallback(
    async (value: string | null | undefined, label: string) => {
      const text = value?.trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        showToast({ message: `${label}을 복사했습니다.`, variant: "white" });
      } catch {
        showToast({ message: "복사하지 못했습니다.", variant: "white" });
      }
    },
    []
  );
}

export function formatAbsoluteKst(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
}

export function formatDateOnlyKst(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}.${values.month}.${values.day}`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 1) return `${remainingSeconds}s`;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function StatTile({
  children,
  label,
  value,
}: {
  children?: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-3 py-2")}>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-neutral-primary">
        {value}
      </div>
      {children ? <div className="mt-2 space-y-1">{children}</div> : null}
    </div>
  );
}

export function FieldRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-1 min-w-0 break-words text-sm text-neutral-primary">
        {value || "-"}
      </div>
    </div>
  );
}

export function SourceLimitNotice() {
  return (
    <div className={cx(opsTheme.errorNotice, "flex items-center gap-2")}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      일부 결과가 디버그 조회 한도를 넘어섰을 수 있습니다. 날짜나 검색어로
      범위를 좁혀 확인하세요.
    </div>
  );
}

export function DebuggingPageShell({
  children,
  filters,
  tab,
}: {
  children: ReactNode;
  filters: ReactNode;
  tab: DebugTabId;
}) {
  return (
    <>
      <Head>
        <title>{`${debugTabTitle(tab)} · Harper Ops`}</title>
        <meta name="description" content="Harper internal debugging tools" />
      </Head>

      <OpsShell compactHeader title="Debugging">
        <section className="space-y-3">
          <div className={cx(opsTheme.panel, "relative z-20 p-4")}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className={opsTheme.eyebrow}>Debugging</div>
                <h1 className="mt-1 text-xl font-semibold text-neutral-primary">
                  {debugTabTitle(tab)}
                </h1>
                <p className="mt-1 text-sm leading-6 text-neutral-muted">
                  {debugTabDescription(tab)}
                </p>
              </div>
            </div>
            {filters}
          </div>

          {children}
        </section>
      </OpsShell>
    </>
  );
}
