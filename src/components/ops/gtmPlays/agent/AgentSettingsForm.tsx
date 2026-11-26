import { useState, type ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  CHANNEL_DAILY_MAX_LIMITS, CHANNEL_LABELS, COMPANY_CHANNELS, FILL_CHANNELS, MAIN_CHANNELS, REQUEST_CHANNELS, hasDailyMax, type AgentChannelKey,
  type ChannelSetting,
} from "@/lib/gtmPlays/agent/channels";
import { clampSendHours, SEND_HOURS_LIMIT } from "@/lib/gtmPlays/agent/people";
import { normalizeDomain, signalSourceInfo, type SignalSourceGroup } from "@/lib/gtmPlays/agent/signals";
import { defaultSignalSourceSetting, type SignalSourceSetting } from "@/lib/gtmPlays/agent/tuning";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { ChannelBrake } from "@/lib/gtmPlays/agent/store.server";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Hint, TextInput } from "../ui";
import { WEEKDAYS, sourceLabel } from "./labels";

const GROUP_LABEL: Record<SignalSourceGroup, string> = { sns: "SNS", community: "개발자 커뮤니티", blog: "블로그", web: "직접 추가한 곳" };
const GROUPS: SignalSourceGroup[] = ["sns", "community", "blog", "web"];
const groupOf = (source: string): SignalSourceGroup => {
  try {
    return signalSourceInfo(source).group;
  } catch {
    return "web";
  }
};

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
  sender: "에이전트 메일의 보내는 사람이에요. 답장도 이 주소로 와요.",
  dailyMailCap: "하루에 보낼 메일 수예요. 후보 메일(첫 메일 + 후속 메일)과 회사 메일을 각각 이만큼 보내고, Ashley 답장은 세지 않아요.",
  dailyCostUsd: "하루 비용 상한이에요(Ashley 답장 비용은 빼요). 닿으면 그날은 찾기·보내기를 멈춰요.",
  hours: "고른 요일·시간(한국 시간)에만 메일을 보내요. 새 사람 찾기와 메일 쓰기도 고른 요일에만 해요. 시간은 8시~21시 안에서만 골라요.",
  followupDays: "메일을 보낸 뒤 반응이 없으면 이만큼 지나서 후속 메일을 한 번 보내요. 그래도 없으면 끝내요.",
  quietDays: "끝난 사람에게는 이 기간 동안 다시 연락하지 않아요.",
  search: "에이전트가 사람을 어디서 찾을지 정해요. 링크드인 지원자 파일은 위에서 따로 올려요.",
  sources: "체크한 곳과 목록 밖 웹에서 사람을 찾아요. 곳마다 검색 예산은 에이전트가 지난 결과를 보고 매일 나눠요.",
  blocked: "여기 넣은 도메인에서는 검색하지도, 사람을 남기지도 않아요. 이 도메인의 주소나 이 도메인 회사에 다니는 후보, 이 회사의 채용 글에도 메일을 보내지 않아요.",
  newDomains: "최근 목록 밖 웹에서 사람을 찾은 도메인이에요. '목록에 넣기'는 1번에, '막기'는 2번에 넣어요.",
  channels: "에이전트가 사람을 찾는 길이에요. 끈 채널의 사람에게는 메일을 쓰지도 보내지도 않아요.",
  mainChannels: "하루 메일 수 안에서 보내요.",
  fillChannels: "채널마다 하루 최대만큼만 보내요(후속 메일 포함, 0~100통).",
  requestChannels: "공고 페이지에서 '비슷한 공고 추천받기'를 누른 분에게 바로 보내는 메일이에요. 하루 최대만큼만 받고 보내요(후속 메일 포함, 0~100통). 끄면 공고 페이지에서 버튼이 사라져요.",
  companyChannels: "채용 글을 올린 회사의 대표·리더에게 보내는 회사 메일이에요. 하루 최대만큼만 보내요(후속 메일 포함, 0~100통).",
  addresses: "treg로 이메일 찾기: 유료 찾기로 쓸 주소를 못 찾은 사람에게 treg에 한 번 더 물어요. 한 사람에 최대 $0.35예요. 지금 회사 메일 주소로도 보내기: LinkedIn에 적힌 지금 회사의 도메인 주소에도 보내요. 구조조정 검색으로 찾은 사람과 info@, jobs@ 같은 공용 주소에는 보내지 않아요. 둘 다 끄면 개인 메일과 본인 도메인 주소에만 보내요.",
} as const;

/** 채널's groups, in the queue's order (agent/channels.ts): the existing channels, the new ones, the job-page requests, then the company side. */
const CHANNEL_GROUPS: ReadonlyArray<{ label: string; hint: string; keys: readonly AgentChannelKey[] }> = [
  { label: "기본", hint: HINTS.mainChannels, keys: MAIN_CHANNELS },
  { label: "보충", hint: HINTS.fillChannels, keys: FILL_CHANNELS },
  { label: "공고 페이지", hint: HINTS.requestChannels, keys: REQUEST_CHANNELS },
  { label: "회사 쪽", hint: HINTS.companyChannels, keys: COMPANY_CHANNELS },
];

const clampDailyMax = (value: number) =>
  Math.min(CHANNEL_DAILY_MAX_LIMITS.max, Math.max(CHANNEL_DAILY_MAX_LIMITS.min, Math.round(Number.isFinite(value) ? value : 0)));

/** What the form edits: everything but the on/off (only the switch changes it) and the version (sent apart). */
type Draft = Omit<AgentSettings, "updatedAt" | "version" | "enabled">;

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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[12px] text-neutral-muted">{label}{hint ? <Hint label={label} text={hint} /> : null}</span>
      {children}
    </div>
  );
}

/**
 * 설정: everything the agent runs with, saved together as the next version: the sender, caps and hours, and 검색 관련
 * 설정 (Shaun 11/17): 1. 기본으로 찾는 곳 (the default list, all on, plus domains Ops adds) with its share of the search
 * budget in the heading (the rest searches the web outside the list), and 2. 막을 도메인. The 찾는 기준 has no screen:
 * the code defaults apply. A save carries the version the form was loaded from; the server turns away a save from an
 * older screen, and never changes the on/off from here.
 */
export default function AgentSettingsForm({ settings, writes, onSaved, newDomains = [], brakes = {} }: {
  settings: AgentSettings; writes: boolean; onSaved: (settings: AgentSettings) => void;
  /** Domains the open-web search kept people on in recent runs (most first). */
  newDomains?: Array<{ domain: string; kept: number }>;
  /** Why and when the brake turned each channel off (agent.channels): shown on the channel's row while it is off. */
  brakes?: Partial<Record<AgentChannelKey, ChannelBrake>>;
}) {
  // The parent remounts this form (key) when saved settings change, so the draft starts from them. Hours saved
  // before the 8–21 limit start inside it.
  const [draft, setDraft] = useState<Draft>(() => {
    const { updatedAt: _updatedAt, version: _version, enabled: _enabled, ...rest } = settings;
    return { ...rest, ...clampSendHours(rest.sendStartHour, rest.sendEndHour) };
  });
  const [newSource, setNewSource] = useState("");
  const [newBlocked, setNewBlocked] = useState("");
  const save = useGtmAction<{ settings: AgentSettings }>();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const signals = draft.signals;
  const setSource = (source: string, patch: Partial<SignalSourceSetting>) => setDraft((current) => ({
    ...current,
    signals: {
      ...current.signals,
      sources: { ...current.signals.sources, [source]: { ...(current.signals.sources[source] ?? defaultSignalSourceSetting(source)), ...patch } },
    },
  }));
  const setChannel = (key: AgentChannelKey, patch: Partial<ChannelSetting>) => setDraft((current) => ({
    ...current, channels: { ...current.channels, [key]: { ...current.channels[key], ...patch } },
  }));
  const setSignals = (patch: Partial<Draft["signals"]>) => setDraft((current) => ({ ...current, signals: { ...current.signals, ...patch } }));
  const warning = agentSenderWarning(draft.senderName, draft.senderEmail);
  const listed = new Set(Object.keys(signals.sources));
  const offered = newDomains.filter((item) => !listed.has(item.domain) && !signals.blockedDomains.includes(item.domain));
  const addSource = (value: string) => {
    const domain = normalizeDomain(value);
    if (!domain) return;
    setSource(domain, { enabled: true });
    setNewSource("");
  };
  const removeSource = (id: string) => setDraft((current) => {
    const sources = { ...current.signals.sources };
    delete sources[id];
    return { ...current, signals: { ...current.signals, sources } };
  });
  const addBlocked = (value: string) => {
    const domain = normalizeDomain(value);
    if (!domain) return;
    setSignals({ blockedDomains: [...new Set([...signals.blockedDomains, domain])] });
    setNewBlocked("");
  };
  // The hours as they will be saved (inside 8–21), and whether that moves what was typed.
  const hours = clampSendHours(draft.sendStartHour, draft.sendEndHour);
  const hoursMoved = hours.startHour !== draft.sendStartHour || hours.endHour !== draft.sendEndHour;
  const submit = async () => {
    const result = await save.run("agent.settings.save", { ...draft, ...hours, version: settings.version } as unknown as Record<string, unknown>);
    if (result) onSaved(result.settings);
  };
  const { start: earliest, end: latest } = SEND_HOURS_LIMIT;
  return (
    <div className="space-y-5">
      {warning ? <p className={opsTheme.errorNotice}>{warning}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="보내는 사람 이름" hint={HINTS.sender}>
          <TextInput value={draft.senderName ?? ""} onChange={(event) => set("senderName", event.target.value || null)} />
        </Field>
        <Field label="보내는 메일 주소" hint={HINTS.sender}>
          <TextInput value={draft.senderEmail ?? ""} onChange={(event) => set("senderEmail", event.target.value || null)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field label="하루 메일 수 (후보·회사 각각)" hint={HINTS.dailyMailCap}>
          <NumberInput value={draft.dailyMailCap} min={0} max={500} onChange={(value) => set("dailyMailCap", value)} />
        </Field>
        <Field label="하루 비용 상한($)" hint={HINTS.dailyCostUsd}>
          <NumberInput value={draft.dailyCostUsd} min={0} max={1000} step={0.5} onChange={(value) => set("dailyCostUsd", value)} />
        </Field>
        <Field label="보내는 요일·시간(한국 시간)" hint={HINTS.hours}>
          <div className="space-y-1.5 text-sm">
          <span className="flex flex-wrap items-center gap-1">
            {WEEKDAYS.map(({ day, label }) => (
              <label key={day} className="mr-1 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.sendWeekdays.includes(day)}
                  onChange={(event) => set("sendWeekdays", event.target.checked
                    ? [...draft.sendWeekdays, day].sort((a, b) => a - b)
                    : draft.sendWeekdays.filter((value) => value !== day))}
                />
                {label}
              </label>
            ))}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-20 shrink-0"><NumberInput value={draft.sendStartHour} min={earliest} max={latest - 1} onChange={(value) => set("sendStartHour", value)} className="w-20" /></span>
            시 ~
            <span className="w-20 shrink-0"><NumberInput value={draft.sendEndHour} min={earliest + 1} max={latest} onChange={(value) => set("sendEndHour", value)} className="w-20" /></span>
            시
          </span>
          {hoursMoved ? (
            <span className="block text-[12px] text-neutral-muted">
              {earliest}시~{latest}시 안에서만 보내서, 저장하면 {hours.startHour}시~{hours.endHour}시로 맞춰요
            </span>
          ) : null}
          </div>
        </Field>
        <Field label="후속 메시지(일 뒤)" hint={HINTS.followupDays}>
          <NumberInput value={draft.followupDays} min={1} max={60} onChange={(value) => set("followupDays", value)} />
        </Field>
        <Field label="끝난 뒤 쉬는 기간(일)" hint={HINTS.quietDays}>
          <NumberInput value={draft.quietDaysAfterEnd} min={0} max={365} onChange={(value) => set("quietDaysAfterEnd", value)} />
        </Field>
      </div>

      <div className="space-y-2 border-t border-neutral-1000-a05 pt-4">
        <span className="flex items-center gap-1 text-[14px] font-semibold">채널<Hint label="채널" text={HINTS.channels} /></span>
        {CHANNEL_GROUPS.map((group, index) => (
          <div key={group.label} className={cx("flex items-start gap-x-4 text-sm", index === CHANNEL_GROUPS.length - 1 && "border-t border-neutral-1000-a05 pt-2")}>
            <span className="flex w-28 shrink-0 items-center gap-1 pt-0.5 text-[12px] text-neutral-muted">{group.label}<Hint label={group.label} text={group.hint} /></span>
            <div className="min-w-0 flex-1 space-y-1">
              {group.keys.map((key) => {
                const setting = draft.channels[key];
                const label = CHANNEL_LABELS[key];
                // The brake's reason while the saved channel is still off; checking it again restarts it on save.
                const brake = !settings.channels[key]?.enabled ? brakes[key] : undefined;
                const reason = brake?.reason ? brake.reason.replace(`${label}: `, "") : null;
                return (
                  <div key={key}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <label className="flex w-44 shrink-0 items-center gap-1.5">
                        <input type="checkbox" checked={setting.enabled} onChange={(event) => setChannel(key, { enabled: event.target.checked })} />
                        {label}
                      </label>
                      {hasDailyMax(key) ? (
                        <span className="flex items-center gap-1 whitespace-nowrap text-[12px]">
                          하루 최대
                          <span className="w-20 shrink-0">
                            <NumberInput
                              value={setting.dailyMax ?? 0} min={CHANNEL_DAILY_MAX_LIMITS.min} max={CHANNEL_DAILY_MAX_LIMITS.max}
                              onChange={(value) => setChannel(key, { dailyMax: clampDailyMax(value) })} className="w-20"
                            />
                          </span>
                          통
                        </span>
                      ) : null}
                    </div>
                    {reason && !setting.enabled ? (
                      <p className="mt-0.5 text-[12px] text-critical">{reason}{brake?.at ? ` · ${formatKst(brake.at)}` : ""}</p>
                    ) : null}
                    {reason && setting.enabled ? (
                      <p className="mt-0.5 text-[12px] text-neutral-muted">저장하면 다시 켜고, 반송·스팸 신고를 이때부터 다시 세요.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-neutral-1000-a05 pt-4 text-sm">
        <span className="flex items-center gap-1 text-[14px] font-semibold">이메일 주소<Hint label="이메일 주소" text={HINTS.addresses} /></span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={signals.vendorLookup} onChange={(event) => setSignals({ vendorLookup: event.target.checked })} />
          treg로 이메일 찾기 (유료 찾기로 못 찾은 사람)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={signals.workAddresses} onChange={(event) => setSignals({ workAddresses: event.target.checked })} />
          지금 회사 메일 주소로도 보내기
        </label>
      </div>

      <div className="space-y-4 border-t border-neutral-1000-a05 pt-4">
        <span className="flex items-center gap-1 text-[14px] font-semibold">검색 관련 설정<Hint label="검색 관련 설정" text={HINTS.search} /></span>

        <div>
          <span className="mb-2 flex items-center gap-1 whitespace-nowrap text-[13px] font-medium">
            1. 기본으로 찾는 곳<Hint label="기본으로 찾는 곳" text={HINTS.sources} />
          </span>
          <div className="space-y-1.5">
            {GROUPS.map((group) => {
              const ids = Object.keys(signals.sources).filter((id) => groupOf(id) === group);
              if (!ids.length) return null;
              return (
                <div key={group} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="w-28 shrink-0 text-[12px] text-neutral-muted">{GROUP_LABEL[group]}</span>
                  {ids.map((id) => (
                    <span key={id} className="flex items-center gap-1.5 whitespace-nowrap">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={signals.sources[id].enabled} onChange={(event) => setSource(id, { enabled: event.target.checked })} />
                        {sourceLabel(id)}
                      </label>
                      {group === "web" ? (
                        <button type="button" aria-label={`${sourceLabel(id)} 빼기`} className={cx(opsTheme.link, "text-[12px]")} onClick={() => removeSource(id)}>×</button>
                      ) : null}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
          <form className="mt-2 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addSource(newSource); }}>
            <span className="w-72 shrink-0"><TextInput value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="도메인 추가 (예: brunch.co.kr)" /></span>
            <Button type="submit" className="whitespace-nowrap" disabled={!normalizeDomain(newSource)}>추가</Button>
          </form>
          {offered.length ? (
            <div className="mt-2">
              <span className="mb-1 flex items-center gap-1 text-[12px] text-neutral-muted">목록 밖 웹에서 새로 찾은 도메인<Hint label="새로 찾은 도메인" text={HINTS.newDomains} /></span>
              <div className="flex flex-wrap gap-2">
                {offered.map((item) => (
                  <span key={item.domain} className="flex items-center gap-1.5 rounded-md bg-bg-weak px-2 py-1 text-[12px]">
                    {item.domain} · {item.kept}명
                    <button type="button" className={opsTheme.link} onClick={() => setSource(item.domain, { enabled: true })}>목록에 넣기</button>
                    <button type="button" className={opsTheme.link} onClick={() => addBlocked(item.domain)}>막기</button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
        <span className="flex items-center gap-1 text-[13px] font-medium">2. 막을 도메인<Hint label="막을 도메인" text={HINTS.blocked} /></span>
        <div className="flex flex-wrap gap-2">
          {signals.blockedDomains.map((domain) => (
            <span key={domain} className="flex items-center gap-1.5 rounded-md bg-bg-weak px-2 py-1 text-[12px]">
              {domain}
              <button type="button" aria-label={`${domain} 빼기`} className={opsTheme.link} onClick={() => setSignals({ blockedDomains: signals.blockedDomains.filter((item) => item !== domain) })}>×</button>
            </span>
          ))}
        </div>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addBlocked(newBlocked); }}>
          <span className="w-72 shrink-0"><TextInput value={newBlocked} onChange={(event) => setNewBlocked(event.target.value)} placeholder="막을 도메인 추가 (예: example.com)" /></span>
          <Button type="submit" className="whitespace-nowrap" disabled={!normalizeDomain(newBlocked)}>추가</Button>
        </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={save.loading} disabled={!writes} onClick={() => void submit()}>설정 저장</Button>
        {!writes ? <span className="text-[12px]">이 서버는 쓰기가 꺼져 있어서 저장할 수 없어요.</span> : null}
        {settings.updatedAt ? <span className="text-[12px] text-neutral-muted">마지막 저장 {formatKst(settings.updatedAt)}</span> : null}
      </div>
      <ErrorNotice message={save.error} />
    </div>
  );
}
