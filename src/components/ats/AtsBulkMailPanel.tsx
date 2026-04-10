import React from "react";
import { Copy, Loader2, Send } from "lucide-react";
import AtsEmailBodyContent from "@/components/ats/AtsEmailBodyContent";
import AtsEmailBodyEditor from "@/components/ats/AtsEmailBodyEditor";
import { ATS_TEMPLATE_VARIABLES } from "@/lib/ats/shared";

type AtsBulkMailPanelProps = {
  body: string;
  buttonPrimaryClassName: string;
  canSend: boolean;
  inputClassName: string;
  onBodyChange: (value: string) => void;
  onCopyVariable: (label: string) => void | Promise<void>;
  onSend: () => void | Promise<void>;
  onSubjectChange: (value: string) => void;
  panelClassName: string;
  previewBody: string;
  previewCandidateName: string;
  previewHasCandidate: boolean;
  previewSubject: string;
  previewVariables: Record<string, string>;
  sendPending: boolean;
  selectedCount: number;
  subject: string;
  textareaClassName: string;
};

export default function AtsBulkMailPanel({
  body,
  buttonPrimaryClassName,
  canSend,
  inputClassName,
  onBodyChange,
  onCopyVariable,
  onSend,
  onSubjectChange,
  panelClassName,
  previewBody,
  previewCandidateName,
  previewHasCandidate,
  previewSubject,
  previewVariables,
  sendPending,
  selectedCount,
  subject,
  textareaClassName,
}: AtsBulkMailPanelProps) {
  return (
    <div className={`${panelClassName} p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-medium text-white">대량 메일 발송</div>
          <div className="mt-1 text-sm text-white/55">
            선택한 후보자 {selectedCount}명에게 직접 메일 발송
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={!canSend || sendPending}
          className={buttonPrimaryClassName}
        >
          {sendPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send Selected
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ATS_TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable.key}
            type="button"
            onClick={() => void onCopyVariable(variable.label)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
          >
            <Copy className="h-3 w-3" />
            {variable.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col">
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-sm font-medium text-white">Subject</div>
            <input
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder="예: {{name}}님께, Harper에서 연락드립니다"
              className={inputClassName}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-white">Body</div>
            <AtsEmailBodyEditor
              value={body}
              onChange={onBodyChange}
              rows={10}
              placeholder="예: {{first_name}}님 안녕하세요..."
              textareaClassName={textareaClassName}
            />
          </div>
        </div>

        <div className="mt-4 rounded-md bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">Preview</div>
            <div className="text-xs text-white/45">{previewCandidateName}</div>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-white/35">Subject</div>
              <div className="mt-2 text-sm text-white/85">
                {previewSubject || "미리보기를 위해 제목을 입력해 주세요."}
              </div>
            </div>
            <div>
              <div className="text-xs text-white/35">Body</div>
              <div className="mt-2">
                <AtsEmailBodyContent
                  body={previewBody}
                  emptyMessage="미리보기를 위해 본문을 입력해 주세요."
                  tone="dark"
                />
              </div>
            </div>
          </div>
          {previewHasCandidate && (
            <div className="mt-4 rounded-md bg-black/10 p-3">
              <div className="mt-3 grid gap-2 text-sm text-white/60">
                {Object.entries(previewVariables).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 w-full"
                  >
                    <div className="text-white/40">{key}</div>
                    <div className="truncate text-right max-w-[600px]">
                      {value || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
