"use client";

import { Activity, Check, Copy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useOrgAnnouncements } from "@/components/org/announcements";
import { AnnouncementCard } from "@/components/common/AnnouncementCard";
import { DevColorPaletteControls } from "@/components/common/DevColorPaletteControls";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { OrgBillingDevControls } from "@/components/org/internal/OrgBillingDevControls";
import { MuteButton } from "@/components/ui/button";
import { Code } from "@/components/ui/code";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgRoleMatchingHealthFocus,
  OrgRoleMatchingHealthToolResult,
} from "@/lib/org/agent/roleMatchingHealth";
import type { OrgRole } from "@/lib/org/server";

export function OrgRoleMatchingHealthDevControls({
  roles,
  workspaceId,
}: {
  roles: OrgRole[];
  workspaceId: string;
}) {
  const t = useOrgT();
  const welcomeAnnouncement = useOrgAnnouncements(workspaceId).find(
    (announcement) => announcement.id === "org-welcome-v1"
  );
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const focusOptions: Array<{
    label: string;
    value: OrgRoleMatchingHealthFocus;
  }> = [
    { label: t("dev.health.overview", "전체 통계"), value: "overview" },
    {
      label: t("dev.health.nearMatches", "아쉽게 매칭되지 않은 이유"),
      value: "near_matches",
    },
    {
      label: t("dev.health.coverage", "매칭 판단 범위와 최신성"),
      value: "matching_coverage",
    },
    {
      label: t("dev.health.feedback", "후보자 거절 사유"),
      value: "candidate_feedback",
    },
  ];
  const paletteCopy = {
    title: t("dev.palette.title", "색상 미리보기"),
    labels: {
      current: t("dev.palette.current", "1. 현재"),
      soft: t("dev.palette.soft", "2. 누런끼 조금 제거"),
      clean: t("dev.palette.clean", "3. 누런끼 거의 제거"),
      mono: t("dev.palette.mono", "4. White · Black · Gray"),
    },
    descriptions: {
      current: t(
        "dev.palette.currentDescription",
        "누런끼를 조금 줄인 기본 배경과 색상을 표시해요."
      ),
      soft: t(
        "dev.palette.softDescription",
        "전체 기본 색상에 반영된 팔레트예요. ‘현재’와 같은 색상으로 표시해요."
      ),
      clean: t(
        "dev.palette.cleanDescription",
        "배경과 글자를 중성 회색에 가깝게, 따뜻한 강조 배경은 더 차분하게 표시해요."
      ),
      mono: t(
        "dev.palette.monoDescription",
        "primary 포인트를 제외한 공통 UI 색상을 흰색·검정·회색으로 표시해요."
      ),
    },
    footnote: t(
      "dev.palette.footnote",
      "primary는 모든 옵션에서 유지돼요. 이 브라우저의 Career·Org 화면에만 적용되며, ‘현재’를 누르면 원래 색상으로 돌아가요."
    ),
  };
  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: role.name, value: role.roleId })),
    [roles]
  );
  const [selectedRoleId, setSelectedRoleId] = useState(
    roleOptions[0]?.value ?? ""
  );
  const [selectedFocus, setSelectedFocus] =
    useState<OrgRoleMatchingHealthFocus>("overview");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrgRoleMatchingHealthToolResult | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const activeRoleId = roleOptions.some((role) => role.value === selectedRoleId)
    ? selectedRoleId
    : (roleOptions[0]?.value ?? "");
  const selectedRole = roles.find((role) => role.roleId === activeRoleId);
  const selectedFocusLabel =
    focusOptions.find((option) => option.value === selectedFocus)?.label ??
    t("dev.health.overview", "전체 통계");
  const formattedResult = result ?? "";

  const loadResult = async () => {
    if (!activeRoleId || loading) return;
    setDialogOpen(true);
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const params = new URLSearchParams({
        focus: selectedFocus,
        roleId: activeRoleId,
        workspaceId,
      });
      const payload =
        await fetchWithInternalAuth<OrgRoleMatchingHealthToolResult>(
          `/api/org/dev/role-matching-health?${params.toString()}`
        );
      setResult(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("dev.health.loadError", "결과를 불러오지 못했습니다.")
      );
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!formattedResult) return;
    await navigator.clipboard.writeText(formattedResult);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <>
      <InternalOnlySurface
        className="border-y border-neutral-1000-a10 bg-bg-default px-4 pb-5 pt-12 sm:px-5"
        label={t("dev.health.internal", "Harper 내부 전용 · Dev controls")}
      >
        <div className="relative z-20 space-y-4">
          <DevColorPaletteControls copy={paletteCopy} />
          <MuteButton type="button" onClick={() => setAnnouncementOpen(true)}>
            {t("dev.announcement.preview", "Welcome 안내 띄우기")}
          </MuteButton>
          <OrgBillingDevControls workspaceId={workspaceId} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity aria-hidden className="size-4 text-neutral-muted" />
              <h2 className="text-[14px] font-medium text-neutral-primary">
                {t("dev.health.title", "Role matching health")}
              </h2>
            </div>
            <p className="text-[13px] font-light leading-5 text-neutral-muted">
              {t(
                "dev.health.description",
                "Role과 focus를 선택해 read-tool result를 미리 봅니다. 아직 company-side LLM에는 연결되지 않았으며 데이터도 변경하지 않습니다."
              )}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-1.5 text-[12px] text-neutral-muted">
              {t("dev.health.role", "대상 Role")}
              <Select
                items={roleOptions}
                onValueChange={(value) => value && setSelectedRoleId(value)}
                value={activeRoleId}
              >
                <SelectTrigger
                  aria-label={t(
                    "dev.health.roleAria",
                    "Matching health 대상 Role"
                  )}
                >
                  <SelectValue
                    placeholder={t("dev.health.rolePlaceholder", "Role 선택")}
                  />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid min-w-0 gap-1.5 text-[12px] text-neutral-muted">
              {t("dev.health.focus", "조회 Focus")}
              <Select
                items={focusOptions}
                onValueChange={(value) => {
                  if (focusOptions.some((option) => option.value === value)) {
                    setSelectedFocus(value as OrgRoleMatchingHealthFocus);
                  }
                }}
                value={selectedFocus}
              >
                <SelectTrigger
                  aria-label={t(
                    "dev.health.focusAria",
                    "Matching health 조회 Focus"
                  )}
                >
                  <SelectValue
                    placeholder={t("dev.health.focusPlaceholder", "Focus 선택")}
                  />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {focusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <MuteButton
              disabled={!activeRoleId || loading}
              onClick={() => void loadResult()}
              size="lg"
              variant="dark"
            >
              {loading ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : null}
              {t("dev.health.load", "Tool result 불러오기")}
            </MuteButton>
          </div>
        </div>
      </InternalOnlySurface>

      {welcomeAnnouncement && (
        <AnnouncementCard
          open={announcementOpen}
          onClose={() => setAnnouncementOpen(false)}
          title={welcomeAnnouncement.title}
          media={welcomeAnnouncement.media}
          action={welcomeAnnouncement.action}
          closeLabel={t("dev.announcement.close", "안내 닫기")}
        >
          {welcomeAnnouncement.description}
        </AnnouncementCard>
      )}

      <TalentCareerModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mobileBottomSheet
        title={
          <>
            {selectedRole?.name ?? "Role"} · {selectedFocusLabel}
          </>
        }
        description={t(
          "dev.health.dialogDescription",
          "아직 company-side LLM에 연결하지 않은 read-tool result 미리보기입니다."
        )}
        panelClassName="max-w-[900px]"
        headerClassName="border-b border-neutral-1000-a05"
        bodyClassName="px-4 pb-5 sm:px-5"
        footer={
          result ? (
            <div className="flex justify-end">
              <MuteButton onClick={() => void copyResult()} size="sm">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied
                  ? t("dev.health.copied", "복사됨")
                  : t("dev.health.copy", "텍스트 복사")}
              </MuteButton>
            </div>
          ) : undefined
        }
      >
        <div className="min-h-0 overflow-auto p-5">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-neutral-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t("dev.health.loading", "Tool result를 불러오는 중")}
            </div>
          ) : null}
          {!loading && error ? (
            <div className="rounded-md border border-critical/30 bg-critical-faded p-4 text-sm text-critical">
              {error}
            </div>
          ) : null}
          {!loading && result ? (
            <Code className="overflow-visible whitespace-pre-wrap" type="block">
              {formattedResult}
            </Code>
          ) : null}
        </div>
      </TalentCareerModal>
    </>
  );
}
