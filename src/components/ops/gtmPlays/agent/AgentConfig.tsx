import { createContext, useContext, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  CONFIG_GROUP_LABEL, agentConfigChanges, agentConfigEntries, configLabel, configStartLabel, onlyCodeChanged, previousConfig,
  shortConfigId,
  type AgentConfig, type AgentConfigGroup, type ConfigWords,
} from "@/lib/gtmPlays/agent/config";
import { sourceLabel, weekdaysLabel } from "./labels";

/** The screen's own words in a 설정 묶음 (place names, send days). */
export const CONFIG_WORDS: ConfigWords = { source: sourceLabel, weekdays: weekdaysLabel };

/** Every 설정 묶음 (agent.configs), loaded once by the #5 tab for the log and 하루별 성능. */
export const AgentConfigsContext = createContext<readonly AgentConfig[]>([]);

export const useAgentConfigs = () => useContext(AgentConfigsContext);

/** What changed from the 설정 묶음 used just before, as lines ("최소 점수: 50점 → 60점"). */
export function configChangesOf(configs: readonly AgentConfig[], config: AgentConfig) {
  const previous = previousConfig(configs, config.id);
  return { previous, changes: agentConfigChanges(previous?.snapshot ?? null, config.snapshot, CONFIG_WORDS) };
}

/** "#3fa9c · 11/18부터" for a select. */
export const configOptionLabel = (config: AgentConfig) => `${shortConfigId(config.id)} · ${configStartLabel(config.firstUsedAt)}부터`;

const GROUPS = Object.keys(CONFIG_GROUP_LABEL) as AgentConfigGroup[];

/** What a 설정 묶음 contained, by group, and what changed from the one before it. */
function ConfigDetail({ config, configs }: { config: AgentConfig; configs: readonly AgentConfig[] }) {
  const entries = agentConfigEntries(config.snapshot, CONFIG_WORDS);
  const { previous, changes } = configChangesOf(configs, config);
  return (
    <div className={cx(opsTheme.panelMuted, "mt-1 space-y-3 px-3 py-2 text-[12px]")}>
      <div>
        <p className="mb-1 font-medium text-neutral-muted">
          {previous ? `바로 전 설정 묶음(${shortConfigId(previous.id)})과 달라진 것` : "처음 쓴 설정 묶음이에요"}
        </p>
        {previous ? (
          onlyCodeChanged(changes) ? <p>설정은 그대로이고 프로그램만 새로 배포됐어요 ({changes[0].text}).</p>
            : changes.length ? <ul className="space-y-0.5">{changes.map((change) => <li key={change.key} className="break-words">{change.text}</li>)}</ul>
              : <p>달라진 것이 없어요.</p>
        ) : null}
      </div>
      {GROUPS.map((group) => {
        const lines = entries.filter((entry) => entry.group === group);
        if (!lines.length) return null;
        return (
          <div key={group}>
            <p className="mb-1 font-medium text-neutral-muted">{CONFIG_GROUP_LABEL[group]}</p>
            <dl className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {lines.map((entry) => (
                <div key={entry.key} className="contents">
                  <dt className="text-neutral-muted">{entry.label}</dt>
                  <dd className="min-w-0 whitespace-pre-line break-words">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

/**
 * "설정 묶음 #3fa9c (11/18부터)" with a button that opens what it contained and what changed from the one before.
 * `what`: which step it was ("찾을 때", "메일 쓸 때") when a person has two. Nothing for rows from before 설정 묶음 were kept.
 */
export function ConfigLine({ id, what }: { id: string | null | undefined; what?: string }) {
  const configs = useAgentConfigs();
  const [open, setOpen] = useState(false);
  if (!id) return null;
  const config = configs.find((item) => item.id === id) ?? null;
  return (
    <div className="text-[12px]">
      <p className="text-neutral-muted">
        {what ? `${what} ` : ""}{config ? configLabel(config) : `설정 묶음 ${shortConfigId(id)}`}
        {config ? (
          <button type="button" aria-expanded={open} className={cx(opsTheme.link, "ml-2")} onClick={() => setOpen(!open)}>
            {open ? "접기" : "무엇이 들어 있나"}
          </button>
        ) : null}
      </p>
      {open && config ? <ConfigDetail config={config} configs={configs} /> : null}
    </div>
  );
}
