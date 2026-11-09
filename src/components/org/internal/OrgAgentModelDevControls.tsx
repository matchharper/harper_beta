import { getSolChatPreset } from "@/lib/llm/modelConfig";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  isOrgAgentModelId,
  ORG_AGENT_MODEL_IDS,
} from "@/lib/org/agent/modelConfig";
import {
  readOrgAgentModelPreference,
  saveOrgAgentModelPreference,
} from "@/lib/org/agent/modelPreference";

export function OrgAgentModelDevControls() {
  const { c } = useOrgLocale();
  const [model, setModel] =
    useState<ReturnType<typeof readOrgAgentModelPreference>>(null);
  const label = c("회사 채팅 모델", "Company chat model");
  const options = [
    { value: "default", label: c("기본 모델", "Default model") },
    ...ORG_AGENT_MODEL_IDS.map((value) => ({
      value,
      label: getSolChatPreset(value)?.label ?? value,
    })),
  ];

  return (
    <details
      className="mt-4 border-t border-stroke-subtle pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) setModel(readOrgAgentModelPreference());
      }}
    >
      <summary className="cursor-pointer text-xs text-neutral-muted">
        Dev Controls
      </summary>
      <label className="mt-3 grid gap-1.5 text-xs text-neutral-muted">
        {label}
        <Select
          items={options}
          value={model ?? "default"}
          onValueChange={(value) => {
            if (value !== "default" && !isOrgAgentModelId(value)) return;
            const selected = value === "default" ? null : value;
            saveOrgAgentModelPreference(selected);
            setModel(selected);
          }}
        >
          <SelectTrigger aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    </details>
  );
}
