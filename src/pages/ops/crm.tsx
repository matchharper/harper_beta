import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { CrmBroadcastWorkspace } from "@/components/ops/crm/CrmBroadcastWorkspace";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import { CrmCampaignStatsPanel } from "@/components/ops/crm/CrmCampaignStatsPanel";
import { Input as UiInput } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsCrmCampaign,
  OpsCrmCampaignPreferredLocale,
  OpsCrmCampaignSaveResponse,
  OpsCrmCampaignStatus,
  OpsCrmCampaignTestEmailResponse,
  OpsCrmCampaignsResponse,
} from "@/lib/ops/crmCampaigns";
import { buildCrmCampaignPreviewDocument } from "@/lib/ops/crmCampaignEmailPreview";
import {
  Copy,
  Laptop,
  LoaderCircle,
  Mails,
  MailPlus,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Smartphone,
} from "lucide-react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignDraft = {
  emailTitle: string;
  htmlContent: string;
  id: string | null;
  maxSendsPerUser: number;
  maxTotalSends: number;
  name: string;
  recipientPreferredLocale: OpsCrmCampaignPreferredLocale | null;
  status: OpsCrmCampaignStatus;
};

type PreviewViewport = "desktop" | "mobile";
type CrmWorkspace = "campaigns" | "broadcasts";
type CampaignStatusFilter = "all" | OpsCrmCampaignStatus;

const EMPTY_DRAFT: CampaignDraft = {
  emailTitle: "",
  htmlContent: "",
  id: null,
  maxSendsPerUser: 1,
  maxTotalSends: 200,
  name: "",
  recipientPreferredLocale: null,
  status: "paused",
};

const STATUS_LABELS: Record<OpsCrmCampaignStatus, string> = {
  active: "진행",
  paused: "중단",
};

const STATUS_CLASSES: Record<OpsCrmCampaignStatus, string> = {
  active: "bg-positive-faded text-positive",
  paused: "bg-critical-faded text-critical",
};

const CRM_WORKSPACE_TABS = [
  {
    icon: <Megaphone className="h-4 w-4" />,
    label: "정기 메일 삽입",
    value: "campaigns",
  },
  {
    icon: <Mails className="h-4 w-4" />,
    label: "단체 메일",
    value: "broadcasts",
  },
] as const;

function campaignToDraft(campaign: OpsCrmCampaign): CampaignDraft {
  return {
    emailTitle: campaign.emailTitle ?? "",
    htmlContent: campaign.htmlContent,
    id: campaign.id,
    maxSendsPerUser: campaign.maxSendsPerUser,
    maxTotalSends: campaign.maxTotalSends,
    name: campaign.name,
    recipientPreferredLocale: campaign.recipientPreferredLocale,
    status: campaign.status,
  };
}

function normalizeDraftForComparison(draft: CampaignDraft) {
  return {
    emailTitle: draft.emailTitle.trim(),
    htmlContent: draft.htmlContent.trim(),
    maxSendsPerUser: Number.isFinite(draft.maxSendsPerUser)
      ? draft.maxSendsPerUser
      : null,
    maxTotalSends: Number.isFinite(draft.maxTotalSends)
      ? draft.maxTotalSends
      : null,
    name: draft.name.trim(),
    recipientPreferredLocale: draft.recipientPreferredLocale,
    status: draft.status,
  };
}

function campaignsMatch(left: CampaignDraft, right: CampaignDraft) {
  return (
    JSON.stringify(normalizeDraftForComparison(left)) ===
    JSON.stringify(normalizeDraftForComparison(right))
  );
}

function CampaignPreview({
  htmlContent,
  viewport,
  onViewportChange,
}: {
  htmlContent: string;
  viewport: PreviewViewport;
  onViewportChange: (viewport: PreviewViewport) => void;
}) {
  const srcDoc = useMemo(
    () => buildCrmCampaignPreviewDocument(htmlContent),
    [htmlContent]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-default">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-neutral-primary">
            실시간 이메일 미리보기
          </div>
          <div className="mt-0.5 text-xs text-neutral-muted">
            본문 아래, Harper 안내 푸터 위에 삽입됩니다.
          </div>
        </div>
        <div className="inline-flex rounded-md bg-bg-weak p-0.5">
          <BareButton
            type="button"
            onClick={() => onViewportChange("desktop")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium",
              viewport === "desktop"
                ? "bg-bg-default text-neutral-primary shadow-sm"
                : "text-neutral-muted"
            )}
          >
            <Laptop className="h-3.5 w-3.5" />
            Desktop
          </BareButton>
          <BareButton
            type="button"
            onClick={() => onViewportChange("mobile")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium",
              viewport === "mobile"
                ? "bg-bg-default text-neutral-primary shadow-sm"
                : "text-neutral-muted"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </BareButton>
        </div>
      </div>
      <div className="overflow-x-auto bg-bg-basement p-4">
        <iframe
          title="CRM campaign email preview"
          srcDoc={srcDoc}
          sandbox=""
          className={cx(
            "mx-auto block h-[680px] border-0 bg-bg-default transition-[width]",
            viewport === "mobile" ? "w-[390px] max-w-full" : "w-full"
          )}
        />
      </div>
    </div>
  );
}

export default function OpsCrmPage() {
  const [campaigns, setCampaigns] = useState<OpsCrmCampaign[]>([]);
  const [workspace, setWorkspace] = useState<CrmWorkspace>("campaigns");
  const [campaignQuery, setCampaignQuery] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] =
    useState<CampaignStatusFilter>("all");
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewport>("desktop");

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchWithInternalAuth<OpsCrmCampaignsResponse>(
        "/api/internal/crm/campaigns"
      );
      setCampaigns(payload.campaigns);
      setDraft((current) => {
        const selected = payload.campaigns.find(
          (campaign) => campaign.id === current.id
        );
        if (selected) return campaignToDraft(selected);
        return payload.campaigns[0]
          ? campaignToDraft(payload.campaigns[0])
          : EMPTY_DRAFT;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "CRM 캠페인을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCampaigns(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCampaigns]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<OpsCrmCampaignSaveResponse>(
        "/api/internal/crm/campaigns",
        {
          body: JSON.stringify({
            htmlContent: draft.htmlContent,
            id: draft.id ?? undefined,
            emailTitle: draft.emailTitle,
            maxSendsPerUser: draft.maxSendsPerUser,
            maxTotalSends: draft.maxTotalSends,
            name: draft.name,
            recipientPreferredLocale: draft.recipientPreferredLocale,
            status: draft.status,
          }),
          headers: { "Content-Type": "application/json" },
          method: draft.id ? "PATCH" : "POST",
        }
      );

      setCampaigns((current) =>
        [
          payload.campaign,
          ...current.filter((campaign) => campaign.id !== payload.campaign.id),
        ].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
        )
      );
      setDraft(campaignToDraft(payload.campaign));
      setNotice(
        payload.campaign.status === "active"
          ? "저장했습니다. 다음 periodic refresh 이메일부터 발송 대상이 됩니다."
          : "저장했습니다. 진행 상태가 아니므로 이메일에는 삽입되지 않습니다."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "CRM 캠페인을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleSendTestEmail = useCallback(async () => {
    setSendingTest(true);
    setError("");
    setNotice("");
    try {
      const payload =
        await fetchWithInternalAuth<OpsCrmCampaignTestEmailResponse>(
          "/api/internal/crm/campaigns/test-email",
          {
            body: JSON.stringify({
              htmlContent: draft.htmlContent,
              id: draft.id ?? undefined,
              emailTitle: draft.emailTitle,
              maxSendsPerUser: draft.maxSendsPerUser,
              maxTotalSends: draft.maxTotalSends,
              name: draft.name,
              recipientPreferredLocale: draft.recipientPreferredLocale,
              status: draft.status,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
      setNotice(`테스트 메일을 ${payload.toEmail}로 보냈습니다.`);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "테스트 메일을 보내지 못했습니다."
      );
    } finally {
      setSendingTest(false);
    }
  }, [draft]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === draft.id) ?? null,
    [campaigns, draft.id]
  );
  const visibleCampaigns = useMemo(() => {
    const query = campaignQuery.trim().toLocaleLowerCase();
    return campaigns.filter((campaign) => {
      if (
        campaignStatusFilter !== "all" &&
        campaign.status !== campaignStatusFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [campaign.name, campaign.emailTitle, campaign.htmlContent].some(
        (value) => value.toLocaleLowerCase().includes(query)
      );
    });
  }, [campaignQuery, campaignStatusFilter, campaigns]);
  const activeCampaignCount = useMemo(
    () => campaigns.filter((campaign) => campaign.status === "active").length,
    [campaigns]
  );
  const pausedCampaignCount = campaigns.length - activeCampaignCount;
  const hasUnsavedCampaignChanges = useMemo(() => {
    if (!draft.id) return !campaignsMatch(draft, EMPTY_DRAFT);
    return selectedCampaign
      ? !campaignsMatch(draft, campaignToDraft(selectedCampaign))
      : true;
  }, [draft, selectedCampaign]);
  const canSave =
    draft.name.trim().length > 0 &&
    draft.htmlContent.trim().length > 0 &&
    draft.emailTitle.trim().length <= 120 &&
    Number.isInteger(draft.maxSendsPerUser) &&
    draft.maxSendsPerUser >= 1 &&
    draft.maxSendsPerUser <= 100 &&
    Number.isInteger(draft.maxTotalSends) &&
    draft.maxTotalSends >= 1 &&
    draft.maxTotalSends <= 1_000_000 &&
    !saving;
  const canSendTest =
    draft.name.trim().length > 0 &&
    draft.htmlContent.trim().length > 0 &&
    !saving &&
    !sendingTest;
  const showSaveButton = saving || hasUnsavedCampaignChanges;

  const startNewCampaign = useCallback(() => {
    setWorkspace("campaigns");
    setDraft(EMPTY_DRAFT);
    setError("");
    setNotice("");
  }, []);

  const duplicateCampaign = useCallback(() => {
    if (!selectedCampaign) return;
    setDraft({
      ...campaignToDraft(selectedCampaign),
      id: null,
      name: `${selectedCampaign.name} 복사본`.slice(0, 120),
      status: "paused",
    });
    setError("");
    setNotice("복사본을 만들었습니다. 내용을 확인한 뒤 저장하세요.");
  }, [selectedCampaign]);

  return (
    <>
      <Head>
        <title>CRM · Harper Ops</title>
      </Head>
      <OpsShell
        title="CRM"
        actions={
          workspace === "campaigns" ? (
            <>
              <MuteButton
                type="button"
                onClick={() => void loadCampaigns()}
                disabled={loading}
                variant="default"
                size="lg"
              >
                <RefreshCw
                  className={cx("h-4 w-4", loading && "animate-spin")}
                />
                새로고침
              </MuteButton>
              <MuteButton
                type="button"
                onClick={startNewCampaign}
                variant="dark"
                size="lg"
              >
                <Plus className="h-4 w-4" />새 캠페인
              </MuteButton>
            </>
          ) : null
        }
      >
        <div className={cx(opsTheme.panel, "mb-5 p-2")}>
          <Tabs
            activeValue={workspace}
            onValueChange={(value) => setWorkspace(value as CrmWorkspace)}
            items={[...CRM_WORKSPACE_TABS]}
            variant="pills"
            size="medium"
            className="sm:w-fit"
          />
        </div>

        {workspace === "broadcasts" ? (
          <CrmBroadcastWorkspace />
        ) : (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className={cx(opsTheme.panel, "p-4")}>
                <div className="text-xs text-neutral-muted">전체 캠페인</div>
                <div className="mt-1 text-2xl font-medium text-neutral-primary">
                  {campaigns.length.toLocaleString()}
                </div>
              </div>
              <div className={cx(opsTheme.panel, "p-4")}>
                <div className="text-xs text-neutral-muted">현재 진행</div>
                <div className="mt-1 text-2xl font-medium text-positive">
                  {activeCampaignCount.toLocaleString()}
                </div>
              </div>
              <div className={cx(opsTheme.panel, "p-4")}>
                <div className="text-xs text-neutral-muted">중단</div>
                <div className="mt-1 text-2xl font-medium text-neutral-primary">
                  {pausedCampaignCount.toLocaleString()}
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className={cx(opsTheme.panel, "min-w-0 p-4")}>
                <div className="flex items-center justify-between border-b border-neutral-1000-a05 px-1 pb-4">
                  <div>
                    <div className={opsTheme.eyebrow}>CAMPAIGNS</div>
                    <div className="mt-1 text-lg font-medium text-neutral-primary">
                      {campaigns.length}개 등록
                    </div>
                  </div>
                  <MailPlus className="h-5 w-5 text-neutral-soft" />
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft"
                      aria-hidden
                    />
                    <UiInput
                      value={campaignQuery}
                      onChange={(event) => setCampaignQuery(event.target.value)}
                      placeholder="캠페인 검색"
                      aria-label="캠페인 검색"
                      className="pl-9"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-bg-weak p-1">
                    {(
                      [
                        ["all", "전체"],
                        ["active", "진행"],
                        ["paused", "중단"],
                      ] as const
                    ).map(([value, label]) => (
                      <MuteButton
                        key={value}
                        type="button"
                        size="sm"
                        variant={
                          campaignStatusFilter === value
                            ? "default"
                            : "transparent"
                        }
                        aria-pressed={campaignStatusFilter === value}
                        onClick={() => setCampaignStatusFilter(value)}
                      >
                        {label}
                      </MuteButton>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid max-h-[760px] gap-2 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-muted">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      불러오는 중...
                    </div>
                  ) : visibleCampaigns.length === 0 ? (
                    <div className="px-3 py-12 text-center text-sm leading-6 text-neutral-muted">
                      {campaigns.length === 0
                        ? "아직 캠페인이 없습니다."
                        : "조건에 맞는 캠페인이 없습니다."}
                    </div>
                  ) : (
                    visibleCampaigns.map((campaign) => {
                      const selected = campaign.id === draft.id;
                      return (
                        <BareButton
                          key={campaign.id}
                          type="button"
                          onClick={() => {
                            setDraft(campaignToDraft(campaign));
                            setError("");
                            setNotice("");
                          }}
                          className={cx(
                            "w-full rounded-md px-3 py-3 text-left transition",
                            selected
                              ? "bg-black text-neutral-00"
                              : "bg-bg-default hover:bg-bg-weak"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {campaign.name}
                              </div>
                              <div
                                className={cx(
                                  "mt-1 text-xs",
                                  selected
                                    ? "text-neutral-00/60"
                                    : "text-neutral-muted"
                                )}
                              >
                                사용자당 {campaign.maxSendsPerUser}회 · 전체{" "}
                                {campaign.maxTotalSends.toLocaleString()}회
                              </div>
                              <div
                                className={cx(
                                  "mt-1 text-xs",
                                  selected
                                    ? "text-neutral-00/60"
                                    : "text-neutral-muted"
                                )}
                              >
                                {campaign.recipientPreferredLocale
                                  ? `preferred locale = ${campaign.recipientPreferredLocale}`
                                  : "모든 preferred locale"}
                              </div>
                            </div>
                            <span
                              className={cx(
                                "shrink-0 rounded px-2 py-1 text-[11px] font-medium",
                                selected
                                  ? "bg-neutral-00/15 text-neutral-00"
                                  : STATUS_CLASSES[campaign.status]
                              )}
                            >
                              {STATUS_LABELS[campaign.status]}
                            </span>
                          </div>
                          <div
                            className={cx(
                              "mt-3 text-[11px]",
                              selected
                                ? "text-neutral-00/50"
                                : "text-neutral-soft"
                            )}
                          >
                            {formatKstRelativeDateTime(campaign.updatedAt)}
                          </div>
                        </BareButton>
                      );
                    })
                  )}
                </div>
              </aside>

              <form
                className="grid min-w-0 gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSave && hasUnsavedCampaignChanges) void handleSave();
                }}
              >
                <section className={cx(opsTheme.panel, "min-w-0 p-5")}>
                  <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mt-1 text-lg font-medium text-neutral-primary">
                        정기 이메일 삽입 캠페인
                      </div>
                      <p className="mt-1 text-xs leading-5 text-neutral-muted">
                        기회 추천 정기 메일의 본문 아래에 캠페인 콘텐츠를
                        덧붙입니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCampaign ? (
                        <MuteButton
                          type="button"
                          onClick={duplicateCampaign}
                          variant="default"
                          size="lg"
                        >
                          <Copy className="h-4 w-4" />
                          복제
                        </MuteButton>
                      ) : null}
                      <MuteButton
                        type="button"
                        onClick={() => void handleSendTestEmail()}
                        disabled={!canSendTest}
                        variant="default"
                        size="lg"
                      >
                        {sendingTest ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        테스트 메일
                      </MuteButton>
                      {showSaveButton ? (
                        <MuteButton
                          type="submit"
                          disabled={!canSave}
                          variant="dark"
                          size="lg"
                        >
                          {saving ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          저장
                        </MuteButton>
                      ) : null}
                    </div>
                  </div>

                  {error ? (
                    <div className={cx(opsTheme.errorNotice, "mt-4")}>
                      {error}
                    </div>
                  ) : null}
                  {notice ? (
                    <div className={cx(opsTheme.successNotice, "mt-4")}>
                      {notice}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-name"
                      >
                        캠페인 이름
                      </label>
                      <UiInput
                        unstyled
                        id="crm-campaign-name"
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        maxLength={120}
                        placeholder="예: 2026 여름 프로필 업데이트"
                        className={cx(opsTheme.input, "mt-2")}
                      />
                    </div>
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-recipient-locale"
                      >
                        발송 대상 조건
                      </label>
                      <div className="relative mt-2">
                        <select
                          id="crm-campaign-recipient-locale"
                          value={draft.recipientPreferredLocale ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              recipientPreferredLocale:
                                (event.target
                                  .value as OpsCrmCampaignPreferredLocale) ||
                                null,
                            }))
                          }
                          className={cx(opsTheme.input, "appearance-none")}
                        >
                          <option value="">모든 preferred locale</option>
                          <option value="ko">preferred locale = ko</option>
                          <option value="en">preferred locale = en</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-email-title"
                      >
                        이메일 제목 추가 텍스트
                      </label>
                      <UiInput
                        unstyled
                        id="crm-campaign-email-title"
                        value={draft.emailTitle}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            emailTitle: event.target.value,
                          }))
                        }
                        maxLength={120}
                        placeholder="예: 프로필 업데이트"
                        className={cx(opsTheme.input, "mt-2")}
                      />
                    </div>
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-total-limit"
                      >
                        전체 최대 발송
                      </label>
                      <div className="relative mt-2">
                        <UiInput
                          unstyled
                          id="crm-campaign-total-limit"
                          type="number"
                          min={1}
                          max={1_000_000}
                          value={draft.maxTotalSends}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              maxTotalSends: Number(event.target.value),
                            }))
                          }
                          className={cx(opsTheme.input, "pr-12")}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-muted">
                          회
                        </span>
                      </div>
                    </div>
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-limit"
                      >
                        사용자별 최대 발송
                      </label>
                      <div className="relative mt-2">
                        <UiInput
                          unstyled
                          id="crm-campaign-limit"
                          type="number"
                          min={1}
                          max={100}
                          value={draft.maxSendsPerUser}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              maxSendsPerUser: Number(event.target.value),
                            }))
                          }
                          className={cx(opsTheme.input, "pr-12")}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-muted">
                          회
                        </span>
                      </div>
                    </div>
                    <div>
                      <label
                        className={opsTheme.label}
                        htmlFor="crm-campaign-status"
                      >
                        상태
                      </label>
                      <div className="relative mt-2">
                        {draft.status === "active" ? (
                          <PlayCircle className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-positive" />
                        ) : (
                          <PauseCircle className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-muted" />
                        )}
                        <select
                          id="crm-campaign-status"
                          value={draft.status}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target
                                .value as OpsCrmCampaignStatus,
                            }))
                          }
                          className={cx(opsTheme.input, "appearance-none pl-9")}
                        >
                          <option value="active">진행</option>
                          <option value="paused">중단</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <label
                          className={opsTheme.label}
                          htmlFor="crm-campaign-html"
                        >
                          삽입 HTML
                        </label>
                        <p className="mt-1 text-xs leading-5 text-neutral-muted">
                          HTML 조각만 입력하세요. 저장된 코드는 이메일 안내 푸터
                          바로 위에 그대로 삽입됩니다.
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-neutral-soft">
                        {draft.htmlContent.length.toLocaleString()} / 100,000
                      </span>
                    </div>
                    <UiTextarea
                      unstyled
                      id="crm-campaign-html"
                      value={draft.htmlContent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          htmlContent: event.target.value,
                        }))
                      }
                      maxLength={100_000}
                      rows={12}
                      spellCheck={false}
                      placeholder={'<div style="padding: 20px;">...</div>'}
                      className={cx(
                        opsTheme.textarea,
                        "mt-2 min-h-[300px] resize-y font-mono text-[13px]"
                      )}
                    />
                  </div>
                </section>

                <CampaignPreview
                  htmlContent={draft.htmlContent}
                  viewport={previewViewport}
                  onViewportChange={setPreviewViewport}
                />
                <CrmCampaignStatsPanel
                  campaignId={draft.id}
                  maxTotalSends={draft.maxTotalSends}
                />
              </form>
            </section>
          </>
        )}
      </OpsShell>
    </>
  );
}
