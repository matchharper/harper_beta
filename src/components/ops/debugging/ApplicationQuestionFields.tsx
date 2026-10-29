import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplicationQuestion } from "@/lib/ops/applicationQuestions";

// Only controls with a local input behavior are rendered. Unknown source types stay visible.
const nativeTypes = new Set([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "range",
  "password",
  "search",
]);

function QuestionControl({
  question,
  id,
}: {
  question: ApplicationQuestion;
  id: string;
}) {
  const [uploadMode, setUploadMode] = useState("file");
  const type = question.type.toLowerCase();
  const description = question.instructions ? `${id}-description` : undefined;
  const props = {
    id,
    "aria-label": question.label,
    "aria-describedby": description,
    "aria-required": question.required ?? undefined,
  };
  if (type === "textarea") return <Textarea {...props} rows={4} />;
  if (type === "select" || type === "multiselect") {
    const items = question.options.map((label, index) => ({
      value: String(index),
      label,
    }));
    return (
      <Select
        items={items}
        multiple={type === "multiselect" || question.multiple === true}
        disabled={!items.length}
      >
        <SelectTrigger {...props}>
          <SelectValue placeholder={items.length ? "선택" : "선택지 미확인"} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (type === "radio" || type === "checkbox") {
    if (!question.options.length)
      return <p className="text-sm text-neutral-muted">선택지 미확인</p>;
    return (
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-label={question.label}
        aria-describedby={description}
      >
        {question.options.map((option, index) =>
          type === "radio" ? (
            <Radio key={index} name={id} value={String(index)} label={option} />
          ) : (
            <Checkbox key={index} label={option} />
          )
        )}
      </div>
    );
  }
  if (type === "file" || type === "file-or-url")
    return (
      <div className="space-y-3">
        {type === "file-or-url" && (
          <div
            className="flex gap-5"
            role="group"
            aria-label={`${question.label} 입력 방식`}
          >
            <Radio
              name={`${id}-mode`}
              label="파일"
              value="file"
              checked={uploadMode === "file"}
              onChange={() => setUploadMode("file")}
            />
            <Radio
              name={`${id}-mode`}
              label="URL"
              value="url"
              checked={uploadMode === "url"}
              onChange={() => setUploadMode("url")}
            />
          </div>
        )}
        {type === "file-or-url" && uploadMode === "url" ? (
          <Input {...props} key="url" type="url" />
        ) : (
          <Input
            {...props}
            key="file"
            type="file"
            accept={question.fileTypes.join(",") || undefined}
            multiple={question.multiple === true}
          />
        )}
        {!!question.fileTypes.length && (
          <p className="text-xs text-neutral-muted">
            {question.fileTypes.join(", ")}
          </p>
        )}
      </div>
    );
  if (nativeTypes.has(type))
    return <Input {...props} type={type} autoComplete="off" />;
  return (
    <Input
      {...props}
      disabled
      placeholder="이 입력 유형은 미리보기를 지원하지 않습니다."
    />
  );
}

export function ApplicationQuestionFields({
  questions,
}: {
  questions: Array<ApplicationQuestion | string>;
}) {
  const prefix = useId();
  return (
    <section aria-label="지원 양식 미리보기" className="max-w-3xl space-y-6">
      <p className="text-xs text-neutral-muted">
        미리보기 · 입력한 내용과 파일은 저장하거나 제출하지 않습니다.
      </p>
      {questions.map((raw, index) => {
        // Existing in-memory results from before the typed-field contract can still be read.
        const question: ApplicationQuestion =
          typeof raw === "string"
            ? {
                label: raw,
                type: "unknown",
                required: null,
                options: [],
                fileTypes: [],
                multiple: null,
                instructions: "",
              }
            : raw;
        const id = `${prefix}-${index}`;
        const standaloneCheckbox =
          question.type.toLowerCase() === "checkbox" &&
          !question.options.length;
        const meta = `${question.type} · ${question.required === null ? "필수 여부 미확인" : question.required ? "필수" : "선택"}`;
        return (
          <fieldset key={id} className="min-w-0 space-y-2 border-0 p-0">
            {!standaloneCheckbox && (
              <legend className="mb-2 text-sm font-medium whitespace-pre-wrap">
                {index + 1}. {question.label}
              </legend>
            )}
            {standaloneCheckbox && (
              <Checkbox
                id={id}
                label={`${index + 1}. ${question.label}`}
                aria-describedby={
                  question.instructions ? `${id}-description` : undefined
                }
                aria-required={question.required ?? undefined}
              />
            )}
            <p className="text-xs text-neutral-muted">{meta}</p>
            {!standaloneCheckbox && (
              <QuestionControl question={question} id={id} />
            )}
            {question.instructions && (
              <details className="text-sm text-neutral-muted">
                <summary className="cursor-pointer">입력 안내</summary>
                <p
                  id={`${id}-description`}
                  className="whitespace-pre-wrap pt-2"
                >
                  {question.instructions}
                </p>
              </details>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
