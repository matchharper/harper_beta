import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Typography } from "@/components/ui/typography";
import {
  suggestionBatchSchema,
  type ApplicationSuggestion,
} from "@/lib/career/simulation/suggestionSchema";
import { formatAbsoluteKst } from "./shared";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const text = (value: unknown) => (typeof value === "string" ? value : "");

export type ApplicationSuggestionsDebugRecord = {
  key: string;
  title: string;
  kind: "preview" | "run";
  runId: string;
  model: string;
  at: string;
  durationMs: number | null;
  suggestions: ApplicationSuggestion[] | null;
  input: JsonObject | null;
  prompt: JsonObject | null;
  trace: unknown[];
  error: string;
  artifact: unknown;
};

/** Accept the debugger export and the canonical evaluation runner's outputs.json. */
export function readApplicationSuggestionsDebugRecords(
  value: unknown,
  fileName = "실행 기록"
): ApplicationSuggestionsDebugRecord[] {
  const container = object(value);
  const values = Array.isArray(value)
    ? value
    : Array.isArray(container?.runs)
      ? container.runs
      : [value];
  return values.map((item, index) => {
    const record = object(item);
    const preview = record?.kind === "preview";
    const parsed = suggestionBatchSchema.safeParse(record?.suggestions);
    if (!record || (!preview && !parsed.success)) {
      throw new Error(
        `${fileName}: ${index + 1}번째 항목에 제안 결과가 없습니다.`
      );
    }
    const subject = object(record.subject);
    const role = object(subject?.role);
    const candidate = object(subject?.candidate);
    const title =
      text(record.label) ||
      [
        text(candidate?.name) || text(candidate?.email),
        text(role?.company),
        text(role?.name),
      ]
        .filter(Boolean)
        .join(" · ") ||
      text(record.id) ||
      text(record.runId) ||
      fileName;
    return {
      key: crypto.randomUUID(),
      title,
      kind: preview ? "preview" : "run",
      runId: text(record.runId),
      model: text(record.model),
      at: text(record.startedAt) || text(record.preparedAt),
      durationMs:
        typeof record.durationMs === "number" ? record.durationMs : null,
      suggestions: parsed.success
        ? (record.suggestions as ApplicationSuggestion[])
        : null,
      input: object(record.input),
      prompt: object(record.prompt),
      trace: Array.isArray(record.trace) ? record.trace : [],
      error: text(record.error),
      artifact: item,
    };
  });
}

function RawDetails({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-lg border border-neutral-1000-a10"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-muted">
        {label}
      </summary>
      {open && (
        <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words border-t border-neutral-1000-a05 p-4 text-xs leading-relaxed">
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </details>
  );
}

function SourceText({ title, children }: { title: string; children: string }) {
  return (
    <section className="space-y-3">
      <Typography as="h3" variant="title">
        {title}
      </Typography>
      <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-1000-a10 bg-bg-floating p-4 font-sans text-sm leading-7">
        {children}
      </pre>
    </section>
  );
}

function MessagePreview({
  message,
  index,
}: {
  message: unknown;
  index: number;
}) {
  const value = object(message);
  return (
    <div className="space-y-3">
      {typeof value?.content === "string" ? (
        <SourceText title={`${index + 1}. ${text(value.role) || "message"}`}>
          {value.content}
        </SourceText>
      ) : (
        <RawDetails label={`${index + 1}. 메시지`} value={message} />
      )}
      {value?.tool_calls != null && (
        <RawDetails label="도구 호출" value={value.tool_calls} />
      )}
    </div>
  );
}

function ProviderTrace({ entry, index }: { entry: unknown; index: number }) {
  const [open, setOpen] = useState(false);
  const value = object(entry);
  const request = object(value?.request);
  const response = object(value?.response);
  const messages = Array.isArray(request?.messages)
    ? request.messages
    : Array.isArray(request?.input)
      ? request.input
      : [];
  const choices = Array.isArray(response?.choices) ? response.choices : [];
  const label = [
    `${index + 1}. ${text(value?.endpoint) || "실행 추적"}`,
    typeof value?.status === "number" && `HTTP ${value.status}`,
    typeof value?.durationMs === "number" &&
      `${(value.durationMs / 1000).toFixed(1)}초`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details
      className="rounded-lg border border-neutral-1000-a10"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer break-words px-4 py-3 text-sm">
        {label}
      </summary>
      {open && (
        <div className="space-y-5 border-t border-neutral-1000-a10 p-4">
          {text(value?.error) && (
            <Typography className="text-critical">
              {text(value?.error)}
            </Typography>
          )}
          {messages.length > 0 && (
            <section className="space-y-4">
              <Typography as="h3" variant="title">
                실제 모델 입력
              </Typography>
              {messages.map((message, messageIndex) => (
                <MessagePreview
                  key={messageIndex}
                  message={message}
                  index={messageIndex}
                />
              ))}
            </section>
          )}
          {choices.length > 0 && (
            <section className="space-y-4">
              <Typography as="h3" variant="title">
                모델 응답
              </Typography>
              {choices.map((choice, choiceIndex) => (
                <MessagePreview
                  key={choiceIndex}
                  message={object(choice)?.message ?? choice}
                  index={choiceIndex}
                />
              ))}
            </section>
          )}
          {request?.tools != null && (
            <RawDetails label="실제 도구 정의" value={request.tools} />
          )}
          <RawDetails label="요청·응답 전체 JSON" value={entry} />
        </div>
      )}
    </details>
  );
}

function SuggestionCard({
  suggestion,
  index,
}: {
  suggestion: ApplicationSuggestion;
  index: number;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-neutral-1000-a10 bg-bg-floating">
      <div className="space-y-2 p-4">
        <Typography variant="helper">
          {index + 1} ·{" "}
          {suggestion.kind === "change"
            ? "수정 제안"
            : suggestion.kind === "question"
              ? "질문"
              : "지원 자료"}
        </Typography>
        <Typography as="h3" variant="title">
          {suggestion.title}
        </Typography>
        <Typography
          className="whitespace-pre-wrap break-words"
          variant="description"
        >
          {suggestion.reason}
        </Typography>
      </div>
      {suggestion.kind === "change" &&
        suggestion.edits.map((edit, editIndex) => (
          <section key={editIndex} className="border-t border-neutral-1000-a10">
            <Typography variant="label" className="bg-bg-weak px-4 py-2">
              {edit.target}
            </Typography>
            <div className="grid divide-y divide-neutral-1000-a10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="space-y-2 p-4">
                <Typography variant="helper">원문</Typography>
                <Typography className="whitespace-pre-wrap break-words leading-7">
                  {edit.originalText || "새 내용 추가"}
                </Typography>
              </div>
              <div className="space-y-2 p-4">
                <Typography variant="helper">제안</Typography>
                <Typography className="whitespace-pre-wrap break-words leading-7">
                  {edit.suggestedText || "삭제"}
                </Typography>
              </div>
            </div>
          </section>
        ))}
      {suggestion.kind === "material" && (
        <div className="space-y-2 border-t border-neutral-1000-a10 p-4">
          <Typography variant="label">{suggestion.applicationField}</Typography>
          <Typography className="whitespace-pre-wrap break-words leading-7">
            {suggestion.draftText}
          </Typography>
        </div>
      )}
    </article>
  );
}

export function ApplicationSuggestionsDebugResult({
  record,
}: {
  record: ApplicationSuggestionsDebugRecord;
}) {
  const [tab, setTab] = useState(
    record.kind === "preview" ? "input" : "suggestions"
  );
  const messages = Array.isArray(record.prompt?.messages)
    ? record.prompt.messages
    : [];
  const tools = Array.isArray(record.prompt?.tools) ? record.prompt.tools : [];
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Typography as="h2" variant="section-title">
          {record.title}
        </Typography>
        <Typography variant="helper">
          {[
            record.kind === "preview" ? "입력 미리보기" : "실행 결과",
            record.model,
            record.at && formatAbsoluteKst(record.at),
            record.durationMs !== null &&
              `${(record.durationMs / 1000).toFixed(1)}초`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        {record.runId && (
          <Typography
            variant="code-md"
            className="break-all text-neutral-muted"
          >
            {record.runId}
          </Typography>
        )}
      </div>
      {record.error && (
        <Typography
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-faded p-4 text-critical"
        >
          {record.error}
        </Typography>
      )}
      <Tabs
        activeValue={tab}
        onValueChange={setTab}
        variant="bordered"
        items={[
          ...(record.kind === "run"
            ? [
                {
                  value: "suggestions",
                  label: `제안 ${record.suggestions?.length ?? 0}`,
                },
              ]
            : []),
          { value: "input", label: "입력" },
          { value: "prompt", label: "프롬프트 · 도구" },
          { value: "trace", label: `실행 추적 ${record.trace.length}` },
          { value: "raw", label: "전체 JSON" },
        ]}
      />
      <div role="region" aria-label="선택한 실행 상세" className="space-y-5">
        {tab === "suggestions" &&
          (record.suggestions?.length ? (
            record.suggestions.map((suggestion, index) => (
              <SuggestionCard
                key={index}
                suggestion={suggestion}
                index={index}
              />
            ))
          ) : (
            <Typography variant="description">
              {record.error
                ? "실행이 완료되지 않아 제안 결과가 없습니다."
                : "수정 제안과 질문 없이 완료했습니다."}
            </Typography>
          ))}
        {tab === "input" &&
          (record.input ? (
            <>
              {text(record.input.language) && (
                <Typography variant="helper">
                  응답 언어: {text(record.input.language)}
                </Typography>
              )}
              {(
                [
                  ["resume", "선택한 이력서"],
                  ["candidate", "후보 정보"],
                  ["role", "지원 공고"],
                  ["application", "추가 요구사항"],
                ] as const
              ).map(
                ([key, title]) =>
                  typeof record.input?.[key] === "string" && (
                    <SourceText key={key} title={title}>
                      {record.input[key] as string}
                    </SourceText>
                  )
              )}
            </>
          ) : (
            <Typography variant="description">
              이 파일에는 입력 원문이 포함되어 있지 않습니다.
            </Typography>
          ))}
        {tab === "prompt" &&
          (record.prompt ? (
            <>
              {messages.map((message, index) => (
                <MessagePreview key={index} message={message} index={index} />
              ))}
              <RawDetails label={`도구 정의 ${tools.length}개`} value={tools} />
              <RawDetails
                label="모델·요청 설정"
                value={Object.fromEntries(
                  Object.entries(record.prompt).filter(
                    ([key]) => key !== "messages" && key !== "tools"
                  )
                )}
              />
            </>
          ) : (
            <Typography variant="description">
              이 파일에는 프롬프트가 포함되어 있지 않습니다.
            </Typography>
          ))}
        {tab === "trace" &&
          (record.trace.length ? (
            record.trace.map((entry, index) => (
              <ProviderTrace key={index} entry={entry} index={index} />
            ))
          ) : (
            <Typography variant="description">
              {record.kind === "preview"
                ? "실행 후 실제 모델 요청·응답과 도구 결과를 확인할 수 있습니다."
                : "이 파일에는 실행 추적이 포함되어 있지 않습니다."}
            </Typography>
          ))}
        {tab === "raw" && (
          <RawDetails label="전체 실행 기록" value={record.artifact} />
        )}
      </div>
    </div>
  );
}
