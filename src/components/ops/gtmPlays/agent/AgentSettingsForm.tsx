import { useState, type ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { AgentSendMode, AgentSettings, AgentSourceSetting } from "@/lib/gtmPlays/agent/types";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Hint, TextInput } from "../ui";
import { sourceLabel } from "./labels";

/**
 * The sources the agent can search today (ids by domain, agent/sources.ts). A source someone saved earlier that is
 * not in this list still shows, so nothing set is ever hidden.
 */
export const AGENT_SETTING_SOURCES: readonly string[] = ["linkedin", "threads"];

/**
 * Same rule as the sender check before sending (agent/mailRules.ts agentSenderProblem): a name and an address are
 * needed, any domain. Kept here until that file is merged.
 */
export function agentSenderWarning(name: string | null | undefined, email: string | null | undefined): string | null {
  if (!name?.trim() || !email?.trim()) return "발송 꺼짐: 보내는 주소를 넣어 주세요";
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) return "보내는 메일 주소 형식이 아니에요.";
  return null;
}

const HINTS = {
  enabled: "끄면 에이전트가 사람을 찾지도, 연락하지도 않아요. 긴급 중지도 이걸 꺼요.",
  sender: "에이전트 메일의 보내는 사람이에요. 답장도 이 주소로 와요.",
  dailyMailCap: "하루(한국 시간)에 에이전트가 보내는 메일 수 상한이에요. 넘으면 다음 날 보내요.",
  dailyCostUsd: "하루에 쓰는 비용(검색·이메일 찾기·글쓰기) 상한이에요. 닿으면 그날 실행을 멈춰요.",
  hours: "메일은 이 시간(한국 시간) 안에서만 나가요. 밖이면 초안까지만 만들고 기다려요.",
  sendMode: "자동: 쓴 메일이 보내는 시간·하루 한도 안에서 바로 나가요. 보내기 전 승인: 모든 메일이 '승인 기다리는 메일'에서 Ops가 승인해야 나가요.",
  followupDays: "연락 뒤 반응이 없으면 이만큼 지나서 후속 메시지를 1번 보내요. 그래도 없으면 끝내요.",
  quietDays: "끝난 사람에게는 이만큼 동안 다시 연락하지 않아요. 그 뒤 새 글을 올리면 다시 대상이 돼요.",
  ownDomain: "본인 이름 도메인 주소(예: me@이름.dev)를 본인이 직접 공개한 경우에만 메일을 보내요. 끄면 개인 메일(gmail 등)만 써요.",
  sources: "에이전트가 구직 글·프로필을 찾는 곳(도메인)과 하루에 찾는 사람 수예요. 링크드인 지원자 파일은 따로 올려요. 연락은 이메일로만 해요.",
} as const;

type Draft = Omit<AgentSettings, "updatedAt" | "version">;

const SEND_MODES: Array<{ value: AgentSendMode; label: string }> = [
  { value: "auto", label: "자동으로 보내기" },
  { value: "approve", label: "보내기 전 승인" },
];

const OFF: AgentSourceSetting = { enabled: false, daily: 30 };

function NumberInput({ value, onChange, min, max, step = 1, className }: {
  value: number; onChange: (value: number) => void; min: number; max: number; step?: number; className?: string;
}) {
  return (
    <TextInput
      type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""}
      onChange={(event) => onChange(Number(event.target.value))} className={cx("w-24", className)}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[12px] text-neutral-muted">{label}<Hint label={label} text={hint} /></span>
      {children}
    </div>
  );
}

/** #5 설정: every setting of the agent, saved together. */
export default function AgentSettingsForm({ settings, writes, onSaved }: {
  settings: AgentSettings; writes: boolean; onSaved: (settings: AgentSettings) => void;
}) {
  // The parent remounts this form (key) when saved settings change, so the draft starts from them.
  const [draft, setDraft] = useState<Draft>(() => {
    const { updatedAt: _updatedAt, version: _version, ...rest } = settings;
    return rest;
  });
  const sourceIds = [...new Set([...AGENT_SETTING_SOURCES, ...Object.keys(draft.sources)])];
  const save = useGtmAction<{ settings: AgentSettings }>();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setSource = (source: string, patch: Partial<AgentSourceSetting>) =>
    setDraft((current) => ({ ...current, sources: { ...current.sources, [source]: { ...(current.sources[source] ?? OFF), ...patch } } }));
  const warning = agentSenderWarning(draft.senderName, draft.senderEmail);
  const submit = async () => {
    const result = await save.run("agent.settings.save", draft as unknown as Record<string, unknown>);
    if (result) onSaved(result.settings);
  };
  return (
    <div className="space-y-4">
      {warning ? <p className={opsTheme.errorNotice}>{warning}</p> : null}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => set("enabled", event.target.checked)} />
          에이전트 켜기 <Hint label="에이전트 켜기" text={HINTS.enabled} />
        </label>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[12px] text-neutral-muted">보내는 방식<Hint label="보내는 방식" text={HINTS.sendMode} /></span>
          {SEND_MODES.map((mode) => (
            <label key={mode.value} className="flex items-center gap-1.5">
              <input type="radio" name="agent-send-mode" checked={draft.sendMode === mode.value} onChange={() => set("sendMode", mode.value)} />
              {mode.label}
            </label>
          ))}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="보내는 사람 이름" hint={HINTS.sender}>
          <TextInput value={draft.senderName ?? ""} onChange={(event) => set("senderName", event.target.value || null)} />
        </Field>
        <Field label="보내는 메일 주소" hint={HINTS.sender}>
          <TextInput value={draft.senderEmail ?? ""} onChange={(event) => set("senderEmail", event.target.value || null)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field label="하루 메일 수" hint={HINTS.dailyMailCap}>
          <NumberInput value={draft.dailyMailCap} min={0} max={500} onChange={(value) => set("dailyMailCap", value)} />
        </Field>
        <Field label="하루 비용 상한($)" hint={HINTS.dailyCostUsd}>
          <NumberInput value={draft.dailyCostUsd} min={0} max={1000} step={0.5} onChange={(value) => set("dailyCostUsd", value)} />
        </Field>
        <Field label="보내는 시간(한국 시간)" hint={HINTS.hours}>
          <span className="flex items-center gap-1 text-sm">
            <NumberInput value={draft.sendStartHour} min={0} max={23} onChange={(value) => set("sendStartHour", value)} className="w-20" />
            시 ~
            <NumberInput value={draft.sendEndHour} min={1} max={24} onChange={(value) => set("sendEndHour", value)} className="w-20" />
            시
          </span>
        </Field>
        <Field label="후속 메시지(일 뒤)" hint={HINTS.followupDays}>
          <NumberInput value={draft.followupDays} min={1} max={60} onChange={(value) => set("followupDays", value)} />
        </Field>
        <Field label="끝난 뒤 쉬는 기간(일)" hint={HINTS.quietDays}>
          <NumberInput value={draft.quietDaysAfterEnd} min={0} max={365} onChange={(value) => set("quietDaysAfterEnd", value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.ownDomainAllowed} onChange={(event) => set("ownDomainAllowed", event.target.checked)} />
          본인이 공개한 본인 도메인 주소 쓰기 <Hint label="본인 도메인" text={HINTS.ownDomain} />
        </label>
      </div>
      <div>
        <span className="mb-1 flex items-center gap-1 text-[12px] text-neutral-muted">사람 찾는 곳<Hint label="사람 찾는 곳" text={HINTS.sources} /></span>
        <div className="flex flex-wrap gap-4 text-sm">
          {sourceIds.map((source) => {
            const setting = draft.sources[source] ?? OFF;
            return (
              <span key={source} className="flex items-center gap-2">
                <input type="checkbox" checked={setting.enabled} onChange={(event) => setSource(source, { enabled: event.target.checked })} />
                {sourceLabel(source)}
                <NumberInput value={setting.daily} min={0} max={500} onChange={(value) => setSource(source, { daily: value })} className="w-20" />
                명/일
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={save.loading} disabled={!writes} onClick={() => void submit()}>설정 저장</Button>
        <span className="text-[12px] text-neutral-muted">
          {writes ? "저장하면 다음 실행부터 적용돼요." : "이 서버는 쓰기가 꺼져 있어서 저장할 수 없어요."}
          {settings.updatedAt ? ` 마지막 저장 ${formatKst(settings.updatedAt)} · 버전 ${settings.version}` : ""}
        </span>
      </div>
      <ErrorNotice message={save.error} />
    </div>
  );
}
