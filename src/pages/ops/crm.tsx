import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsCrmCampaign,
  OpsCrmCampaignSaveResponse,
  OpsCrmCampaignStatus,
  OpsCrmCampaignsResponse,
} from "@/lib/ops/crmCampaigns";
import {
  Laptop,
  LoaderCircle,
  MailPlus,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Smartphone,
} from "lucide-react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignDraft = {
  htmlContent: string;
  id: string | null;
  maxSendsPerUser: number;
  name: string;
  status: OpsCrmCampaignStatus;
};

type PreviewViewport = "desktop" | "mobile";

const EMPTY_DRAFT: CampaignDraft = {
  htmlContent: "",
  id: null,
  maxSendsPerUser: 1,
  name: "",
  status: "draft",
};

const EMPTY_PREVIEW_HTML =
  '<div style="padding:20px;border:1px dashed #cbd5e1;color:#94a3b8;text-align:center;">캠페인 HTML 미리보기</div>';

const STATUS_LABELS: Record<OpsCrmCampaignStatus, string> = {
  active: "진행",
  draft: "준비",
  paused: "중단",
};

const STATUS_CLASSES: Record<OpsCrmCampaignStatus, string> = {
  active: "bg-positive-faded text-positive",
  draft: "bg-bg-weak text-neutral-muted",
  paused: "bg-critical-faded text-critical",
};

function campaignToDraft(campaign: OpsCrmCampaign): CampaignDraft {
  return {
    htmlContent: campaign.htmlContent,
    id: campaign.id,
    maxSendsPerUser: campaign.maxSendsPerUser,
    name: campaign.name,
    status: campaign.status,
  };
}

function buildPreviewDocument(htmlContent: string) {
  const campaignHtml = htmlContent.trim() ? htmlContent : EMPTY_PREVIEW_HTML;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #f5f5f4; color: #171717; }
      body { padding: 24px 14px; font-family: Arial, Helvetica, sans-serif; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; }
      .mail { max-width: 640px; margin: 0 auto; background: #ffffff; padding: 28px; }
      .body { font-size: 14px; line-height: 1.4; }
      .placement { margin-top: 24px; }
      .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.6; color: #6b7280; }
      .footer p { margin: 12px 0; }
      .footer a { color: #6b7280; }
    </style>
  </head>
  <body>
    <main class="mail">
      <section class="body">
        <p>안녕하세요, 최근 프로필과 선호를 바탕으로 새로운 기회를 정리했습니다.</p>
        <p>실제 periodic refresh 이메일 본문과 추천 링크가 이 위치까지 표시됩니다.</p>
      </section>
      <section class="placement">${campaignHtml}</section>
      <footer class="footer">
        <p>If you have any issues, feedback, or want someone on the team to take a look, email <a href="mailto:chris@matchharper.com">chris@matchharper.com</a>. Harper is still learning, so it can make mistakes or get details wrong.</p>
        <p>If you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.</p>
      </footer>
    </main>
  </body>
</html>`;
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
    () => buildPreviewDocument(htmlContent),
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
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
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
            maxSendsPerUser: draft.maxSendsPerUser,
            name: draft.name,
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

  const canSave =
    draft.name.trim().length > 0 &&
    draft.htmlContent.trim().length > 0 &&
    Number.isInteger(draft.maxSendsPerUser) &&
    draft.maxSendsPerUser >= 1 &&
    draft.maxSendsPerUser <= 100 &&
    !saving;

  return (
    <>
      <Head>
        <title>CRM · Harper Ops</title>
      </Head>
      <OpsShell
        title="CRM"
        actions={
          <>
            <BareButton
              type="button"
              onClick={() => void loadCampaigns()}
              disabled={loading}
              className={cx(opsTheme.buttonSecondary, "h-10")}
            >
              <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
              새로고침
            </BareButton>
            <BareButton
              type="button"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setError("");
                setNotice("");
              }}
              className={cx(opsTheme.buttonPrimary, "h-10")}
            >
              <Plus className="h-4 w-4" />새 캠페인
            </BareButton>
          </>
        }
      >
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
            <div className="mt-3 grid max-h-[760px] gap-2 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : campaigns.length === 0 ? (
                <div className="px-3 py-12 text-center text-sm leading-6 text-neutral-muted">
                  아직 캠페인이 없습니다.
                </div>
              ) : (
                campaigns.map((campaign) => {
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
                            사용자당 최대 {campaign.maxSendsPerUser}회
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
                          selected ? "text-neutral-00/50" : "text-neutral-soft"
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
              if (canSave) void handleSave();
            }}
          >
            <section className={cx(opsTheme.panel, "min-w-0 p-5")}>
              <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className={opsTheme.eyebrow}>
                    {draft.id ? "EDIT CAMPAIGN" : "NEW CAMPAIGN"}
                  </div>
                  <div className="mt-1 text-lg font-medium text-neutral-primary">
                    Periodic refresh 이메일 삽입 콘텐츠
                  </div>
                </div>
                <BareButton
                  type="submit"
                  disabled={!canSave}
                  className={cx(opsTheme.buttonPrimary, "h-10")}
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  저장
                </BareButton>
              </div>

              {error ? (
                <div className={cx(opsTheme.errorNotice, "mt-4")}>{error}</div>
              ) : null}
              {notice ? (
                <div className={cx(opsTheme.successNotice, "mt-4")}>
                  {notice}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                <div>
                  <label className={opsTheme.label} htmlFor="crm-campaign-name">
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
                          status: event.target.value as OpsCrmCampaignStatus,
                        }))
                      }
                      className={cx(opsTheme.input, "appearance-none pl-9")}
                    >
                      <option value="draft">준비</option>
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
          </form>
        </section>
      </OpsShell>
    </>
  );
}
