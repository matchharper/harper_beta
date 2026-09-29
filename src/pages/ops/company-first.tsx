import Head from "next/head";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { useCanFetchInternal } from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  CompanyFirstSettings,
  CompanyFirstSettingsResponse,
} from "@/lib/ops/companyFirstSettings";

const API = "/api/internal/ops/company-first-settings";
const WEEKDAYS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];
type ScheduleMode = "daily" | "weekly" | "monthly" | "custom";

function scheduleFields(cron: string) {
  const parts = cron.split(" ");
  const [minute, hour, day, month, weekday] = parts;
  const timeValid = /^\d+$/.test(minute) && /^\d+$/.test(hour);
  let mode: ScheduleMode = "custom";
  if (parts.length === 5 && timeValid && month === "*") {
    if (day === "*" && weekday === "*") mode = "daily";
    else if (day === "*" && /^[0-6]$/.test(weekday)) mode = "weekly";
    else if (/^\d+$/.test(day) && weekday === "*") mode = "monthly";
  }
  return {
    mode,
    time: timeValid
      ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
      : "09:00",
    weekday: /^[0-6]$/.test(weekday) ? weekday : "1",
    day: /^\d+$/.test(day) ? day : "1",
  };
}

function cronFromFields(
  mode: ScheduleMode,
  time: string,
  weekday: string,
  day: string
) {
  const [hour, minute] = time.split(":");
  return `${Number(minute)} ${Number(hour)} ${mode === "monthly" ? day : "*"} * ${mode === "weekly" ? weekday : "*"}`;
}

export default function CompanyFirstSettingsPage() {
  const canFetch = useCanFetchInternal();
  const [saved, setSaved] = useState<CompanyFirstSettingsResponse | null>(null);
  const [draft, setDraft] = useState<CompanyFirstSettings | null>(null);
  const [fields, setFields] = useState(() => scheduleFields("0 9 * * 1"));
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
      setFields(scheduleFields(payload.settings.schedule_cron));
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
      setFields(scheduleFields(payload.settings.schedule_cron));
      setNotice(
        "저장했습니다. 예약은 1분 안에, 인원 제한은 다음 검색부터 적용됩니다."
      );
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "설정을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  function setSchedule(change: Partial<ReturnType<typeof scheduleFields>>) {
    if (!draft) return;
    const base =
      fields.mode === "custom" && change.mode && change.mode !== "custom"
        ? scheduleFields(draft.schedule_cron)
        : fields;
    const next = { ...base, ...change };
    setFields(next);
    if (next.mode !== "custom") {
      setDraft({
        ...draft,
        schedule_cron: cronFromFields(
          next.mode,
          next.time,
          next.weekday,
          next.day
        ),
      });
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="schedule-mode"
                      className="text-sm text-neutral-primary"
                    >
                      실행 주기
                    </label>
                    <Select
                      value={fields.mode}
                      onValueChange={(value) => {
                        if (!value) return;
                        setSchedule({ mode: value as ScheduleMode });
                      }}
                    >
                      <SelectTrigger id="schedule-mode">
                        <SelectValue>
                          {
                            {
                              weekly: "매주",
                              daily: "매일",
                              monthly: "매월",
                              custom: "직접 설정",
                            }[fields.mode]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">매주</SelectItem>
                        <SelectItem value="daily">매일</SelectItem>
                        <SelectItem value="monthly">매월</SelectItem>
                        <SelectItem value="custom">직접 설정</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="schedule-timezone"
                      className="text-sm text-neutral-primary"
                    >
                      시간대
                    </label>
                    <Input
                      id="schedule-timezone"
                      required
                      value={draft.schedule_timezone}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          schedule_timezone: event.target.value,
                        })
                      }
                    />
                  </div>
                  {fields.mode !== "custom" ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="schedule-time"
                        className="text-sm text-neutral-primary"
                      >
                        실행 시간
                      </label>
                      <Input
                        id="schedule-time"
                        type="time"
                        required
                        value={fields.time}
                        onChange={(event) =>
                          setSchedule({ time: event.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label
                        htmlFor="schedule-cron"
                        className="text-sm text-neutral-primary"
                      >
                        실행 주기 (분 · 시 · 일 · 월 · 요일)
                      </label>
                      <Input
                        id="schedule-cron"
                        required
                        value={draft.schedule_cron}
                        placeholder="0 9 * * 1-5"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            schedule_cron: event.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                  {fields.mode === "weekly" ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="schedule-weekday"
                        className="text-sm text-neutral-primary"
                      >
                        실행 요일
                      </label>
                      <Select
                        value={fields.weekday}
                        onValueChange={(weekday) => {
                          if (weekday !== null) setSchedule({ weekday });
                        }}
                      >
                        <SelectTrigger id="schedule-weekday">
                          <SelectValue>
                            {WEEKDAYS[Number(fields.weekday)]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((label, index) => (
                            <SelectItem key={index} value={String(index)}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {fields.mode === "monthly" ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="schedule-day"
                        className="text-sm text-neutral-primary"
                      >
                        실행 날짜
                      </label>
                      <Input
                        id="schedule-day"
                        type="number"
                        min={1}
                        max={31}
                        required
                        value={fields.day}
                        onChange={(event) =>
                          setSchedule({ day: event.target.value })
                        }
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ["scheduled_role_limit", "정기 검색 · Role당 최대", 50],
                      ["requested_role_limit", "직접 요청 · Role당 최대", 50],
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
          {saved ? (
            <div className="border-t border-neutral-1000-a10 pt-4 text-sm text-neutral-muted">
              <span className="font-medium text-neutral-primary">
                저장된 다음 예약
              </span>
              {saved.nextSlots.length ? (
                <ul className="mt-2 space-y-1">
                  {saved.nextSlots.map((slot) => (
                    <li key={slot}>
                      {new Intl.DateTimeFormat("ko-KR", {
                        timeZone: saved.settings.schedule_timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(slot))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2">정기 검색 예약 중지</p>
              )}
            </div>
          ) : null}
        </section>
      </OpsShell>
    </>
  );
}
