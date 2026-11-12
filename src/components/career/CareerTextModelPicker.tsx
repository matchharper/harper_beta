// career-i18n-skip-file: Internal developer model controls.
import { ChevronDown } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerTextChatModelStore } from "@/store/useCareerTextChatModelStore";
import {
  resolveCareerTextChatModel,
  type CareerTextChatModelId,
} from "@/lib/career/textChatModelConfig";
import {
  CLAUDE_MODEL,
  CLAUDE_HAIKU_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_TERRA_MODEL,
  GPT_61_SOL_MODEL,
  GPT_61_SOL_ULTRAFAST_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
  OPENAI_CHAT_PRESETS,
  getOpenAIChatPreset,
} from "@/lib/llm/modelConfig";

const models = [
  { value: GPT_61_TERRA_MODEL, label: "GPT-6.1 Terra" },
  { value: GPT_61_SOL_MODEL, label: "GPT-6.1 Sol" },
  { value: GPT_61_SOL_ULTRAFAST_MODEL, label: "GPT-6.1 Sol · Ultrafast" },
  { value: GPT_6_LUNA_MODEL, label: "GPT-6 Luna" },
  { value: CLAUDE_MODEL, label: "Sonnet 5.5" },
  { value: CLAUDE_HAIKU_MODEL, label: "Haiku 5.5" },
  { value: OPENROUTER_GLM_53_FLASH_MODEL, label: "GLM 5.3 Flash" },
  { value: OPENROUTER_MUSE_SPARK_13_MODEL, label: "Muse Spark 1.3" },
] as const;

export default function CareerTextModelPicker() {
  const model = useCareerTextChatModelStore((state) => state.model);
  const setModel = useCareerTextChatModelStore((state) => state.setModel);
  const logEvent = useCareerLogEvent();
  const preset = getOpenAIChatPreset(model);
  const family = preset?.tierModel ?? model;
  const label = models.find((option) => option.value === family)?.label;
  const resolved = resolveCareerTextChatModel(model);
  const effort =
    resolved.openAIResponsesReasoningEffort ??
    resolved.chatCompletionReasoningEffort;
  const efforts = OPENAI_CHAT_PRESETS.filter(
    (option) => option.tierModel === family
  );
  function select(value: CareerTextChatModelId) {
    logEvent("click_home_dev_text_model", { model: value });
    setModel(value);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <MuteButton aria-label="Text LLM 선택">
          {label}
          {effort ? ` · ${effort}` : ""}
          <ChevronDown aria-hidden className="size-3.5" />
        </MuteButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[min(360px,calc(100vw-32px))] p-3"
      >
        <fieldset>
          <legend className="mb-2 text-xs text-neutral-muted">Text LLM</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {models.map((option) => (
              <MuteButton
                key={option.value}
                aria-pressed={family === option.value}
                variant={family === option.value ? "dark" : "neutral"}
                className="justify-start whitespace-normal text-left"
                onClick={() =>
                  select(
                    OPENAI_CHAT_PRESETS.find(
                      (p) => p.tierModel === option.value && p.effort === effort
                    )?.id ?? option.value
                  )
                }
              >
                {option.label}
              </MuteButton>
            ))}
          </div>
        </fieldset>
        {effort ? (
          <fieldset className="mt-4">
            <legend className="mb-2 text-xs text-neutral-muted">
              Reasoning effort
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {efforts.length ? (
                efforts.map((option) => (
                  <MuteButton
                    key={option.id}
                    aria-pressed={effort === option.effort}
                    variant={effort === option.effort ? "dark" : "neutral"}
                    onClick={() => select(option.id)}
                  >
                    {option.effort}
                  </MuteButton>
                ))
              ) : (
                <MuteButton aria-pressed disabled variant="neutral">
                  {effort}
                </MuteButton>
              )}
            </div>
          </fieldset>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
