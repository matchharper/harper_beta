import { useState, type ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { clampSendHours, SEND_HOURS_LIMIT } from "@/lib/gtmPlays/agent/people";
import { normalizeDomain, signalSourceInfo, type SignalSourceGroup } from "@/lib/gtmPlays/agent/signals";
import { defaultSignalSourceSetting, type SignalSourceSetting } from "@/lib/gtmPlays/agent/tuning";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
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
  dailyMailCap: "하루(한국 시간)에 보내는 메일 수예요. 후보에게 가는 첫 메일과 후속 메일을 합쳐 이만큼, 회사 메일도 따로 이만큼 보내요. 넘으면 다음 날 보내요. Ashley 답장은 세지 않고, 한 사람·한 회사에 하루 한 통까지만 보내요.",
  dailyCostUsd: "하루에 쓰는 돈(사람 찾기 검색·이메일 찾기·공고 고르기·첫 메일과 회사 메일 쓰기)의 상한이에요. Ashley 답장에 드는 돈은 넣지 않아요. 닿으면 그날은 멈춰요.",
  hours: "메일은 고른 요일·시간(한국 시간)에만 나가요. 시간은 8시~21시 안에서만 고를 수 있어요(밤 9시~아침 8시에 보내는 광고성 메일은 받는 사람에게 따로 동의를 받아야 해서 보내지 않아요). 하루 메일 수를 그 시간 동안 고르게 나눠 조금씩 보내고, 최근에 구직 글을 올리거나 지원한 사람부터 보내요. 새 사람 찾기와 메일 쓰기도 고른 요일에만 해요.",
  followupDays: "메일을 보낸 뒤 반응이 없으면 이만큼 지나서 후속 메일을 한 번 보내요. 그래도 없으면 끝내요.",
  quietDays: "끝난 사람에게는 이 기간 동안 다시 연락하지 않아요.",
  search: "에이전트가 사람을 어디서 찾을지 정해요. 링크드인 지원자 파일은 위에서 따로 올려요.",
  sources: "체크한 곳과 목록 밖 웹에서 실행마다 사람을 찾아요. 아래 칸에 도메인을 직접 추가할 수 있어요. 검색 예산은 에이전트가 매일 지난 결과를 보고 나눠요. 곳마다 인원 제한은 없어요.",
  blocked: "여기 넣은 도메인에서는 검색하지도, 사람을 남기지도 않아요.",
  newDomains: "목록 밖 웹에서 사람을 찾은 새 도메인이에요(최근 실행). '목록에 넣기'를 누르면 1번 목록에 들어가고, '막기'를 누르면 2번에 들어가요.",
} as const;

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
export default function AgentSettingsForm({ settings, writes, onSaved, newDomains = [] }: {
  settings: AgentSettings; writes: boolean; onSaved: (settings: AgentSettings) => void;
  /** Domains the open-web search kept people on in recent runs (most first). */
  newDomains?: Array<{ domain: string; kept: number }>;
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
          <span className="block text-[12px] text-neutral-muted">
            {earliest}시~{latest}시 안에서만 보내요{hoursMoved ? ` · 저장하면 ${hours.startHour}시~${hours.endHour}시로 맞춰요` : ""}
          </span>
          </div>
        </Field>
        <Field label="후속 메시지(일 뒤)" hint={HINTS.followupDays}>
          <NumberInput value={draft.followupDays} min={1} max={60} onChange={(value) => set("followupDays", value)} />
        </Field>
        <Field label="끝난 뒤 쉬는 기간(일)" hint={HINTS.quietDays}>
          <NumberInput value={draft.quietDaysAfterEnd} min={0} max={365} onChange={(value) => set("quietDaysAfterEnd", value)} />
        </Field>
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
          {!signals.blockedDomains.length ? <span className="text-[12px] text-neutral-muted">없음</span> : null}
        </div>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addBlocked(newBlocked); }}>
          <span className="w-72 shrink-0"><TextInput value={newBlocked} onChange={(event) => setNewBlocked(event.target.value)} placeholder="막을 도메인 추가 (예: example.com)" /></span>
          <Button type="submit" className="whitespace-nowrap" disabled={!normalizeDomain(newBlocked)}>추가</Button>
        </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={save.loading} disabled={!writes} onClick={() => void submit()}>설정 저장</Button>
        <span className="text-[12px] text-neutral-muted">
          {writes ? "저장하면 다음 실행부터 적용돼요." : "이 서버는 쓰기가 꺼져 있어서 저장할 수 없어요."}
          {settings.updatedAt ? ` 마지막 저장 ${formatKst(settings.updatedAt)} · 설정 v${settings.version}` : ""}
        </span>
      </div>
      <ErrorNotice message={save.error} />
    </div>
  );
}
