import { useState, type ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { normalizeDomain, signalSourceInfo, type SignalSourceGroup } from "@/lib/gtmPlays/agent/signals";
import {
  SIGNAL_TUNING_LABELS, SIGNAL_TUNING_LIMITS, defaultSignalSourceSetting, signalTuningVersion, tuningOf,
  type SignalSourceSetting, type SignalTuning,
} from "@/lib/gtmPlays/agent/tuning";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import { formatKst, useGtmAction } from "../api";
import { Button, ErrorNotice, Hint, TextArea, TextInput } from "../ui";
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
  enabled: "끄면 에이전트가 사람을 찾지도, 연락하지도 않아요. 긴급 중지도 이걸 꺼요.",
  sender: "에이전트 메일의 보내는 사람이에요. 답장도 이 주소로 와요.",
  dailyMailCap: "하루(한국 시간)에 에이전트가 보내는 메일 수 상한이에요. 넘으면 다음 날 보내요.",
  dailyCostUsd: "하루에 쓰는 비용(검색·이메일 찾기·글쓰기) 상한이에요. 닿으면 그날 실행을 멈춰요.",
  hours: "평일 9~21시, 하루 한도를 그 시간에 고르게 나눠 보내요(기본값). 메일은 고른 요일·시간(한국 시간)에만 나가요. 5분마다 남은 한도를 남은 시간에 나눠 조금씩 보내고, 매일 같은 시각에 몰리지 않게 가끔 무작위로 한 번씩 쉬어요. 신호(구직 글·프로필·지원)가 최근인 사람부터 보내고, 신호 뒤 24시간이 다음 보낼 때 전에 지나는 사람은 바로 보내요. 시간 밖이면 초안까지만 만들고 기다려요.",
  followupDays: "연락 뒤 반응이 없으면 이만큼 지나서 후속 메시지를 1번 보내요. 그래도 없으면 끝내요.",
  quietDays: "끝난 사람에게는 이만큼 동안 다시 연락하지 않아요. 그 뒤 새 글을 올리면 다시 대상이 돼요.",
  sources: "켠 곳은 실행마다 찾아요. 처음 목록 말고도 도메인을 직접 추가할 수 있어요. 소스별 인원 제한은 없고, 아래 검색 예산 비율과 찾는 기준만큼 찾아요. 링크드인 지원자 파일은 따로 올려요.",
  tuning: "찾을 사람·남길 기준은 에이전트 검색·판정에 그대로 들어가는 안내 글이에요(없는 사실 지어내지 않기, 개인만, 구직 중이라고 쓴 사람만 같은 고정 규칙은 바꿀 수 없어요). 숫자는 최소 점수·최근 며칠 글·한 번에 쓸 돈·검색 라운드·검색당 결과 수예요. 저장하면 검색 버전이 바뀌고, 찾은 사람마다 어느 버전으로 찾았는지 남아요.",
  explore: "검색 예산을 1(기본으로 찾는 곳)과 2(그 밖의 웹)에 나누는 비율이에요. 20%면 예산의 80%는 기본으로 찾는 곳(켠 곳끼리 똑같이 나눠요)에, 20%는 그 밖의 웹에 써요. 0%면 기본으로 찾는 곳만, 100%면 그 밖의 웹만 찾아요.",
  blocked: "여기 적은 도메인은 어느 소스에서도 검색하지도, 남기지도 않아요. 한 줄에 하나씩 적어요.",
  newDomains: "열린 웹 검색에서 사람을 찾은 새 도메인이에요(최근 실행). 넣으면 그 도메인만 찾는 소스가 생겨요.",
} as const;

type Draft = Omit<AgentSettings, "updatedAt" | "version">;

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

/** One source's search tuning: the two guidance texts and the numbers, with its version. */
function TuningFields({ source, tuning, onChange }: { source: string; tuning: SignalTuning; onChange: (patch: Partial<SignalTuning>) => void }) {
  const L = SIGNAL_TUNING_LIMITS;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-bg-weak px-3 py-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[12px] text-neutral-muted">{SIGNAL_TUNING_LABELS.lookFor}
          <TextArea rows={2} maxLength={L.textChars} value={tuning.lookFor} onChange={(event) => onChange({ lookFor: event.target.value })} placeholder="예: 3~8년 차 백엔드·데이터 엔지니어, 서울" />
        </label>
        <label className="block text-[12px] text-neutral-muted">{SIGNAL_TUNING_LABELS.keepRule}
          <TextArea rows={2} maxLength={L.textChars} value={tuning.keepRule} onChange={(event) => onChange({ keepRule: event.target.value })} placeholder="예: 커리어 조언 글은 빼고, 본인이 지금 구직 중이라고 쓴 글만" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-[12px] text-neutral-muted">
        <label>{SIGNAL_TUNING_LABELS.minScore}<NumberInput value={tuning.minScore} min={L.minScore.min} max={L.minScore.max} onChange={(value) => onChange({ minScore: value })} className="w-20" /></label>
        <label>{SIGNAL_TUNING_LABELS.maxAgeDays}<NumberInput value={tuning.maxAgeDays} min={L.maxAgeDays.min} max={L.maxAgeDays.max} onChange={(value) => onChange({ maxAgeDays: value })} className="w-20" /></label>
        <label>{SIGNAL_TUNING_LABELS.budgetUsd}<NumberInput value={tuning.budgetUsd} min={L.budgetUsd.min} max={L.budgetUsd.max} step={0.05} onChange={(value) => onChange({ budgetUsd: value })} className="w-20" /></label>
        <label>{SIGNAL_TUNING_LABELS.maxRounds}<NumberInput value={tuning.maxRounds} min={L.maxRounds.min} max={L.maxRounds.max} onChange={(value) => onChange({ maxRounds: value })} className="w-16" /></label>
        <label>{SIGNAL_TUNING_LABELS.resultsPerSearch}<NumberInput value={tuning.resultsPerSearch} min={L.resultsPerSearch.min} max={L.resultsPerSearch.max} onChange={(value) => onChange({ resultsPerSearch: value })} className="w-16" /></label>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-neutral-primary">
          <input type="checkbox" checked={tuning.layoffSearch} onChange={(event) => onChange({ layoffSearch: event.target.checked })} />
          {SIGNAL_TUNING_LABELS.layoffSearch}
        </label>
        <span className="pb-2">검색 버전 {signalTuningVersion(source, tuning)}</span>
      </div>
    </div>
  );
}

/**
 * #5 설정: everything the agent runs with, saved together as the next version: the sender, caps and hours, and 사람
 * 찾기 in three parts (Shaun 11/17): 1. 기본으로 찾는 곳 (the default list plus domains Ops adds, each on/off with its
 * search tuning), 2. 그 밖의 웹 (the open web), 3. 막을 도메인; the open-web share splits the search budget 1 vs 2.
 */
export default function AgentSettingsForm({ settings, writes, onSaved, newDomains = [] }: {
  settings: AgentSettings; writes: boolean; onSaved: (settings: AgentSettings) => void;
  /** Domains the open-web search kept people on in recent runs (most first). */
  newDomains?: Array<{ domain: string; kept: number }>;
}) {
  // The parent remounts this form (key) when saved settings change, so the draft starts from them.
  const [draft, setDraft] = useState<Draft>(() => {
    const { updatedAt: _updatedAt, version: _version, ...rest } = settings;
    return rest;
  });
  const [open, setOpen] = useState<string | null>(null);
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
  const submit = async () => {
    const result = await save.run("agent.settings.save", draft as unknown as Record<string, unknown>);
    if (result) onSaved(result.settings);
  };
  return (
    <div className="space-y-5">
      {warning ? <p className={opsTheme.errorNotice}>{warning}</p> : null}
      <div className="flex flex-wrap items-center gap-6 text-sm">
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
            <span className="w-20 shrink-0"><NumberInput value={draft.sendStartHour} min={0} max={23} onChange={(value) => set("sendStartHour", value)} className="w-20" /></span>
            시 ~
            <span className="w-20 shrink-0"><NumberInput value={draft.sendEndHour} min={1} max={24} onChange={(value) => set("sendEndHour", value)} className="w-20" /></span>
            시
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

      <div className="space-y-1">
        <span className="flex items-center gap-1 text-[13px] font-medium">검색 예산 나누기<Hint label="검색 예산 나누기" text={HINTS.explore} /></span>
        <p className="flex flex-wrap items-center gap-1 text-[12px] text-neutral-muted">
          기본으로 찾는 곳 {100 - Math.round(signals.exploreShare * 100)}% · 그 밖의 웹
          <NumberInput value={Math.round(signals.exploreShare * 100)} min={0} max={100} step={5} onChange={(value) => setSignals({ exploreShare: Math.min(1, Math.max(0, value / 100)) })} className="w-20" />
          %
        </p>
      </div>

      <div>
        <span className="mb-1 flex items-center gap-1 text-[13px] font-medium">1. 기본으로 찾는 곳<Hint label="기본으로 찾는 곳" text={HINTS.sources} /><Hint label="찾는 기준" text={HINTS.tuning} /></span>
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const ids = Object.keys(signals.sources).filter((id) => groupOf(id) === group);
            if (!ids.length) return null;
            return (
              <div key={group}>
                <p className="mb-1 text-[12px] text-neutral-muted">{GROUP_LABEL[group]}</p>
                <div className="space-y-1">
                  {ids.map((id) => {
                    const setting = signals.sources[id];
                    return (
                      <div key={id} className="text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex w-40 items-center gap-2">
                            <input type="checkbox" checked={setting.enabled} onChange={(event) => setSource(id, { enabled: event.target.checked })} />
                            {sourceLabel(id)}
                          </label>
                          <button type="button" className={cx(opsTheme.link, "text-[12px]")} onClick={() => setOpen(open === id ? null : id)}>
                            {open === id ? "찾는 기준 접기" : "찾는 기준"}
                          </button>
                          {setting.lookFor || setting.keepRule ? <span className="text-[11px] text-neutral-muted">안내 글 있음</span> : null}
                          {group === "web" ? <button type="button" className={cx(opsTheme.link, "text-[12px]")} onClick={() => removeSource(id)}>빼기</button> : null}
                        </div>
                        {open === id ? <TuningFields source={id} tuning={tuningOf(setting)} onChange={(patch) => setSource(id, patch)} /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <form className="mt-2 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addSource(newSource); }}>
          <TextInput value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="도메인 추가 (예: brunch.co.kr)" className="w-64" />
          <Button type="submit" className="whitespace-nowrap" disabled={!normalizeDomain(newSource)}>추가</Button>
        </form>
      </div>

      <div className="space-y-2">
        <span className="flex items-center gap-1 text-[13px] font-medium">2. 그 밖의 웹<Hint label="그 밖의 웹" text={HINTS.explore} /></span>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-muted">
          위 목록 밖의 웹 전체에서 찾아요(막을 도메인 제외).
          <button type="button" className={cx(opsTheme.link, "text-[12px]")} onClick={() => setOpen(open === "explore" ? null : "explore")}>
            {open === "explore" ? "찾는 기준 접기" : "찾는 기준"}
          </button>
        </div>
        {open === "explore" ? <TuningFields source="explore" tuning={signals.explore} onChange={(patch) => setSignals({ explore: { ...signals.explore, ...patch } })} /> : null}
        {offered.length ? (
          <div>
            <span className="mb-1 flex items-center gap-1 text-[12px] text-neutral-muted">여기서 새로 찾은 도메인<Hint label="새로 찾은 도메인" text={HINTS.newDomains} /></span>
            <div className="flex flex-wrap gap-2">
              {offered.map((item) => (
                <span key={item.domain} className="flex items-center gap-1.5 rounded-md bg-bg-weak px-2 py-1 text-[12px]">
                  {item.domain} · {item.kept}명
                  <button type="button" className={opsTheme.link} onClick={() => setSource(item.domain, { enabled: true })}>기본으로 찾는 곳에 넣기</button>
                  <button type="button" className={opsTheme.link} onClick={() => addBlocked(item.domain)}>막기</button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <span className="flex items-center gap-1 text-[13px] font-medium">3. 막을 도메인<Hint label="막을 도메인" text={HINTS.blocked} /></span>
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
          <TextInput value={newBlocked} onChange={(event) => setNewBlocked(event.target.value)} placeholder="막을 도메인 추가 (예: example.com)" className="w-64" />
          <Button type="submit" className="whitespace-nowrap" disabled={!normalizeDomain(newBlocked)}>추가</Button>
        </form>
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
