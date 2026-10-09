import Head from "next/head";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  CompanyFirstSettings,
  CompanyFirstSettingsResponse,
} from "@/lib/ops/companyFirstSettings";

const API = "/api/internal/ops/company-first-settings";
export default function CompanyFirstSettingsPage() {
  const canFetch = useCanFetchInternal();
  const [saved, setSaved] = useState<CompanyFirstSettingsResponse | null>(null);
  const [draft, setDraft] = useState<CompanyFirstSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<CompanyFirstSettingsResponse>(
        API,
        { cache: "no-store" }
      );
      setSaved(payload);
      setDraft(payload.settings);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "설정을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canFetch) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canFetch, load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !saved) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<CompanyFirstSettingsResponse>(
        API,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: draft, updatedAt: saved.updatedAt }),
        }
      );
      setSaved(payload);
      setDraft(payload.settings);
      setNotice(
        "저장했습니다. 정기 검색 예약은 1분 안에, 인원 제한은 다음 검색부터 적용됩니다."
      );
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "설정을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Company-first 검색 · Harper Ops</title>
      </Head>
      <OpsShell compactHeader title="Company-first 검색">
        <section className="max-w-3xl space-y-4 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-neutral-primary">
              Company-first 검색
            </h1>
            <MuteButton
              onClick={() => {
                void load();
              }}
              disabled={!canFetch || loading || saving}
              aria-label="설정 다시 불러오기"
            >
              <RefreshCw className="h-4 w-4" />
            </MuteButton>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-positive">
              {notice}
            </p>
          ) : null}
          {loading && !draft ? (
            <p role="status" className="text-sm text-neutral-muted">
              불러오는 중
            </p>
          ) : null}
          {draft ? (
            <form
              onSubmit={(event) => {
                void save(event);
              }}
            >
              <fieldset
                disabled={loading || saving || !canFetch}
                className="space-y-5"
              >
                <div className="flex items-center justify-between border-b border-neutral-1000-a10 pb-4">
                  <label
                    htmlFor="scheduled-enabled"
                    className="text-sm font-medium text-neutral-primary"
                  >
                    정기 검색 예약
                  </label>
                  <Switch
                    id="scheduled-enabled"
                    checked={draft.scheduled_enabled}
                    onCheckedChange={(value) =>
                      setDraft({ ...draft, scheduled_enabled: value })
                    }
                  />
                </div>
                <p className="text-sm text-neutral-muted">검색 요일과 시간은 각 Role의 Settings에서 설정합니다. 모든 시간은 Asia/Seoul 기준입니다. 아래 인원 설정은 회사 선추천 한도입니다. 후보자 선추천은 역할당 한 번의 검색에서 최대 20명을 선정합니다.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ["scheduled_role_limit", "회사 선추천 · 정기 검색 · Role당 최대", 50],
                      ["requested_role_limit", "회사 선추천 · 직접 요청 · Role당 최대", 50],
                      ["ready_backlog_limit", "회사별 미처리 제안 한도", 500],
                    ] as const
                  ).map(([key, label, maximum]) => (
                    <div key={key} className="space-y-1.5">
                      <label
                        htmlFor={key}
                        className="text-sm text-neutral-primary"
                      >
                        {label}
                      </label>
                      <Input
                        id={key}
                        type="number"
                        min={1}
                        max={maximum}
                        required
                        value={Number.isNaN(draft[key]) ? "" : draft[key]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            [key]: event.target.valueAsNumber,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <MuteButton type="submit" variant="primary" disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "저장 중" : "저장"}
                  </MuteButton>
                </div>
              </fieldset>
            </form>
          ) : null}
        </section>
      </OpsShell>
    </>
  );
}
