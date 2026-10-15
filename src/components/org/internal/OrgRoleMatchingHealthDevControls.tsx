"use client";

import { RoleSearchControls } from "./RoleSearchControls";
import { Activity, Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useOrgAnnouncements } from "@/components/org/announcements";
import { AnnouncementCard } from "@/components/common/AnnouncementCard";
import { DevColorPaletteControls } from "@/components/common/DevColorPaletteControls";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
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
  canRunTalentFirst = false,
}: {
  roles: OrgRole[];
  workspaceId: string;
  canRunTalentFirst?: boolean;
}) {
  const { c } = useOrgLocale();
  const welcomeAnnouncement = useOrgAnnouncements(workspaceId).find(
    (announcement) => announcement.id === "org-welcome-v1"
  );
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const focusOptions: Array<{
    label: string;
    value: OrgRoleMatchingHealthFocus;
  }> = [
    { label: c("전체 통계", "Overview"), value: "overview" },
    {
      label: c("아쉽게 매칭되지 않은 이유", "Near misses"),
      value: "near_matches",
    },
    {
      label: c("매칭 판단 범위와 최신성", "Matching coverage and freshness"),
      value: "matching_coverage",
    },
    {
      label: c("후보자 거절 사유", "Candidate rejection reasons"),
      value: "candidate_feedback",
    },
  ];
  const paletteCopy = {
    title: c("색상 미리보기", "Color preview"),
    labels: {
      current: c("1. 현재", "1. Current"),
      soft: c("2. 누런끼 조금 제거", "2. Less warm"),
      clean: c("3. 누런끼 거의 제거", "3. Neutral"),
      mono: c("4. White · Black · Gray", "4. White · Black · Gray"),
    },
    descriptions: {
      current: c(
        "누런끼를 조금 줄인 기본 배경과 색상을 표시해요.",
        "Current base colors with slightly less warmth."
      ),
      soft: c(
        "전체 기본 색상에 반영된 팔레트예요. ‘현재’와 같은 색상으로 표시해요.",
        "Palette applied to the base UI. Matches Current."
      ),
      clean: c(
        "배경과 글자를 중성 회색에 가깝게, 따뜻한 강조 배경은 더 차분하게 표시해요.",
        "Neutral grays with softer warm accents."
      ),
      mono: c(
        "primary 포인트를 제외한 공통 UI 색상을 흰색·검정·회색으로 표시해요.",
        "White, black, and gray UI colors, except the primary accent."
      ),
    },
    footnote: c(
      "primary는 모든 옵션에서 유지돼요. 이 브라우저의 Career·Org 화면에만 적용되며, ‘현재’를 누르면 원래 색상으로 돌아가요.",
      "The primary accent stays in every option. These changes affect only Career and Org in this browser. Select Current to reset."
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
    c("전체 통계", "Overview");
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
          : c("결과를 불러오지 못했습니다.", "Couldn't load result.")
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
        label={c(
          "Harper 내부 전용 · Dev controls",
          "Harper internal · Dev controls"
        )}
      >
        <div className="relative z-20 space-y-4">
          <DevColorPaletteControls copy={paletteCopy} />
          <div className="flex flex-wrap gap-2">
            <MuteButton type="button" onClick={() => setAnnouncementOpen(true)}>
              {c("Welcome 안내 띄우기", "Show welcome notice")}
            </MuteButton>
            <MuteButton asChild>
              <Link
                href="/org/onboarding-preview"
                target="_blank"
                rel="noopener noreferrer"
                prefetch={false}
              >
                {c("온보딩 조건별 미리보기 열기", "Open onboarding previews")}
              </Link>
            </MuteButton>
          </div>
          {canRunTalentFirst && <RoleSearchControls roles={roles} workspaceId={workspaceId} surface="org" />}
          <OrgBillingDevControls workspaceId={workspaceId} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity aria-hidden className="size-4 text-neutral-muted" />
              <h2 className="text-[14px] font-medium text-neutral-primary">
                {c("Role matching health", "Role matching health")}
              </h2>
            </div>
            <p className="text-[13px] font-light leading-5 text-neutral-muted">
              company-side LLM에는 연결되지 않았으며 데이터도 변경하지 않습니다.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-1.5 text-[12px] text-neutral-muted">
              {c("대상 Role", "Role")}
              <Select
                items={roleOptions}
                onValueChange={(value) => value && setSelectedRoleId(value)}
                value={activeRoleId}
              >
                <SelectTrigger
                  aria-label={c(
                    "Matching health 대상 Role",
                    "Matching health role"
                  )}
                >
                  <SelectValue placeholder={c("Role 선택", "Select role")} />
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
              {c("조회 Focus", "Focus")}
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
                  aria-label={c(
                    "Matching health 조회 Focus",
                    "Matching health focus"
                  )}
                >
                  <SelectValue placeholder={c("Focus 선택", "Select focus")} />
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
              {c("Tool result 불러오기", "Load tool result")}
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
        description={c(
          "아직 company-side LLM에 연결하지 않은 read-tool result 미리보기입니다.",
          "Preview of a read tool result that is not yet connected to the company agent."
        )}
        panelClassName="max-w-[900px]"
        headerClassName="border-b border-neutral-1000-a05"
        bodyClassName="px-4 pb-5 sm:px-5"
        footer={
          result ? (
            <div className="flex justify-end">
              <MuteButton onClick={() => void copyResult()} size="sm">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? c("복사됨", "Copied") : c("텍스트 복사", "Copy text")}
              </MuteButton>
            </div>
          ) : undefined
        }
      >
        <div className="min-h-0 overflow-auto p-5">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-neutral-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {c("Tool result를 불러오는 중", "Loading tool result")}
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
